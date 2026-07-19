import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getSettings } from '../utils/settings.js';

/**
 * 1. Gera o audio (mp3) a partir do texto usando o TTS da Together AI.
 * 2. Volta a passar esse audio pelo Whisper (tambem via Together) com
 *    timestamps por palavra, para conseguirmos legendas sincronizadas.
 *
 * Porque dois passos? A API de TTS "basica" da Together nao devolve
 * alinhamento por palavra (isso so existe no modo streaming). O Whisper
 * com "timestamp_granularities: word" resolve isto de forma fiavel e
 * funciona com qualquer voz/modelo de TTS.
 */
export async function generateVoice(script, outputDir) {
  const { apiKey, baseUrl, ttsModel, sttModel } = config.together;
  const settings = getSettings();
  const ttsVoice = settings.voice || config.together.ttsVoice;

  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY tem de estar definido no .env');
  }

  logger.step('tts', `Voz selecionada: ${ttsVoice}`);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const audioPath = path.join(outputDir, 'narration.mp3');

  // ---- 1. Text-to-Speech ----
  logger.step('tts', 'A gerar narracao com Together AI...');

  let ttsResponse;
  try {
    ttsResponse = await axios.post(
      `${baseUrl}/audio/speech`,
      {
        model: ttsModel,
        input: script,
        voice: ttsVoice,
        response_format: 'mp3',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );
  } catch (err) {
    let detail = err.message;
    if (err.response) {
      // A resposta de erro pode vir em arraybuffer (por causa do responseType); descodifica para JSON legivel.
      const bodyText = Buffer.isBuffer(err.response.data)
        ? err.response.data.toString('utf-8')
        : JSON.stringify(err.response.data);
      detail = `HTTP ${err.response.status} — ${bodyText}`;
    }
    throw new Error(`Falha na chamada de TTS (Together AI): ${detail}`);
  }

  fs.writeFileSync(audioPath, Buffer.from(ttsResponse.data));
  logger.step('tts', `Narracao gerada: ${audioPath}`);

  // ---- 2. Speech-to-Text (so para obter timestamps por palavra) ----
  logger.step('tts', 'A obter timestamps por palavra via Whisper (Together AI)...');

  const audioBuffer = fs.readFileSync(audioPath);
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'narration.mp3');
  form.append('model', sttModel);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const sttResponse = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!sttResponse.ok) {
    const errText = await sttResponse.text();
    throw new Error(`Falha na transcricao (Whisper): ${sttResponse.status} ${errText}`);
  }

  const sttData = await sttResponse.json();
  const words = (sttData.words || []).map(w => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));

  const timestampsPath = path.join(outputDir, 'timestamps.json');
  fs.writeFileSync(timestampsPath, JSON.stringify(words, null, 2));

  logger.step('tts', `Timestamps obtidos para ${words.length} palavras.`);
  return { audioPath, words };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateVoice('This is a quick test of the narration pipeline.', './output/test').then(r =>
    console.log(r.words)
  );
}
