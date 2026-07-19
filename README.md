# Karma Court — Sistema Autónomo de Conteúdo (com Dashboard local)

Pipeline: **ideia → história → voz → vídeo → (revisão local) → publicação → aprendizagem**.

Corre localmente com uma dashboard onde vês tudo o que foi gerado (história, voz, vídeo final) antes de decidires publicar. Quando quiseres, também dá para ligar o modo 100% autónomo (gera e publica sozinho, sem revisão).

## Stack

- **DeepSeek API** → geração das histórias
- **Together AI** → voz (TTS), transcrição com timestamps por palavra (legendas), e imagem de fundo (FLUX) quando não tens clips próprios
- **YouTube Data API** → publicação
- **Express** → servidor local da dashboard (Node puro, sem build step)

## Instalação

```bash
npm install
copy .env.example .env    # Windows PowerShell (Mac/Linux: cp .env.example .env)
```

Preenche o `.env` com:
- `DEEPSEEK_API_KEY`
- `TOGETHER_API_KEY`
- (mais tarde) `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` — só necessários quando quiseres publicar

## Modo Dashboard (recomendado para começar)

```bash
npm start
```

Abre **http://localhost:4000** no browser.

- Botão **"Gerar novo vídeo"** → corre o pipeline completo (história → voz → vídeo) e mostra o resultado como "draft" assim que estiver pronto (demora tipicamente 1-3 minutos, a dashboard atualiza-se sozinha)
- Cada draft mostra o vídeo com preview, o tema, e um botão **"Publicar no YouTube"**
- Nada é publicado sem carregares nesse botão — o YouTube só é chamado quando decidires

Isto corre inteiramente na tua máquina — não precisa de deploy nem de servidor externo.

## Modo 100% autónomo (sem revisão manual)

Quando estiveres confiante na qualidade e quiseres deixar correr sozinho:

```bash
npm run autonomous
```

Isto agenda `VIDEOS_PER_DAY` (definido no `.env`) publicações por dia, geradas E publicadas automaticamente, sem passar pela dashboard.

## Testar peças isoladas

```bash
npm run test:story           # só a história
npm run test:tts             # só a voz + timestamps
npm run run:once             # gera 1 vídeo completo, fica em draft (não publica)
npm run run:once:publish     # gera 1 vídeo completo E publica de imediato
```

## Configuração do YouTube (só necessária para publicar)

1. Cria o canal de YouTube
2. console.cloud.google.com → novo projeto → ativa "YouTube Data API v3"
3. Credenciais OAuth2 tipo "Desktop App" → `client_id` + `client_secret`
4. Corre o fluxo OAuth uma vez para obter o `refresh_token` (permanente depois disso)

## Requisitos da máquina

- Node.js 18+
- (o ffmpeg já vem embutido via `ffmpeg-static` — não precisas de instalar nada à parte)

## Próximos passos naturais
- Replicar cada vídeo para TikTok + Instagram Reels
- Gerar thumbnails automaticamente com o `thumbnailText`
- Séries em várias partes para aumentar retenção
