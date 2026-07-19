import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getSettings, CAPTION_STYLE_CATALOG, CAPTION_POSITION_CATALOG, VISUAL_STYLE_CATALOG } from '../utils/settings.js';

// Usa o binario de ffmpeg embutido pelo pacote "ffmpeg-static" em vez de depender
// de o utilizador ter o ffmpeg instalado e configurado no PATH do sistema.
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
} else {
  logger.warn('ffmpeg-static nao encontrou um binario para este sistema operativo. A tentar usar o ffmpeg do PATH do sistema.');
}

function buildCaptionChunks(words, wordsPerChunk = 3) {
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const slice = words.slice(i, i + wordsPerChunk);
    if (!slice.length) continue;
    chunks.push({
      text: slice.map(w => w.word).join(' ').toUpperCase(),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
  }
  return chunks;
}

function formatAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Escapa um caminho de ficheiro para poder ser usado dentro de uma string de
 * filtro do ffmpeg (ex: "ass=caminho"). No Windows os caminhos usam "\" e podem
 * ter "C:\", e ambos os caracteres tem significado especial dentro de um filtro
 * do ffmpeg — por isso convertemos para "/" e escapamos os ":" restantes.
 */
function escapePathForFfmpegFilter(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * Converte uma cor em hex simples ("RRGGBB") para o formato de cor usado
 * pelo ASS/libass, que e "&H00BBGGRR" (alpha, depois BGR em vez de RGB).
 */
function hexToAssColor(hex) {
  const clean = hex.replace('#', '').padStart(6, '0');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function generateAssFile(chunks, outputPath, { primaryHex, outlineHex, alignment, marginV }) {
  const primaryColour = hexToAssColor(primaryHex);
  const outlineColour = hexToAssColor(outlineHex);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Caption,Arial Black,90,${primaryColour},${outlineColour},&H90000000,1,4,0,${alignment},80,80,${marginV}

[Events]
Format: Layer, Start, End, Style, Text
`;
  const lines = chunks
    .map(c => `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Caption,${c.text}`)
    .join('\n');
  fs.writeFileSync(outputPath, header + lines);
  return outputPath;
}

function pickExistingBackgroundClip() {
  const dir = config.assets.backgroundClipsDir;
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /\.(mp4|mov)$/i.test(f));
  if (!files.length) return null;
  return path.join(dir, files[Math.floor(Math.random() * files.length)]);
}

function pickRandomMusic() {
  const dir = config.assets.musicDir;
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /\.(mp3|wav)$/i.test(f));
  if (!files.length) return null;
  return path.join(dir, files[Math.floor(Math.random() * files.length)]);
}

/**
 * Devolve uma string legivel com o detalhe real do erro de uma chamada axios,
 * incluindo o corpo da resposta da API (essencial para perceber erros 400).
 */
function describeAxiosError(err) {
  if (err.response) {
    const body = typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : err.response.data;
    return `HTTP ${err.response.status} — ${body}`;
  }
  return err.message;
}

/**
 * Gera uma imagem de fundo com FLUX (Together AI) a partir do imagePrompt da historia.
 * Nota: FLUX.1-schnell (endpoint serverless) tem um limite maximo de 1440px por lado,
 * e largura/altura tem de ser multiplos de 32 — por isso usamos 768x1344 (proporcao
 * vertical proxima de 9:16) em vez de 1080x1920 diretamente.
 */
async function generateBackgroundImage(prompt, outputDir, styleSuffix, fileName = 'background.png') {
  logger.step('video', 'A gerar imagem de fundo com FLUX (Together AI)...');

  const fullPrompt = `${prompt}. Vertical composition, ${styleSuffix}, no text, no watermark, no visible faces.`;

  let response;
  try {
    response = await axios.post(
      `${config.together.baseUrl}/images/generations`,
      {
        model: config.together.imageModel,
        prompt: fullPrompt,
        width: 768,
        height: 1344,
        steps: 4,
        n: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${config.together.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    throw new Error(`Falha a gerar imagem com FLUX: ${describeAxiosError(err)}`);
  }

  const imageData = response.data.data[0];
  const imagePath = path.join(outputDir, fileName);

  if (imageData.b64_json) {
    fs.writeFileSync(imagePath, Buffer.from(imageData.b64_json, 'base64'));
  } else if (imageData.url) {
    const imgResp = await axios.get(imageData.url, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, Buffer.from(imgResp.data));
  } else {
    throw new Error('Resposta da API de imagem sem b64_json nem url.');
  }

  logger.step('video', `Imagem de fundo gerada: ${imagePath}`);
  return imagePath;
}

/**
 * Transforma uma imagem estatica num video com efeito Ken Burns (zoom lento continuo).
 */
function imageToKenBurnsClip(imagePath, durationSeconds, outputPath) {
  return new Promise((resolve, reject) => {
    const fps = 30;
    const totalFrames = Math.ceil(durationSeconds * fps);
    ffmpeg(imagePath)
      .loop(durationSeconds)
      .videoFilters([
        `scale=1600:2844,zoompan=z='min(zoom+0.0007,1.25)':d=${totalFrames}:s=1080x1920:fps=${fps}`,
      ])
      .outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p'])
      .duration(durationSeconds)
      .output(outputPath)
      .on('error', reject)
      .on('end', resolve)
      .run();
  });
}

/**
 * Fundo alternativo, gerado localmente pelo ffmpeg (sem depender de nenhuma API externa).
 * E usado sempre que a geracao de imagem com FLUX falha, para o video nunca ficar bloqueado.
 */
function generateGradientFallbackClip(durationSeconds, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`gradients=s=1080x1920:d=${durationSeconds}:speed=0.02:x0=0:y0=0`)
      .inputOptions(['-f lavfi'])
      .outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p'])
      .duration(durationSeconds)
      .output(outputPath)
      .on('error', reject)
      .on('end', resolve)
      .run();
  });
}

/**
 * Concatena varios clips (mesmo codec/resolucao) num unico ficheiro, usando o
 * demuxer "concat" do ffmpeg (rapido, sem reencodar, porque todos os clips
 * saem do imageToKenBurnsClip com as mesmas definicoes).
 */
function concatClips(clipPaths, outputDir, outputPath) {
  if (clipPaths.length === 1) return clipPaths[0];

  const listPath = path.join(outputDir, 'concat_list.txt');
  const listContent = clipPaths.map(p => `file '${escapePathForFfmpegFilter(path.resolve(p))}'`).join('\n');
  fs.writeFileSync(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('error', reject)
      .on('end', () => resolve(outputPath))
      .run();
  });
}

/**
 * Divide a duracao total do video em N cenas (uma por imagePrompt) e gera um
 * clip Ken Burns por cena, para o video ter mais "acção" visual em vez de uma
 * unica imagem estatica do inicio ao fim. Cada cena usa uma imagem gerada por
 * IA diferente (uma por "beat" da narracao/conteudo).
 */
async function buildBackgroundClips({ imagePrompts, outputDir, durationSeconds, styleSuffix }) {
  const manualClip = pickExistingBackgroundClip();
  if (manualClip) {
    logger.step('video', `A usar clip de fundo manual: ${manualClip}`);
    return manualClip;
  }

  const prompts = (imagePrompts && imagePrompts.length ? imagePrompts : ['a moody, cinematic abstract background']);
  const sceneCount = prompts.length;
  const baseSceneDuration = durationSeconds / sceneCount;

  try {
    const sceneClipPaths = [];
    for (let i = 0; i < sceneCount; i++) {
      // A ultima cena absorve o resto de segundos para a soma bater certo com durationSeconds.
      const sceneDuration = i === sceneCount - 1
        ? durationSeconds - baseSceneDuration * (sceneCount - 1)
        : baseSceneDuration;

      const imagePath = await generateBackgroundImage(prompts[i], outputDir, styleSuffix, `background_${i}.png`);
      const clipPath = path.join(outputDir, `background_clip_${i}.mp4`);
      await imageToKenBurnsClip(imagePath, sceneDuration, clipPath);
      sceneClipPaths.push(clipPath);
    }

    const finalBackgroundPath = path.join(outputDir, 'background_combined.mp4');
    return await concatClips(sceneClipPaths, outputDir, finalBackgroundPath);
  } catch (err) {
    logger.warn(`Fundo com IA falhou (${err.message}). A usar fundo alternativo gerado localmente.`);
    const fallbackPath = path.join(outputDir, 'background_fallback.mp4');
    await generateGradientFallbackClip(durationSeconds, fallbackPath);
    return fallbackPath;
  }
}

export async function assembleVideo({ audioPath, words, outputDir, imagePrompts }) {
  logger.step('video', 'A montar video final...');

  const settings = getSettings();
  const captionStyle = CAPTION_STYLE_CATALOG.find(c => c.id === settings.captionStyle) || CAPTION_STYLE_CATALOG[0];
  const captionPosition = CAPTION_POSITION_CATALOG.find(p => p.id === settings.captionPosition) || CAPTION_POSITION_CATALOG[0];
  const visualStyle = VISUAL_STYLE_CATALOG.find(v => v.id === settings.visualStyle) || VISUAL_STYLE_CATALOG[0];

  logger.step('video', `Estilo: legenda=${captionStyle.label} (${captionPosition.label}), visual=${visualStyle.label}`);

  const chunks = buildCaptionChunks(words);
  const assPath = generateAssFile(chunks, path.join(outputDir, 'captions.ass'), {
    primaryHex: captionStyle.primary,
    outlineHex: captionStyle.outline,
    alignment: captionPosition.alignment,
    marginV: captionPosition.marginV,
  });
  const musicPath = pickRandomMusic();
  const finalPath = path.join(outputDir, 'final.mp4');
  const durationSeconds = words.length ? words[words.length - 1].end + 1 : 60;

  const backgroundPath = await buildBackgroundClips({
    imagePrompts,
    outputDir,
    durationSeconds,
    styleSuffix: visualStyle.promptSuffix,
  });

  await new Promise((resolve, reject) => {
    const command = ffmpeg();
    command.input(backgroundPath).inputOptions(['-stream_loop -1']);
    command.input(audioPath);
    if (musicPath) command.input(musicPath).inputOptions(['-stream_loop -1']);

    const filters = [
      '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg]',
      `[bg]ass=${escapePathForFfmpegFilter(assPath)}[v]`,
    ];

    if (musicPath) {
      filters.push('[1:a]volume=1.0[voice]', '[2:a]volume=0.12[music]', '[voice][music]amix=inputs=2:duration=first[a]');
    }

    command.complexFilter(filters);

    command
      .outputOptions([
        '-map [v]',
        musicPath ? '-map [a]' : '-map 1:a',
        '-c:v libx264',
        '-preset veryfast',
        '-crf 20',
        '-c:a aac',
        '-shortest',
        '-movflags +faststart',
      ])
      .output(finalPath)
      .on('start', cmd => logger.info('ffmpeg:', cmd))
      .on('error', reject)
      .on('end', resolve)
      .run();
  });

  logger.step('video', `Video final gerado: ${finalPath}`);
  return finalPath;
}
