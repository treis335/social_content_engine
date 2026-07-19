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

/**
 * Escolhe a voz certa automaticamente a partir do genero do narrador/protagonista
 * da historia (devolvido pelo modelo em "narratorGender") e do idioma ativo.
 * E o mecanismo que evita, por ex., uma historia contada por uma mulher sair
 * com voz masculina so porque essa era a voz fixa nas definicoes.
 */
export function pickVoiceForGender(language, narratorGender) {
  const genderMap = { male: 'Masculina', female: 'Feminina' };
  const targetGender = genderMap[narratorGender];
  const candidates = VOICE_CATALOG.filter(v => v.language === language);
  if (!candidates.length) return defaultVoiceForLanguage(language);
  if (targetGender) {
    const match = candidates.filter(v => v.gender === targetGender);
    if (match.length) return match[Math.floor(Math.random() * match.length)].id;
  }
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

/**
 * Mapa de "bom senso" para escolher automaticamente o estilo visual e a cor
 * das legendas a partir da categoria + tom da historia, sem o utilizador ter
 * de configurar isto a mao (parte do modo autonomo).
 */
const STYLE_VISUAL_HINTS = {
  revenge_justice_stories: { visualStyle: 'vibrant_dramatic', captionStyle: 'bold_yellow' },
  aita_drama: { visualStyle: 'cinematic_realistic', captionStyle: 'clean_white' },
  true_crime_lite: { visualStyle: 'dark_noir', captionStyle: 'red_impact' },
  workplace_karma: { visualStyle: 'cinematic_realistic', captionStyle: 'bold_yellow' },
  relationship_drama: { visualStyle: 'cinematic_realistic', captionStyle: 'red_impact' },
  motivational: { visualStyle: 'gold_premium', captionStyle: 'gold_premium' },
  educational_facts: { visualStyle: 'minimal_abstract', captionStyle: 'neon_green' },
  psychology_insights: { visualStyle: 'minimal_abstract', captionStyle: 'clean_white' },
  life_hacks: { visualStyle: 'vibrant_dramatic', captionStyle: 'neon_green' },
  history_mysteries: { visualStyle: 'dark_noir', captionStyle: 'gold_premium' },
};

const TONE_VISUAL_OVERRIDE = {
  suspenseful: { visualStyle: 'dark_noir' },
  wholesome: { captionStyle: 'clean_white' },
};

/**
 * Devolve {visualStyle, captionStyle} escolhidos automaticamente para a
 * categoria/tom desta historia, usados quando "autoVisualMatch" esta ativo.
 */
export function pickVisualForStyle(style, tone) {
  const base = STYLE_VISUAL_HINTS[style] || { visualStyle: 'cinematic_realistic', captionStyle: 'bold_yellow' };
  const toneOverride = TONE_VISUAL_OVERRIDE[tone] || {};
  return { ...base, ...toneOverride };
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
// "kind" distingue formato "story" (narrativa com twist) de "info" (facto/insight
// autoconclusivo) — o storyGenerator usa isto para escolher a estrutura certa.
export const STYLE_CATALOG = [
  { id: 'revenge_justice_stories', label: 'Revenge / Justice Stories', kind: 'story', desc: 'r/MaliciousCompliance, r/ProRevenge' },
  { id: 'aita_drama', label: 'AITA / Drama Familiar', kind: 'story', desc: 'r/AmITheAsshole, conflitos de família' },
  { id: 'true_crime_lite', label: 'True Crime (leve)', kind: 'story', desc: 'Casos misteriosos, resolução satisfatória' },
  { id: 'workplace_karma', label: 'Workplace Karma', kind: 'story', desc: 'Chefes, colegas, escritório' },
  { id: 'relationship_drama', label: 'Relationship Drama', kind: 'story', desc: 'Traições, ex, casamentos' },
  { id: 'motivational', label: 'Motivacional', kind: 'info', desc: 'Mentalidade, disciplina, superação — estilo discurso curto' },
  { id: 'educational_facts', label: 'Educacional / Factos', kind: 'info', desc: 'Curiosidades e factos surpreendentes explicados de forma simples' },
  { id: 'psychology_insights', label: 'Psicologia / Comportamento', kind: 'info', desc: 'Insights sobre comportamento humano e relações' },
  { id: 'life_hacks', label: 'Life Hacks / Produtividade', kind: 'info', desc: 'Dicas práticas e acionáveis do dia a dia' },
  { id: 'history_mysteries', label: 'História / Mistérios', kind: 'info', desc: 'Factos históricos intrigantes e mistérios por resolver' },
];

export const LANGUAGE_CATALOG = [
  { id: 'en', label: 'Inglês (EUA/internacional)' },
  { id: 'pt', label: 'Português' },
  { id: 'es', label: 'Espanhol' },
];

// ---- Estilo das legendas (cor + contorno) ----
// Cores em hex simples (ex: "FFE000"); o video assembler converte para o
// formato ASS (&H00BBGGRR) na hora de gerar o ficheiro de legendas.
export const CAPTION_STYLE_CATALOG = [
  { id: 'bold_yellow', label: 'Amarelo Bold', primary: 'FFE000', outline: '000000', desc: 'Alto contraste — o mais usado em conteúdo viral (estilo MrBeast)' },
  { id: 'clean_white', label: 'Branco Limpo', primary: 'FFFFFF', outline: '000000', desc: 'Clássico, sempre legível, discreto' },
  { id: 'neon_green', label: 'Verde Neon', primary: '39FF14', outline: '000000', desc: 'Chamativo — bom para energia/gaming' },
  { id: 'red_impact', label: 'Vermelho Impacto', primary: 'FF3B30', outline: '1A0000', desc: 'Urgência e tensão dramática' },
  { id: 'gold_premium', label: 'Dourado Premium', primary: 'FFD700', outline: '3D2B00', desc: 'Sensação de exclusividade/luxo' },
];

// ---- Posicao das legendas no ecra ----
// alignment segue a numeracao ASS (numpad): 2=baixo-centro, 5=centro, 8=topo-centro.
export const CAPTION_POSITION_CATALOG = [
  { id: 'bottom', label: 'Fundo', alignment: 2, marginV: 500 },
  { id: 'middle', label: 'Centro', alignment: 5, marginV: 0 },
  { id: 'top', label: 'Topo', alignment: 8, marginV: 500 },
];

// ---- Estilo visual do fundo gerado por IA (FLUX) ----
export const VISUAL_STYLE_CATALOG = [
  { id: 'cinematic_realistic', label: 'Cinemático Realista', promptSuffix: 'photorealistic, cinematic lighting, moody atmosphere, 35mm film grain, shallow depth of field', desc: 'Fotográfico, sério, credível' },
  { id: 'vibrant_dramatic', label: 'Vibrante Dramático', promptSuffix: 'vibrant saturated colors, dramatic dynamic lighting, high contrast, dynamic composition', desc: 'Cores fortes, alta energia' },
  { id: 'dark_noir', label: 'Noir Sombrio', promptSuffix: 'dark noir aesthetic, high contrast shadows, desaturated colors, moody, mysterious atmosphere', desc: 'Tenso, misterioso' },
  { id: 'minimal_abstract', label: 'Abstrato Minimalista', promptSuffix: 'minimalist abstract shapes, soft gradients, clean modern design, negative space', desc: 'Neutro, não distrai da narração' },
  { id: 'anime_illustration', label: 'Ilustração Anime', promptSuffix: 'anime and manga illustration style, vibrant colors, detailed line art, studio quality', desc: 'Estilo desenhado, chamativo para público jovem' },
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
  captionStyle: 'bold_yellow',
  captionPosition: 'bottom',
  visualStyle: 'cinematic_realistic',
  // Rotacao automatica de categorias: quando ativa, cada geracao escolhe uma
  // categoria de "activeStyles" (em vez de usar sempre "style" fixo), com peso
  // a favor das que tem tido melhor retencao. E o que permite ao canal gerar
  // conteudo variado (motivacional, factos, revenge, etc.) sozinho, sem
  // precisares de trocar a categoria manualmente.
  autoRotateStyles: false,
  activeStyles: STYLE_CATALOG.map(s => s.id),
  // Modo autonomo: quando ativos, o sistema escolhe sozinho a voz (consoante o
  // genero do narrador da historia gerada) e o visual/cor das legendas
  // (consoante a categoria/tom), em vez de usar sempre os valores fixos abaixo.
  autoVoiceMatch: false,
  autoVisualMatch: false,
  // Numero de imagens/cenas de fundo geradas por video (2-3 da mais "accao"
  // visual do que 1 imagem estatica o video todo).
  imagesPerVideo: 3,
  // Modo series: em vez de historias avulsas e independentes, o sistema cria
  // sagas com varios episodios (personagens e enredo consistentes de video
  // para video), com gancho no final de cada episodio ate ao ultimo, que
  // fecha a historia. So se aplica as categorias "story" (revenge, aita,
  // true crime, workplace, relationship) — as categorias "info" (motivacional,
  // factos, etc.) continuam sempre avulsas.
  seriesMode: false,
  episodesPerSeries: 6,
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
  if (updates.captionStyle && !CAPTION_STYLE_CATALOG.some(c => c.id === updates.captionStyle)) {
    throw new Error(`Estilo de legenda "${updates.captionStyle}" inválido.`);
  }
  if (updates.captionPosition && !CAPTION_POSITION_CATALOG.some(p => p.id === updates.captionPosition)) {
    throw new Error(`Posição de legenda "${updates.captionPosition}" inválida.`);
  }
  if (updates.visualStyle && !VISUAL_STYLE_CATALOG.some(v => v.id === updates.visualStyle)) {
    throw new Error(`Estilo visual "${updates.visualStyle}" inválido.`);
  }
  if (updates.activeStyles) {
    if (!Array.isArray(updates.activeStyles) || !updates.activeStyles.length) {
      throw new Error('"activeStyles" tem de ser uma lista com pelo menos 1 categoria.');
    }
    const invalid = updates.activeStyles.filter(id => !STYLE_CATALOG.some(s => s.id === id));
    if (invalid.length) throw new Error(`Categorias inválidas em activeStyles: ${invalid.join(', ')}`);
  }
  if (updates.imagesPerVideo !== undefined) {
    const n = parseInt(updates.imagesPerVideo, 10);
    if (![1, 2, 3].includes(n)) throw new Error('"imagesPerVideo" tem de ser 1, 2 ou 3.');
    updates.imagesPerVideo = n;
  }
  if (updates.episodesPerSeries !== undefined) {
    const n = parseInt(updates.episodesPerSeries, 10);
    if (!Number.isInteger(n) || n < 3 || n > 15) throw new Error('"episodesPerSeries" tem de ser um numero entre 3 e 15.');
    updates.episodesPerSeries = n;
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
    captionStyles: CAPTION_STYLE_CATALOG,
    captionPositions: CAPTION_POSITION_CATALOG,
    visualStyles: VISUAL_STYLE_CATALOG,
  };
}
