import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getRecentThemes, getBestPerformingThemes, getRecentStyles, getBestPerformingStyles } from '../utils/store.js';
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

function getStyleKind(style) {
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
function pickStyle(settings) {
  if (!settings.autoRotateStyles) return settings.style;

  const pool = (settings.activeStyles && settings.activeStyles.length ? settings.activeStyles : STYLE_CATALOG.map(s => s.id));
  const recent = getRecentStyles(2);
  let candidates = pool.filter(id => !recent.includes(id));
  if (!candidates.length) candidates = pool;

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

export async function generateStory() {
  const settings = getSettings();
  const style = pickStyle(settings);
  const theme = pickTheme(style);
  const avoidThemes = getRecentThemes(15);
  const imageCount = settings.imagesPerVideo || 3;
  const systemPrompt = buildSystemPrompt({ ...settings, style });

  logger.step('story', `A gerar historia com DeepSeek (voz=${settings.voice}, tom=${settings.tone}, idioma=${settings.language}, estilo=${style})...`);

  let response;
  try {
    response = await axios.post(
      `${config.deepseek.baseUrl}/chat/completions`,
      {
        model: config.deepseek.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserPrompt(theme, avoidThemes, settings.language, imageCount) },
        ],
        temperature: 0.9,
        max_tokens: 1400,
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

  const rawText = response.data.choices?.[0]?.message?.content || '';
  const cleaned = rawText.replace(/```json|```/g, '').trim();

  let story;
  try {
    story = JSON.parse(cleaned);
  } catch (err) {
    logger.error('Falha a fazer parse do JSON devolvido pelo DeepSeek:', cleaned);
    throw new Error('Story generation returned invalid JSON');
  }

  // Rede de seguranca: se o modelo devolver o campo antigo "imagePrompt" (string
  // unica) ou nao devolver o numero certo de imagens, normaliza para um array
  // com o tamanho pedido para o resto do pipeline nunca partir por causa disto.
  let imagePrompts = Array.isArray(story.imagePrompts) ? story.imagePrompts.filter(Boolean) : [];
  if (!imagePrompts.length && story.imagePrompt) imagePrompts = [story.imagePrompt];
  while (imagePrompts.length < imageCount) imagePrompts.push(imagePrompts[imagePrompts.length - 1] || 'a moody, cinematic abstract background');
  story.imagePrompts = imagePrompts.slice(0, imageCount);
  story.style = style;
  story.narratorGender = ['male', 'female'].includes(story.narratorGender) ? story.narratorGender : 'neutral';

  logger.step('story', `Historia gerada: "${story.title}" (categoria: ${style}, narrador: ${story.narratorGender}, ${story.imagePrompts.length} imagens)`);
  return story;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateStory().then(s => console.log(JSON.stringify(s, null, 2)));
}
