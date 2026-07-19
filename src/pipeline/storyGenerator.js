import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getRecentThemes, getBestPerformingThemes, getRecentStyles, getBestPerformingStyles, getActiveSeriesByStyle, addSeries, updateSeries, appendEpisode } from '../utils/store.js';
import { getSettings, STYLE_CATALOG } from '../utils/settings.js';

const THEMES_BY_STYLE = {
  revenge_justice_stories: [
    'malicious compliance at work',
    'entitled family member gets exposed',
    'toxic landlord karma',
    'cheating partner caught and confronted',
    'petty revenge on a rude neighbor',
    'entitled in-laws put in their place',
    'boss steals credit and gets exposed',
    'spoiled sibling entitlement backfires',
    'wedding drama justice',
    'restaurant/customer entitlement karma',
  ],
  aita_drama: [
    'refusing to give up a seat/inheritance and getting called selfish',
    'family expects free labor and gets refused',
    'sibling favoritism blows up at a family event',
    'in-laws overstep and get put in their place',
    'friend group excludes someone over money',
    'parent plays favorites and gets called out',
  ],
  true_crime_lite: [
    'small town scam finally gets uncovered',
    'suspicious coworker turns out to be hiding something',
    'a neighbor’s strange behavior leads to a shocking discovery',
    'cold case detail solved by an unlikely witness',
    'a scammer gets caught by their own greed',
  ],
  workplace_karma: [
    'micromanaging boss gets exposed by HR',
    'coworker takes credit and gets caught red-handed',
    'lazy employee finally faces consequences',
    'toxic manager loses their best employee publicly',
    'office gossiper spreads a lie that backfires',
  ],
  relationship_drama: [
    'cheating partner caught via a simple mistake',
    'gaslighting ex confronted in front of everyone',
    'a fake friend’s betrayal is exposed at the worst time',
    'a controlling partner is finally called out',
    'a wedding secret comes out right before the big day',
  ],
  motivational: [
    'why discipline beats motivation every single time',
    'the cost of staying comfortable',
    'what separates people who quit from people who succeed',
    'why nobody is coming to save you',
    'the 1% better every day mindset',
    'how to stop caring what people think of you',
    'why most people give up right before the breakthrough',
  ],
  educational_facts: [
    'a mind-blowing fact about the human body',
    'a surprising fact about space that sounds fake but is real',
    'an animal ability that seems impossible',
    'a psychological effect that secretly controls your decisions',
    'a strange but true fact about the ocean',
    'a historical invention that happened by accident',
  ],
  psychology_insights: [
    'why we self-sabotage the things we want most',
    'the real reason people pull away when things get good',
    'why silence is more powerful than arguing',
    'the psychology behind why we repeat toxic patterns',
    'why overthinking is actually a trauma response',
    'the reason confident people seem unbothered',
  ],
  life_hacks: [
    'a simple habit that saves hours every week',
    'a trick to stop procrastinating instantly',
    'an underrated way to save money without noticing',
    'a morning routine tweak that changes your whole day',
    'a communication trick that instantly de-escalates conflict',
  ],
  history_mysteries: [
    'an unsolved mystery historians still argue about',
    'a historical event that sounds made up but is real',
    'an ancient civilization achievement that still puzzles experts',
    'a disappearance that was never explained',
    'a coincidence in history that seems impossible',
  ],
};

const TONE_INSTRUCTIONS = {
  dramatic: 'Tom DRAMATICO: tensao alta, escalada emocional clara, o clímax deve ser o pico emocional da historia.',
  aggressive: 'Tom AGRESSIVO/DIRETO: frases curtas e cortantes, sem rodeios, a vinganca e servida sem piedade nem desculpas.',
  sarcastic: 'Tom SARCASTICO/IRONICO: usa ironia afiada e humor cortante na narracao, sem se tornar ofensivo.',
  suspenseful: 'Tom de SUSPENSE: revela informacao aos poucos, cria curiosidade constante, atrasa a resolucao ate ao ultimo momento possivel.',
  wholesome: 'Tom WHOLESOME/SATISFATORIO: foco no sentimento de justica feita, final reconfortante e emocionalmente positivo.',
};

const LANGUAGE_INSTRUCTIONS = {
  en: 'Escreve SEMPRE em ingles (audiencia americana/internacional).',
  pt: 'Escreve SEMPRE em portugues (audiencia lusofona).',
  es: 'Escreve SEMPRE em espanhol (audiencia latino-americana/espanhola).',
};

export function getStyleKind(style) {
  const entry = STYLE_CATALOG.find(s => s.id === style);
  return entry?.kind || 'story';
}

function buildSystemPrompt({ tone, language, style }) {
  const toneLine = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.dramatic;
  const langLine = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.en;
  const styleLabel = style.replace(/_/g, ' ');
  const kind = getStyleKind(style);

  if (kind === 'info') {
    return `Es um criador de conteudo de curta duracao especializado em "${styleLabel}" para video vertical (YouTube Shorts/TikTok).

Regras obrigatorias:
- ${langLine}
- ${toneLine}
- O texto deve ter 110-170 palavras no total (para caber em 45-75 segundos de narracao).
- Primeira frase tem de ser um HOOK forte e especifico que gera curiosidade ou choque imediato (nunca comeces com introducoes genericas tipo "Did you know").
- Estrutura: Hook -> Contexto/porque isto importa -> Desenvolvimento com 2-3 pontos ou fases concretas -> Insight/conclusao memoravel que fica na cabeca do espectador.
- Tom direto, energico, como alguem que domina o assunto e fala sem enrolar.
- Nao uses linguagem ofensiva extrema, discurso de odio, conteudo sexual, nem afirmacoes medicas/cientificas falsas — se usares um facto, tem de ser real e verificavel.
- Devolve APENAS um JSON valido, sem markdown, sem comentarios, no formato exato abaixo.
- Responde SOMENTE com o objeto JSON. Nada de texto antes ou depois.`;
  }

  return `Es um guionista especializado em historias curtas de "${styleLabel}" para video vertical (YouTube Shorts/TikTok).

Regras obrigatorias:
- ${langLine}
- ${toneLine}
- A historia deve ter 130-190 palavras no total (para caber em 60-90 segundos de narracao).
- Primeira frase tem de ser um HOOK forte que gera curiosidade imediata (nunca comeces com "So this happened" generico).
- Estrutura: Hook -> Contexto rapido -> Conflito/injustica -> Escalada -> Resolucao/vinganca satisfatoria -> Linha final de impacto.
- Escreve em primeira pessoa, tom autentico, como se fosse uma historia real partilhada online.
- Nao uses linguagem ofensiva extrema, discurso de odio, ou conteudo sexual.
- Devolve APENAS um JSON valido, sem markdown, sem comentarios, no formato exato abaixo.
- Responde SOMENTE com o objeto JSON. Nada de texto antes ou depois.`;
}

const FIELD_LANGUAGE_REMINDER = {
  en: 'Lembrete: title, hook, script, description e thumbnailText têm de estar em INGLÊS.',
  pt: 'Lembrete: title, hook, script, description e thumbnailText têm de estar em PORTUGUÊS, mesmo que o tema abaixo esteja descrito em inglês — traduz/adapta a ideia, não escrevas em inglês.',
  es: 'Lembrete: title, hook, script, description e thumbnailText têm de estar em ESPANHOL, mesmo que o tema abaixo esteja descrito em inglês — traduz/adapta a ideia, não escrevas em inglês.',
};

function buildUserPrompt(theme, avoidThemes, language, imageCount) {
  const langReminder = FIELD_LANGUAGE_REMINDER[language] || FIELD_LANGUAGE_REMINDER.en;
  return `Tema desta historia (descrito em ingles só como referência interna, NÃO copiar o idioma): "${theme}"

Temas ja usados recentemente (evita repetir o twist ou situacao exata destes): ${avoidThemes.join(', ') || 'nenhum ainda'}

${langReminder}

Devolve um JSON com este formato exato:
{
  "theme": "string curto identificando o tema (pode ficar em ingles, e so uso interno)",
  "title": "titulo chamativo para o video (max 60 caracteres, estilo clickbait honesto)",
  "hook": "a primeira frase da historia, isolada",
  "script": "a historia completa, incluindo o hook, pronta para narracao",
  "description": "descricao para o YouTube (2-3 frases + espaco para hashtags)",
  "tags": ["array", "de", "8 a 12", "tags", "relevantes"],
  "narratorGender": "\"male\" ou \"female\" — o genero de quem narra/protagoniza a historia em primeira pessoa. Se o conteudo nao tiver um narrador com genero definido (ex: factos, historia, life hacks), usa \"neutral\"",
  "imagePrompts": ["array com EXATAMENTE ${imageCount} descricoes visuais curtas, SEMPRE EM INGLES independentemente do idioma escolhido acima (sao so para o modelo de imagem)", "cada uma corresponde a uma fase/beat diferente da narracao por ordem cronologica (ex: cena inicial, cena de escalada, cena final), para criar variacao visual ao longo do video", "cada descricao deve ser atmosferica e generica, SEM texto, SEM rostos reconheciveis, estilo cinematico, e visualmente distinta das outras"],
  "thumbnailText": "texto curto (max 5 palavras) para sobrepor na thumbnail"
}`;
}

/**
 * Quando "autoRotateStyles" esta ativo, escolhe automaticamente qual categoria
 * usar nesta geracao a partir de "activeStyles" — em vez de ficar sempre presa
 * a "style" fixo. Da mais peso as categorias com melhor retencao historica
 * (quando ja ha dados suficientes) e evita repetir a mesma categoria das
 * ultimas 2 geracoes, para o feed do canal ficar variado sozinho.
 */
export function pickStyle(settings, { kindFilter } = {}) {
  const allPool = kindFilter
    ? STYLE_CATALOG.filter(s => s.kind === kindFilter).map(s => s.id)
    : STYLE_CATALOG.map(s => s.id);

  if (!settings.autoRotateStyles) {
    // Sem rotacao automatica: usa o "style" fixo se ele bater com o filtro
    // pedido, senao cai para o primeiro da categoria certa (nunca gera algo
    // fora do kind pedido, ex: nao pode devolver um estilo "info" para series).
    if (!kindFilter || getStyleKind(settings.style) === kindFilter) return settings.style;
    return allPool[0];
  }

  const configuredPool = (settings.activeStyles && settings.activeStyles.length ? settings.activeStyles : STYLE_CATALOG.map(s => s.id));
  const pool = configuredPool.filter(id => allPool.includes(id));
  const finalPool = pool.length ? pool : allPool;

  const recent = getRecentStyles(2);
  let candidates = finalPool.filter(id => !recent.includes(id));
  if (!candidates.length) candidates = finalPool;

  const best = getBestPerformingStyles().filter(b => candidates.includes(b.style));
  if (best.length >= 2 && Math.random() < 0.7) {
    const top = best.slice(0, Math.ceil(best.length / 2)).map(b => b.style);
    const pick = top[Math.floor(Math.random() * top.length)];
    logger.info(`Categoria escolhida por performance historica: "${pick}"`);
    return pick;
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  logger.info(`Categoria escolhida aleatoriamente (exploracao/rotacao): "${pick}"`);
  return pick;
}

function pickTheme(style) {
  const themes = THEMES_BY_STYLE[style] || THEMES_BY_STYLE.revenge_justice_stories;
  const best = getBestPerformingThemes();
  if (best.length >= 3 && Math.random() < 0.7) {
    const topThemes = best.slice(0, Math.ceil(best.length / 2));
    const pick = topThemes[Math.floor(Math.random() * topThemes.length)];
    logger.info(`Tema escolhido por performance historica: "${pick.theme}" (retencao media ${pick.avgRetention.toFixed(1)}%)`);
    return pick.theme;
  }
  const pick = themes[Math.floor(Math.random() * themes.length)];
  logger.info(`Tema escolhido aleatoriamente (exploracao): "${pick}"`);
  return pick;
}

/**
 * Chamada generica ao DeepSeek, reutilizada pela geracao avulsa e pela geracao
 * de series/episodios. Devolve o JSON ja parseado (lanca erro descritivo se
 * a chamada falhar ou o JSON vier invalido).
 */
async function callDeepSeekRaw(systemPrompt, userPrompt, maxTokens) {
  try {
    return await axios.post(
      `${config.deepseek.baseUrl}/chat/completions`,
      {
        model: config.deepseek.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${config.deepseek.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    const detail = err.response ? `HTTP ${err.response.status} — ${JSON.stringify(err.response.data)}` : err.message;
    throw new Error(`Falha na chamada a DeepSeek: ${detail}`);
  }
}

function extractJson(rawText) {
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function callDeepSeek(systemPrompt, userPrompt, maxTokens = 1400) {
  let response = await callDeepSeekRaw(systemPrompt, userPrompt, maxTokens);
  let choice = response.data.choices?.[0];

  // Se a resposta foi cortada por falta de tokens (finish_reason "length"), o
  // JSON fica incompleto e o parse abaixo ia falhar sempre. Em vez de rebentar
  // logo, tenta 1x mais com o dobro do orcamento de tokens.
  if (choice?.finish_reason === 'length') {
    logger.warn(`Resposta da DeepSeek cortada por limite de tokens (${maxTokens}) — a tentar outra vez com mais espaco...`);
    response = await callDeepSeekRaw(systemPrompt, userPrompt, Math.min(maxTokens * 2, 4000));
    choice = response.data.choices?.[0];
  }

  const rawText = choice?.message?.content || '';
  try {
    return extractJson(rawText);
  } catch (err) {
    logger.error('Falha a fazer parse do JSON devolvido pelo DeepSeek:', rawText);
    throw new Error('DeepSeek devolveu um JSON invalido');
  }
}

/**
 * Normaliza imagePrompts/imagePrompt/narratorGender vindos do DeepSeek para um
 * formato seguro, independentemente de como o modelo respondeu.
 */
function normalizeImagePrompts(data, imageCount) {
  let imagePrompts = Array.isArray(data.imagePrompts) ? data.imagePrompts.filter(Boolean) : [];
  if (!imagePrompts.length && data.imagePrompt) imagePrompts = [data.imagePrompt];
  while (imagePrompts.length < imageCount) imagePrompts.push(imagePrompts[imagePrompts.length - 1] || 'a moody, cinematic abstract background');
  return imagePrompts.slice(0, imageCount);
}

function normalizeGender(gender) {
  return ['male', 'female'].includes(gender) ? gender : 'neutral';
}

export async function generateStory(forcedStyle) {
  const settings = getSettings();
  const style = forcedStyle || pickStyle(settings);
  const theme = pickTheme(style);
  const avoidThemes = getRecentThemes(15);
  const imageCount = settings.imagesPerVideo || 3;
  const systemPrompt = buildSystemPrompt({ ...settings, style });

  logger.step('story', `A gerar historia com DeepSeek (voz=${settings.voice}, tom=${settings.tone}, idioma=${settings.language}, estilo=${style})...`);

  const story = await callDeepSeek(systemPrompt, buildUserPrompt(theme, avoidThemes, settings.language, imageCount), 1400);

  story.imagePrompts = normalizeImagePrompts(story, imageCount);
  story.style = style;
  story.narratorGender = normalizeGender(story.narratorGender);

  logger.step('story', `Historia gerada: "${story.title}" (categoria: ${style}, narrador: ${story.narratorGender}, ${story.imagePrompts.length} imagens)`);
  return story;
}

// ============================================================================
// ---- Series / episodios (sagas com continuidade entre videos) ----
// ============================================================================

function buildSeriesSystemPrompt({ tone, language, style, episodeNumber, totalEpisodes, isFinalEpisode }) {
  const toneLine = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.dramatic;
  const langLine = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.en;
  const styleLabel = style.replace(/_/g, ' ');

  return `Es o guionista de uma serie serializada de "${styleLabel}" para YouTube Shorts/TikTok, atualmente no episodio ${episodeNumber} de ${totalEpisodes}.

Regras obrigatorias:
- ${langLine}
- ${toneLine}
- Mantem TOTAL consistencia com os nomes das personagens, a linha temporal e os factos ja estabelecidos nos episodios anteriores (recebes um resumo deles no prompt seguinte). NUNCA contradigas o que ja aconteceu.
- Este episodio deve ter 130-190 palavras, tem de se ler bem sozinho (quem ve pela 1a vez percebe o essencial) mas recompensar quem ja acompanha a serie.
- Primeira frase: entra direto na acao deste episodio (nao percas tempo a recapitular o passado em detalhe).
${isFinalEpisode
  ? '- Este e o ULTIMO episodio da serie: fecha a historia com uma resolucao satisfatoria e definitiva. NAO deixes gancho para continuar.'
  : '- Termina com um gancho forte (cliffhanger) que obrigue o espectador a querer ver JA o proximo episodio.'}
- Nao uses linguagem ofensiva extrema, discurso de odio, ou conteudo sexual.
- Devolve APENAS um JSON valido, sem markdown, sem comentarios. Responde SOMENTE com o objeto JSON.`;
}

function buildSeriesUserPrompt({ premise, characters, recentSummary, episodeNumber, totalEpisodes, isFinalEpisode, language, imageCount }) {
  const langReminder = FIELD_LANGUAGE_REMINDER[language] || FIELD_LANGUAGE_REMINDER.en;
  return `Premissa da serie: "${premise}"
Personagens principais: ${characters}
Resumo do que ja aconteceu: ${recentSummary || 'Isto e o primeiro episodio — ainda nao ha historial.'}

Este e o episodio ${episodeNumber} de ${totalEpisodes}${isFinalEpisode ? ' — O ULTIMO episodio da serie' : ''}.

${langReminder}

Devolve um JSON com este formato exato:
{
  "title": "titulo deste episodio (max 60 caracteres, pode incluir algo tipo 'Ep. ${episodeNumber}')",
  "hook": "a primeira frase do episodio, isolada",
  "script": "o episodio completo, incluindo o hook, pronto para narracao",
  "description": "descricao para o YouTube (2-3 frases + espaco para hashtags)",
  "tags": ["array", "de", "8 a 12", "tags", "relevantes"],
  "narratorGender": "\"male\" ou \"female\" — genero de quem narra em primeira pessoa",
  "imagePrompts": ["array com EXATAMENTE ${imageCount} descricoes visuais curtas, SEMPRE EM INGLES, uma por fase/beat do episodio, atmosfericas, SEM texto, SEM rostos reconheciveis, visualmente distintas entre si"],
  "thumbnailText": "texto curto (max 5 palavras) para a thumbnail",
  "episodeSummary": "resumo de 1-2 frases do que aconteceu NESTE episodio, para dar continuidade ao proximo",
  "cliffhanger": ${isFinalEpisode ? '""' : '"a frase de gancho final deste episodio, isolada, para referencia interna"'}
}`;
}

/**
 * Inventa uma nova saga original (titulo, premissa, personagens) para uma
 * categoria, usada quando nao ha nenhuma serie ativa nessa categoria.
 */
async function generateSeriesPremise({ style, tone, language }) {
  const styleLabel = style.replace(/_/g, ' ');
  const langLine = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.en;
  const toneLine = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.dramatic;

  const system = `Es um criador de series serializadas de "${styleLabel}" para YouTube Shorts/TikTok. Inventa uma saga ORIGINAL com potencial para varios episodios: personagens memoraveis, conflito central forte e espaco para escalar ao longo de varios ganchos. ${langLine} ${toneLine} Devolve APENAS JSON valido, sem markdown, sem comentarios.`;
  const user = `Devolve um JSON com este formato exato:
{
  "title": "titulo curto e cativante da serie (max 50 caracteres)",
  "premise": "premissa da serie em 2-3 frases: situacao inicial, conflito central, o que esta em jogo",
  "characters": "personagens principais (max 3) com 1 traço distintivo cada, formato curto 'Nome (papel): traço; Nome2 (papel): traço'"
}`;

  return callDeepSeek(system, user, 700);
}

function buildRecentSummaryText(series) {
  if (!series.episodes.length) return null;
  return series.episodes
    .slice(-3)
    .map(e => `Ep.${e.number}: ${e.summary}${e.cliffhanger ? ` (terminou em: "${e.cliffhanger}")` : ''}`)
    .join(' ');
}

async function pickOrCreateSeries(style, settings) {
  const active = getActiveSeriesByStyle(style);
  if (active.length) {
    // Round-robin: continua a saga que ha mais tempo nao tem episodio novo,
    // para varias sagas da mesma categoria avancarem todas, em vez de so uma.
    return active.sort((a, b) => new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt))[0];
  }

  logger.step('story', `Nenhuma serie ativa em "${style}" — a criar uma nova saga...`);
  const premiseData = await generateSeriesPremise({ style, tone: settings.tone, language: settings.language });
  const series = {
    id: `series_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: premiseData.title,
    style,
    language: settings.language,
    tone: settings.tone,
    premise: premiseData.premise,
    characters: premiseData.characters,
    totalEpisodesPlanned: settings.episodesPerSeries || 6,
    status: 'active',
    playlistId: null,
    narratorGender: null,
    episodes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  addSeries(series);
  logger.step('story', `Nova saga criada: "${series.title}" (${series.totalEpisodesPlanned} episodios planeados)`);
  return series;
}

/**
 * Escolhe/cria uma serie e gera o proximo episodio, mantendo continuidade com
 * os episodios anteriores (personagens, enredo, cliffhangers). So deve ser
 * chamada para categorias do tipo "story".
 */
export async function generateSeriesEpisode(settings, style) {
  const series = await pickOrCreateSeries(style, settings);
  const episodeNumber = series.episodes.length + 1;
  const totalEpisodes = series.totalEpisodesPlanned;
  const isFinalEpisode = episodeNumber >= totalEpisodes;
  const imageCount = settings.imagesPerVideo || 3;

  const systemPrompt = buildSeriesSystemPrompt({ tone: series.tone, language: series.language, style, episodeNumber, totalEpisodes, isFinalEpisode });
  const userPrompt = buildSeriesUserPrompt({
    premise: series.premise,
    characters: series.characters,
    recentSummary: buildRecentSummaryText(series),
    episodeNumber,
    totalEpisodes,
    isFinalEpisode,
    language: series.language,
    imageCount,
  });

  logger.step('story', `A gerar episodio ${episodeNumber}/${totalEpisodes} de "${series.title}"...`);
  const data = await callDeepSeek(systemPrompt, userPrompt, 1500);

  const imagePrompts = normalizeImagePrompts(data, imageCount);
  // A voz/genero do narrador mantem-se igual ao longo de toda a saga (definido
  // no episodio 1); so se recalcula se por algum motivo ainda nao estava guardado.
  const narratorGender = series.narratorGender || normalizeGender(data.narratorGender);
  if (!series.narratorGender) updateSeries(series.id, { narratorGender });

  appendEpisode(series.id, {
    number: episodeNumber,
    title: data.title,
    summary: data.episodeSummary || '',
    cliffhanger: isFinalEpisode ? '' : (data.cliffhanger || ''),
    youtubeId: null,
    publishedAt: null,
    createdAt: new Date().toISOString(),
  });
  updateSeries(series.id, { status: isFinalEpisode ? 'completed' : 'active' });

  logger.step('story', `Episodio gerado: "${data.title}" (${series.title}, ep. ${episodeNumber}/${totalEpisodes}${isFinalEpisode ? ' — FINAL' : ''})`);

  return {
    title: `${series.title} — Ep. ${episodeNumber}${isFinalEpisode ? ' (Final)' : ''}`,
    hook: data.hook,
    script: data.script,
    description: `${data.description}\n\n${series.title} · Episódio ${episodeNumber}/${totalEpisodes}`,
    tags: data.tags,
    theme: series.title,
    style,
    imagePrompts,
    narratorGender,
    seriesId: series.id,
    seriesTitle: series.title,
    episodeNumber,
    totalEpisodesPlanned: totalEpisodes,
    isFinalEpisode,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateStory().then(s => console.log(JSON.stringify(s, null, 2)));
}
