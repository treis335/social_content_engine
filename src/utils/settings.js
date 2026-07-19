import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const SETTINGS_FILE = path.join(config.paths.dataDir, 'settings.json');

// ---- Catalogo de vozes disponiveis na Together AI ----
// IMPORTANTE: o modelo Orpheus (canopylabs/orpheus-3b-0.1-ft) SO tem vozes em
// ingles. Para portugues/espanhol usamos o modelo Kokoro (hexgrad/Kokoro-82M),
// que tem vozes nativas nesses idiomas. Usar uma voz Orpheus com texto em
// portugues produz portugues lido com sotaque ingles (o problema original).
// Cada voz sabe a que modelo e a que idioma pertence, para escolhermos sempre
// o modelo certo automaticamente em funcao do idioma selecionado.
export const VOICE_CATALOG = [
  // --- Ingles: Orpheus ---
  { id: 'leo', model: 'canopylabs/orpheus-3b-0.1-ft', language: 'en', label: 'Leo', gender: 'Masculina', desc: 'Grave, autoritária — a mais "vendável" para revenge/justice' },
  { id: 'zac', model: 'canopylabs/orpheus-3b-0.1-ft', language: 'en', label: 'Zac', gender: 'Masculina', desc: 'Energética, dinâmica — boa para hooks fortes' },
  { id: 'dan', model: 'canopylabs/orpheus-3b-0.1-ft', language: 'en', label: 'Dan', gender: 'Masculina', desc: 'Amigável, casual — tom de conversa' },
  { id: 'tara', model: 'canopylabs/orpheus-3b-0.1-ft', language: 'en', label: 'Tara', gender: 'Feminina', desc: 'Conversacional, clara (default original)' },
  { id: 'leah', model: 'canopylabs/orpheus-3b-0.1-ft', language: 'en', label: 'Leah', gender: 'Feminina', desc: 'Calorosa, suave' },
  { id: 'jess', model: 'canopylabs/orpheus-3b-0.1-ft', language: 'en', label: 'Jess', gender: 'Feminina', desc: 'Energética, jovem' },
  { id: 'mia', model: 'canopylabs/orpheus-3b-0.1-ft', language: 'en', label: 'Mia', gender: 'Feminina', desc: 'Profissional, articulada' },
  { id: 'zoe', model: 'canopylabs/orpheus-3b-0.1-ft', language: 'en', label: 'Zoe', gender: 'Feminina', desc: 'Calma, tranquilizadora' },
  // --- Portugues: Kokoro ---
  { id: 'pm_alex', model: 'hexgrad/Kokoro-82M', language: 'pt', label: 'Alex (PT)', gender: 'Masculina', desc: 'Voz portuguesa nativa (Kokoro) — clara, neutra' },
  { id: 'pf_dora', model: 'hexgrad/Kokoro-82M', language: 'pt', label: 'Dora (PT)', gender: 'Feminina', desc: 'Voz portuguesa nativa (Kokoro) — feminina' },
  // --- Espanhol: Kokoro ---
  { id: 'em_alex', model: 'hexgrad/Kokoro-82M', language: 'es', label: 'Alex (ES)', gender: 'Masculina', desc: 'Voz espanhola nativa (Kokoro) — clara, neutra' },
  { id: 'ef_dora', model: 'hexgrad/Kokoro-82M', language: 'es', label: 'Dora (ES)', gender: 'Feminina', desc: 'Voz espanhola nativa (Kokoro) — feminina' },
];

export function defaultVoiceForLanguage(language) {
  const match = VOICE_CATALOG.find(v => v.language === language);
  return match ? match.id : VOICE_CATALOG[0].id;
}

export function getVoiceEntry(voiceId) {
  return VOICE_CATALOG.find(v => v.id === voiceId) || VOICE_CATALOG[0];
}

// ---- Tons de narrativa (moldam o system prompt do guionista) ----
export const TONE_CATALOG = [
  { id: 'dramatic', label: 'Dramático', desc: 'Tensão alta, escalada emocional, clímax forte' },
  { id: 'aggressive', label: 'Agressivo / Direto', desc: 'Sem rodeios, frases curtas, vingança sem piedade' },
  { id: 'sarcastic', label: 'Sarcástico / Irónico', desc: 'Humor afiado, ironia na narração' },
  { id: 'suspenseful', label: 'Suspense', desc: 'Revela informação aos poucos, mantém curiosidade' },
  { id: 'wholesome', label: 'Wholesome / Satisfatório', desc: 'Foco na justiça feita e no final reconfortante' },
];

// ---- Estilos/nichos de vídeo ----
export const STYLE_CATALOG = [
  { id: 'revenge_justice_stories', label: 'Revenge / Justice Stories', desc: 'r/MaliciousCompliance, r/ProRevenge' },
  { id: 'aita_drama', label: 'AITA / Drama Familiar', desc: 'r/AmITheAsshole, conflitos de família' },
  { id: 'true_crime_lite', label: 'True Crime (leve)', desc: 'Casos misteriosos, resolução satisfatória' },
  { id: 'workplace_karma', label: 'Workplace Karma', desc: 'Chefes, colegas, escritório' },
  { id: 'relationship_drama', label: 'Relationship Drama', desc: 'Traições, ex, casamentos' },
];

export const LANGUAGE_CATALOG = [
  { id: 'en', label: 'Inglês (EUA/internacional)' },
  { id: 'pt', label: 'Português' },
  { id: 'es', label: 'Espanhol' },
];

const DEFAULT_SETTINGS = {
  // Nota: nao herdamos TOGETHER_TTS_VOICE do .env (ficava preso em "tara", a voz
  // feminina suave que motivou este painel). O default passa a ser "leo" —
  // masculina, grave, autoritaria — e configuravel na dashboard a partir daqui.
  voice: 'leo',
  tone: 'dramatic',
  style: config.channel.niche || 'revenge_justice_stories',
  language: 'en',
  videosPerDay: config.channel.videosPerDay || 2,
};

function ensureFile() {
  if (!fs.existsSync(config.paths.dataDir)) {
    fs.mkdirSync(config.paths.dataDir, { recursive: true });
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
  }
}

export function getSettings() {
  ensureFile();
  const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  // Faz merge com defaults para o caso de adicionarmos novos campos no futuro
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function updateSettings(updates) {
  const current = getSettings();

  if (updates.voice && !VOICE_CATALOG.some(v => v.id === updates.voice)) {
    throw new Error(`Voz "${updates.voice}" inválida.`);
  }
  if (updates.tone && !TONE_CATALOG.some(t => t.id === updates.tone)) {
    throw new Error(`Tom "${updates.tone}" inválido.`);
  }
  if (updates.style && !STYLE_CATALOG.some(s => s.id === updates.style)) {
    throw new Error(`Estilo "${updates.style}" inválido.`);
  }
  if (updates.language && !LANGUAGE_CATALOG.some(l => l.id === updates.language)) {
    throw new Error(`Idioma "${updates.language}" inválido.`);
  }

  const next = { ...current, ...updates };

  // Se o idioma mudou e a voz atual nao existe nesse idioma (ex: Orpheus so
  // tem vozes em ingles), troca automaticamente para a primeira voz nativa
  // desse idioma em vez de deixar ficar uma combinacao invalida guardada
  // (era esta a causa do narrador falar portugues com sotaque ingles).
  const voiceEntry = VOICE_CATALOG.find(v => v.id === next.voice);
  if (!voiceEntry || voiceEntry.language !== next.language) {
    next.voice = defaultVoiceForLanguage(next.language);
  }

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

export function getCatalogs() {
  return {
    voices: VOICE_CATALOG,
    tones: TONE_CATALOG,
    styles: STYLE_CATALOG,
    languages: LANGUAGE_CATALOG,
  };
}
