import { google } from 'googleapis';
import fs from 'fs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

function getAuthedClient() {
  const oauth2Client = new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    'urn:ietf:wg:oauth:2.0:oob' // desktop app flow
  );
  oauth2Client.setCredentials({ refresh_token: config.youtube.refreshToken });
  return oauth2Client;
}

export async function uploadToYouTube({ videoPath, title, description, tags }) {
  logger.step('publish', `A publicar no YouTube: "${title}"`);

  const auth = getAuthedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId: '24', // Entertainment
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = res.data.id;
  logger.step('publish', `Publicado com sucesso: https://youtube.com/shorts/${videoId}`);
  return videoId;
}

/**
 * Cria uma playlist nova no canal (usada para agrupar os episodios de uma
 * serie, para quem vir um episodio conseguir facilmente ver os outros e
 * ficar "agarrado" ao canal — essencial para audiencia/retencao).
 */
export async function createPlaylist(title, description) {
  const auth = getAuthedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const res = await youtube.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description },
      status: { privacyStatus: 'public' },
    },
  });

  logger.step('publish', `Playlist criada: "${title}" (${res.data.id})`);
  return res.data.id;
}

/**
 * Adiciona um video ja publicado a uma playlist existente.
 */
export async function addVideoToPlaylist(playlistId, videoId) {
  const auth = getAuthedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    },
  });
  logger.step('publish', `Video ${videoId} adicionado a playlist ${playlistId}`);
}

/**
 * Recolhe metricas basicas de um video (para o loop de aprendizagem).
 * Nota: "averageViewPercentage" so fica disponivel via YouTube Analytics API,
 * que exige um scope OAuth adicional (youtube.readonly + yt-analytics.readonly).
 */
export async function fetchVideoMetrics(videoId) {
  const auth = getAuthedClient();
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

  const today = new Date().toISOString().split('T')[0];
  const res = await youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate: '2020-01-01',
    endDate: today,
    metrics: 'views,averageViewPercentage,subscribersGained',
    filters: `video==${videoId}`,
  });

  const row = res.data.rows?.[0] || [0, 0, 0];
  return {
    views: row[0],
    averageViewPercentage: row[1],
    subscribersGained: row[2],
  };
}
