import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const SETTINGS_FILE = path.join(config.paths.dataDir, 'settings.json');

// ---- Catalogo de vozes disponiveis no modelo Orpheus (Together AI) ----
// Fonte: canopylabs/orpheus-3b-0.1-ft — 8 vozes fixas em ingles.
export const VOICE_CATALOG = [
  { id: 'leo', label: 'Leo', gender: 'Masculina', desc: 'Grave, autoritária — a mais "vendável" para revenge/justice' },
  { id: 'zac', label: 'Zac', gender: 'Masculina', desc: 'Energética, dinâmica — boa para hooks fortes' },
  { id: 'dan', label: 'Dan', gender: 'Masculina', desc: 'Amigável, casual — tom de conversa' },
  { id: 'tara', label: 'Tara', gender: 'Feminina', desc: 'Conversacional, clara (default original)' },
  { id: 'leah', label: 'Leah', gender: 'Feminina', desc: 'Calorosa, suave' },
  { id: 'jess', label: 'Jess', gender: 'Feminina', desc: 'Energética, jovem' },
  { id: 'mia', label: 'Mia', gender: 'Feminina', desc: 'Profissional, articulada' },
  { id: 'zoe', label: 'Zoe', gender: 'Feminina', desc: 'Calma, tranquilizadora' },
];

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
