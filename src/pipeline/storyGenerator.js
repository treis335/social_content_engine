import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getRecentThemes, getBestPerformingThemes } from '../utils/store.js';

const THEMES = [
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
];

const SYSTEM_PROMPT = `Es um guionista especializado em historias curtas de "revenge/justice" para video vertical (YouTube Shorts/TikTok), no estilo de r/MaliciousCompliance, r/AmITheAsshole e r/ProRevenge.

Regras obrigatorias:
- Escreve SEMPRE em ingles (audiencia americana/internacional).
- A historia deve ter 130-190 palavras no total (para caber em 60-90 segundos de narracao).
- Primeira frase tem de ser um HOOK forte que gera curiosidade imediata (nunca comeces com "So this happened" generico).
- Estrutura: Hook -> Contexto rapido -> Conflito/injustica -> Escalada -> Resolucao/vinganca satisfatoria -> Linha final de impacto.
- Escreve em primeira pessoa, tom autentico, como se fosse uma historia real partilhada online.
- Nao uses linguagem ofensiva extrema, discurso de odio, ou conteudo sexual.
- Devolve APENAS um JSON valido, sem markdown, sem comentarios, no formato exato abaixo.
- Responde SOMENTE com o objeto JSON. Nada de texto antes ou depois.`;

function buildUserPrompt(theme, avoidThemes) {
  return `Tema desta historia: "${theme}"

Temas ja usados recentemente (evita repetir o twist ou situacao exata destes): ${avoidThemes.join(', ') || 'nenhum ainda'}

Devolve um JSON com este formato exato:
{
  "theme": "string curto identificando o tema",
  "title": "titulo chamativo para o video (max 60 caracteres, estilo clickbait honesto)",
  "hook": "a primeira frase da historia, isolada",
  "script": "a historia completa, incluindo o hook, pronta para narracao",
  "description": "descricao para o YouTube (2-3 frases + espaco para hashtags)",
  "tags": ["array", "de", "8 a 12", "tags", "relevantes"],
  "imagePrompt": "descricao visual curta (em ingles) para gerar uma imagem de fundo generica e atmosferica relacionada com a historia, SEM texto, SEM rostos reconheciveis, estilo cinematico",
  "thumbnailText": "texto curto (max 5 palavras) para sobrepor na thumbnail"
}`;
}

function pickTheme() {
  const best = getBestPerformingThemes();
  if (best.length >= 3 && Math.random() < 0.7) {
    const topThemes = best.slice(0, Math.ceil(best.length / 2));
    const pick = topThemes[Math.floor(Math.random() * topThemes.length)];
    logger.info(`Tema escolhido por performance historica: "${pick.theme}" (retencao media ${pick.avgRetention.toFixed(1)}%)`);
    return pick.theme;
  }
  const pick = THEMES[Math.floor(Math.random() * THEMES.length)];
  logger.info(`Tema escolhido aleatoriamente (exploracao): "${pick}"`);
  return pick;
}

export async function generateStory() {
  const theme = pickTheme();
  const avoidThemes = getRecentThemes(15);

  logger.step('story', 'A gerar historia com DeepSeek...');

  const response = await axios.post(
    `${config.deepseek.baseUrl}/chat/completions`,
    {
      model: config.deepseek.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(theme, avoidThemes) },
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
