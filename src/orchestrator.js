import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { generateStory } from './pipeline/storyGenerator.js';
import { generateVoice } from './pipeline/ttsGenerator.js';
import { assembleVideo } from './pipeline/videoAssembler.js';
import { uploadToYouTube, fetchVideoMetrics } from './pipeline/youtubeUploader.js';
import { addToHistory, updateHistoryEntry, getHistory, getRunById, recordPerformance } from './utils/store.js';

/**
 * Gera o conteudo completo (historia -> voz -> video) mas NAO publica.
 * Fica guardado como "draft" para revisares na dashboard antes de decidires publicar.
 */
export async function generateContent() {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(config.paths.outputDir, runId);

  addToHistory({ runId, status: 'generating' });

  try {
    logger.info('=========================================');
    logger.info(`Nova geracao iniciada: ${runId}`);

    const story = await generateStory();
    updateHistoryEntry(runId, { status: 'generating_voice', theme: story.theme, title: story.title, story });

    const { audioPath, words } = await generateVoice(story.script, outputDir);
    updateHistoryEntry(runId, { status: 'generating_video' });

    const videoPath = await assembleVideo({ audioPath, words, outputDir, imagePrompt: story.imagePrompt });

    updateHistoryEntry(runId, {
      status: 'draft',
      videoPath,
      audioPath,
      outputDir,
    });

    logger.info(`Geracao concluida: ${runId} (draft pronto para revisao)`);
    return { success: true, runId };
  } catch (err) {
    logger.error('Geracao falhou:', err.message);
    updateHistoryEntry(runId, { status: 'failed', error: err.message });
    return { success: false, runId, error: err.message };
  }
}

/**
 * Publica um draft ja existente no YouTube.
 */
export async function publishRun(runId) {
  const run = getRunById(runId);
  if (!run) throw new Error(`Run ${runId} nao encontrado`);
  if (run.status !== 'draft') throw new Error(`Run ${runId} nao esta em estado "draft" (esta em "${run.status}")`);
  if (!run.videoPath || !fs.existsSync(run.videoPath)) throw new Error(`Video do run ${runId} nao existe em disco`);

  updateHistoryEntry(runId, { status: 'publishing' });

  try {
    const story = run.story;
    const description = `${story.description}\n\n${story.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ')}`;

    const youtubeId = await uploadToYouTube({
      videoPath: run.videoPath,
      title: story.title,
      description,
      tags: story.tags,
    });

    updateHistoryEntry(runId, { status: 'published', youtubeId, publishedAt: new Date().toISOString() });
    logger.info(`Publicado: https://youtube.com/shorts/${youtubeId}`);
    return { success: true, youtubeId };
  } catch (err) {
    logger.error('Publicacao falhou:', err.message);
    updateHistoryEntry(runId, { status: 'draft', error: err.message });
    throw err;
  }
}

/**
 * Ciclo completo automatico: gera E publica de imediato (usado no modo agendado 100% autonomo).
 */
export async function runFullCycle() {
  const gen = await generateContent();
  if (!gen.success) return gen;
  try {
    const pub = await publishRun(gen.runId);
    return { success: true, runId: gen.runId, youtubeId: pub.youtubeId };
  } catch (err) {
    return { success: false, runId: gen.runId, error: err.message };
  }
}

export async function runLearningLoop() {
  logger.info('A correr loop de aprendizagem (recolha de metricas)...');
  const history = getHistory();
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;

  const candidates = history.videos.filter(
    v => v.status === 'published' && v.youtubeId && new Date(v.publishedAt || v.createdAt).getTime() < cutoff
  );

  for (const video of candidates) {
    try {
      const metrics = await fetchVideoMetrics(video.youtubeId);
      recordPerformance(video.youtubeId, metrics);
      logger.info(`Metricas guardadas para "${video.title}": ${JSON.stringify(metrics)}`);
    } catch (err) {
      logger.warn(`Falha a obter metricas de ${video.youtubeId}:`, err.message);
    }
  }
}

function startScheduler(autoPublish) {
  const perDay = config.channel.videosPerDay;
  const hours = distributeHoursAcrossDay(perDay);

  hours.forEach(hour => {
    const cronExpr = `0 ${hour} * * *`;
    cron.schedule(cronExpr, () => (autoPublish ? runFullCycle() : generateContent()), {
      timezone: config.channel.timezone,
    });
    logger.info(`Agendado: 1 video por dia as ${hour}:00 (${config.channel.timezone}) — ${autoPublish ? 'publica automaticamente' : 'so gera, fica em draft'}`);
  });

  cron.schedule('0 4 * * *', () => runLearningLoop(), { timezone: config.channel.timezone });
  logger.info(`Scheduler ativo. ${perDay} video(s)/dia.`);
}

function distributeHoursAcrossDay(count) {
  const start = 9;
  const end = 21;
  if (count <= 1) return [start];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(start + i * step));
}

// ---- Entry point (uso via linha de comandos; a dashboard usa as funcoes diretamente) ----
const isOnce = process.argv.includes('--once');
const autoPublish = process.argv.includes('--auto-publish');
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  if (isOnce) {
    (autoPublish ? runFullCycle() : generateContent()).then(() => process.exit(0));
  } else {
    startScheduler(autoPublish);
  }
}
