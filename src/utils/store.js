import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const HISTORY_FILE = path.join(config.paths.dataDir, 'history.json');
const PERFORMANCE_FILE = path.join(config.paths.dataDir, 'performance.json');
const SERIES_FILE = path.join(config.paths.dataDir, 'series.json');

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(config.paths.dataDir)) {
    fs.mkdirSync(config.paths.dataDir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function readJson(filePath, defaultValue) {
  ensureFile(filePath, defaultValue);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ---- Historico / runs ----
export function getHistory() {
  return readJson(HISTORY_FILE, { videos: [] });
}

export function addToHistory(entry) {
  const history = getHistory();
  history.videos.push({ ...entry, createdAt: new Date().toISOString() });
  writeJson(HISTORY_FILE, history);
  return entry;
}

export function updateHistoryEntry(runId, updates) {
  const history = getHistory();
  const idx = history.videos.findIndex(v => v.runId === runId);
  if (idx === -1) throw new Error(`Run ${runId} nao encontrado no historico`);
  history.videos[idx] = { ...history.videos[idx], ...updates, updatedAt: new Date().toISOString() };
  writeJson(HISTORY_FILE, history);
  return history.videos[idx];
}

export function getRunById(runId) {
  const history = getHistory();
  return history.videos.find(v => v.runId === runId) || null;
}

export function getRecentThemes(limit = 20) {
  const history = getHistory();
  return history.videos.slice(-limit).map(v => v.theme).filter(Boolean);
}

// Ultimas categorias usadas (para a rotacao automatica evitar repetir a mesma
// categoria demasiadas vezes seguidas).
export function getRecentStyles(limit = 10) {
  const history = getHistory();
  return history.videos.slice(-limit).map(v => v.style).filter(Boolean);
}

// ---- Performance (loop de aprendizagem) ----
export function getPerformance() {
  return readJson(PERFORMANCE_FILE, { records: [] });
}

export function recordPerformance(videoId, metrics) {
  const perf = getPerformance();
  perf.records.push({ videoId, metrics, capturedAt: new Date().toISOString() });
  writeJson(PERFORMANCE_FILE, perf);
}

export function getBestPerformingThemes() {
  const history = getHistory();
  const perf = getPerformance();

  const themeScores = {};
  for (const record of perf.records) {
    const video = history.videos.find(v => v.youtubeId === record.videoId);
    if (!video) continue;
    const score = record.metrics.averageViewPercentage || 0;
    if (!themeScores[video.theme]) themeScores[video.theme] = [];
    themeScores[video.theme].push(score);
  }

  return Object.entries(themeScores)
    .map(([theme, scores]) => ({
      theme,
      avgRetention: scores.reduce((a, b) => a + b, 0) / scores.length,
      sampleSize: scores.length,
    }))
    .sort((a, b) => b.avgRetention - a.avgRetention);
}

/**
 * Ranking de retencao media por categoria (style), usado pela rotacao
 * automatica para dar mais peso as categorias que tem tido melhor desempenho.
 */
export function getBestPerformingStyles() {
  const history = getHistory();
  const perf = getPerformance();

  const styleScores = {};
  for (const record of perf.records) {
    const video = history.videos.find(v => v.youtubeId === record.videoId);
    if (!video || !video.style) continue;
    const score = record.metrics.averageViewPercentage || 0;
    if (!styleScores[video.style]) styleScores[video.style] = [];
    styleScores[video.style].push(score);
  }

  return Object.entries(styleScores)
    .map(([style, scores]) => ({
      style,
      avgRetention: scores.reduce((a, b) => a + b, 0) / scores.length,
      sampleSize: scores.length,
    }))
    .sort((a, b) => b.avgRetention - a.avgRetention);
}

// ---- Series / episodios ----
export function getSeriesList() {
  return readJson(SERIES_FILE, { series: [] }).series;
}

export function getSeriesById(id) {
  return getSeriesList().find(s => s.id === id) || null;
}

export function getActiveSeriesByStyle(style) {
  return getSeriesList().filter(s => s.style === style && s.status === 'active');
}

export function addSeries(series) {
  const data = readJson(SERIES_FILE, { series: [] });
  data.series.push(series);
  writeJson(SERIES_FILE, data);
  return series;
}

export function updateSeries(id, updates) {
  const data = readJson(SERIES_FILE, { series: [] });
  const idx = data.series.findIndex(s => s.id === id);
  if (idx === -1) throw new Error(`Serie ${id} nao encontrada`);
  data.series[idx] = { ...data.series[idx], ...updates, updatedAt: new Date().toISOString() };
  writeJson(SERIES_FILE, data);
  return data.series[idx];
}

/**
 * Regista o resultado de um episodio (usado a seguir a geracao) e devolve a
 * serie atualizada.
 */
export function appendEpisode(seriesId, episode) {
  const data = readJson(SERIES_FILE, { series: [] });
  const idx = data.series.findIndex(s => s.id === seriesId);
  if (idx === -1) throw new Error(`Serie ${seriesId} nao encontrada`);
  data.series[idx].episodes.push(episode);
  data.series[idx].updatedAt = new Date().toISOString();
  writeJson(SERIES_FILE, data);
  return data.series[idx];
}

/**
 * Atualiza um episodio ja existente (usado depois de publicar, para guardar
 * youtubeId/publishedAt no episodio certo).
 */
export function updateEpisode(seriesId, episodeNumber, updates) {
  const data = readJson(SERIES_FILE, { series: [] });
  const series = data.series.find(s => s.id === seriesId);
  if (!series) throw new Error(`Serie ${seriesId} nao encontrada`);
  const ep = series.episodes.find(e => e.number === episodeNumber);
  if (!ep) throw new Error(`Episodio ${episodeNumber} nao encontrado na serie ${seriesId}`);
  Object.assign(ep, updates);
  writeJson(SERIES_FILE, data);
  return ep;
}
