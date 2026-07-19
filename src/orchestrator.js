import path from 'path';
import cron from 'node-cron';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { generateStory } from './pipeline/storyGenerator.js';
import { generateVoice } from './pipeline/ttsGenerator.js';
import { assembleVideo } from './pipeline/videoAssembler.js';
import { uploadToYouTube, fetchVideoMetrics } from './pipeline/youtubeUploader.js';
import { addToHistory, recordPerformance, getHistory } from './utils/store.js';

/**
 * Corre o ciclo completo UMA vez: ideia -> voz -> video -> publicacao.
 */
export async function runFullCycle() {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(config.paths.outputDir, runId);

  try {
    logger.info('=========================================');
    logger.info(`Novo ciclo iniciado: ${runId}`);

    // 1. Ideia + historia
    const story = await generateStory();

    // 2. Voz
    const { audioPath, words } = await generateVoice(story.script, outputDir);

    // 3. Video (montagem: fundo + legendas + narracao + musica)
    const videoPath = await assembleVideo({ audioPath, words, outputDir, imagePrompt: story.imagePrompt });

    // 4. Publicacao
    const description = `${story.description}\n\n${story.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ')}`;
    const youtubeId = await uploadToYouTube({
      videoPath,
      title: story.title,
      description,
      tags: story.tags,
    });

    // 5. Guardar no historico (para nao repetir temas e para o loop de aprendizagem)
    addToHistory({
      runId,
      theme: story.theme,
      title: story.title,
      youtubeId,
    });

    logger.info(`Ciclo concluido com sucesso. Video: https://youtube.com/shorts/${youtubeId}`);
    return { success: true, youtubeId };
  } catch (err) {
    logger.error('Ciclo falhou:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Loop de aprendizagem: revisita videos publicados ha mais de 48h,
 * recolhe metricas reais, e guarda para o storyGenerator usar na proxima escolha de tema.
 */
export async function runLearningLoop() {
  logger.info('A correr loop de aprendizagem (recolha de metricas)...');
  const history = getHistory();
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;

  const candidates = history.videos.filter(v => new Date(v.createdAt).getTime() < cutoff);

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

/**
 * Modo agendado: corre X vezes por dia (config.channel.videosPerDay),
 * distribuido ao longo do dia, mais uma recolha diaria de metricas.
 */
function startScheduler() {
  const perDay = config.channel.videosPerDay;
  const hours = distributeHoursAcrossDay(perDay);

  hours.forEach(hour => {
    const cronExpr = `0 ${hour} * * *`;
    cron.schedule(cronExpr, () => runFullCycle(), { timezone: config.channel.timezone });
    logger.info(`Agendado: 1 video por dia as ${hour}:00 (${config.channel.timezone})`);
  });

  // Recolha de metricas uma vez por dia, de madrugada
  cron.schedule('0 4 * * *', () => runLearningLoop(), { timezone: config.channel.timezone });

  logger.info(`Scheduler ativo. ${perDay} video(s)/dia. Sistema 100% autonomo em execucao.`);
}

function distributeHoursAcrossDay(count) {
  // Distribui uniformemente entre 9h e 21h (horas de maior atividade tipica da audiencia)
  const start = 9;
  const end = 21;
  if (count <= 1) return [start];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(start + i * step));
}

// ---- Entry point ----
const isOnce = process.argv.includes('--once');

if (isOnce) {
  runFullCycle().then(() => process.exit(0));
} else {
  startScheduler();
}
