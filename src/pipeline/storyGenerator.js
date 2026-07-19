import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getRecentThemes, getBestPerformingThemes } from '../utils/store.js';
import { getSettings } from '../utils/settings.js';

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

function buildSystemPrompt({ tone, language, style }) {
  const toneLine = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.dramatic;
  const langLine = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.en;
  const styleLabel = style.replace(/_/g, ' ');

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

function buildUserPrompt(theme, avoidThemes, language) {
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
  "imagePrompt": "descricao visual curta, SEMPRE EM INGLES independentemente do idioma escolhido acima (e so para o modelo de imagem), para gerar uma imagem de fundo generica e atmosferica relacionada com a historia, SEM texto, SEM rostos reconheciveis, estilo cinematico",
  "thumbnailText": "texto curto (max 5 palavras) para sobrepor na thumbnail"
}`;
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
  const theme = pickTheme(settings.style);
  const avoidThemes = getRecentThemes(15);
  const systemPrompt = buildSystemPrompt(settings);

  logger.step('story', `A gerar historia com DeepSeek (voz=${settings.voice}, tom=${settings.tone}, idioma=${settings.language}, estilo=${settings.style})...`);

  let response;
  try {
    response = await axios.post(
      `${config.deepseek.baseUrl}/chat/completions`,
      {
        model: config.deepseek.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserPrompt(theme, avoidThemes, settings.language) },
        ],
        temperature: 0.9,
        max_tokens: 1200,
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

  logger.step('story', `Historia gerada: "${story.title}"`);
  return story;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateStory().then(s => console.log(JSON.stringify(s, null, 2)));
}
