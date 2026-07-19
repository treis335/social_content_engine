import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

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

function generateAssFile(chunks, outputPath) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Caption,Arial Black,90,&H00FFFFFF,&H00000000,&H90000000,1,4,0,2,80,80,500

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
 * Gera uma imagem de fundo com FLUX (Together AI) a partir do imagePrompt
 * da historia, e devolve o caminho do ficheiro .png gerado.
 */
async function generateBackgroundImage(prompt, outputDir) {
  logger.step('video', 'A gerar imagem de fundo com FLUX (Together AI)...');

  const response = await axios.post(
    `${config.together.baseUrl}/images/generations`,
    {
      model: config.together.imageModel,
      prompt: `${prompt}. Vertical composition, moody cinematic lighting, no text, no watermark, no visible faces.`,
      width: 1080,
      height: 1920,
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

  const imageData = response.data.data[0];
  const imagePath = path.join(outputDir, 'background.png');

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
 * Transforma uma imagem estatica num video com efeito Ken Burns
 * (zoom lento continuo), para dar movimento ao fundo.
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

export async function assembleVideo({ audioPath, words, outputDir, imagePrompt }) {
  logger.step('video', 'A montar video final...');

  const chunks = buildCaptionChunks(words);
  const assPath = generateAssFile(chunks, path.join(outputDir, 'captions.ass'));
  const musicPath = pickRandomMusic();
  const finalPath = path.join(outputDir, 'final.mp4');
  const durationSeconds = words.length ? words[words.length - 1].end + 1 : 60;

  // Fundo: usa um clip manual se existir; caso contrario, gera com IA (FLUX + Ken Burns)
  let backgroundPath = pickExistingBackgroundClip();
  if (!backgroundPath) {
    const imagePath = await generateBackgroundImage(
      imagePrompt || 'a moody, cinematic abstract background',
      outputDir
    );
    backgroundPath = path.join(outputDir, 'background_clip.mp4');
    await imageToKenBurnsClip(imagePath, durationSeconds, backgroundPath);
  }

  await new Promise((resolve, reject) => {
    const command = ffmpeg();
    command.input(backgroundPath).inputOptions(['-stream_loop -1']);
    command.input(audioPath);
    if (musicPath) command.input(musicPath).inputOptions(['-stream_loop -1']);

    const filters = [
      '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg]',
      `[bg]ass=${assPath.replace(/:/g, '\\:')}[v]`,
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
