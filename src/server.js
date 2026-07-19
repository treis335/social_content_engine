import express from 'express';
import path from 'path';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { generateContent, publishRun } from './orchestrator.js';
import { getHistory, getRunById } from './utils/store.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static('public'));
// Serve os videos/audios gerados diretamente (para preview na dashboard)
app.use('/output', express.static(config.paths.outputDir));

// Estado simples em memoria para saber se ja ha uma geracao a correr
// (evita cliques duplicados a disparar 2 gerações ao mesmo tempo)
let isGenerating = false;

app.get('/api/runs', (req, res) => {
  const history = getHistory();
  // mais recentes primeiro
  const runs = [...history.videos].reverse();
  res.json({ runs, isGenerating });
});

app.get('/api/runs/:runId', (req, res) => {
  const run = getRunById(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run nao encontrado' });
  res.json(run);
});

app.post('/api/generate', async (req, res) => {
  if (isGenerating) {
    return res.status(409).json({ error: 'Ja ha uma geracao em curso. Espera terminar.' });
  }
  isGenerating = true;
  // Responde logo (a geracao demora ~1-3 min); o frontend faz polling a /api/runs
  res.json({ started: true });

  try {
    await generateContent();
  } catch (err) {
    logger.error('Erro na geracao disparada pela dashboard:', err.message);
  } finally {
    isGenerating = false;
  }
});

app.post('/api/runs/:runId/publish', async (req, res) => {
  try {
    const result = await publishRun(req.params.runId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  logger.info(`Dashboard disponivel em http://localhost:${PORT}`);
});
