import 'dotenv/config';

function required(name, value) {
  if (!value) {
    console.warn(`[config] AVISO: variavel de ambiente "${name}" nao esta definida. Algumas funcionalidades vao falhar ate a preencheres no .env`);
  }
  return value;
}

export const config = {
  deepseek: {
    apiKey: required('DEEPSEEK_API_KEY', process.env.DEEPSEEK_API_KEY),
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  together: {
    apiKey: required('TOGETHER_API_KEY', process.env.TOGETHER_API_KEY),
    baseUrl: 'https://api.together.xyz/v1',
    ttsModel: process.env.TOGETHER_TTS_MODEL || 'canopylabs/orpheus-3b-0.1-ft',
    ttsVoice: process.env.TOGETHER_TTS_VOICE || 'tara',
    sttModel: 'openai/whisper-large-v3',
    imageModel: process.env.TOGETHER_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell',
  },
  youtube: {
    clientId: required('YOUTUBE_CLIENT_ID', process.env.YOUTUBE_CLIENT_ID),
    clientSecret: required('YOUTUBE_CLIENT_SECRET', process.env.YOUTUBE_CLIENT_SECRET),
    refreshToken: required('YOUTUBE_REFRESH_TOKEN', process.env.YOUTUBE_REFRESH_TOKEN),
  },
  channel: {
    name: process.env.CHANNEL_NAME || 'Karma Court',
    niche: process.env.NICHE || 'revenge_justice_stories',
    videosPerDay: parseInt(process.env.VIDEOS_PER_DAY || '2', 10),
    timezone: process.env.TIMEZONE || 'Europe/Lisbon',
  },
  assets: {
    backgroundClipsDir: process.env.BACKGROUND_CLIPS_DIR || './assets/backgrounds',
    musicDir: process.env.MUSIC_DIR || './assets/music',
  },
  paths: {
    dataDir: './data',
    outputDir: './output',
  },
};
