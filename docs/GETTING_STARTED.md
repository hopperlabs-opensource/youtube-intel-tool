# Getting Started

This guide gets the full stack running locally and walks one successful end-to-end ingestion.

## TL;DR

```bash
pnpm run setup
pnpm yit health
pnpm yit capabilities
```

Then open `http://localhost:3333`.

## 0. Intended Use and Safety

This project is intended for local/self-hosted use. Do not expose it directly
to the public internet without additional hardening (auth, TLS/reverse proxy,
rate limiting, secret management, monitoring).

## 1. Prerequisites

- macOS or Linux
- Node.js `>=20`
- `pnpm` `>=9`
- Docker Desktop (or Docker Engine + Compose)
- `yt-dlp`
- `ffmpeg` (recommended for broader media handling)

Install on macOS:

```bash
brew install pnpm yt-dlp ffmpeg
```

## 2. Install Dependencies

From repo root:

```bash
pnpm install
```

## 3. Configure Environment

Create local env file:

```bash
cp .env.example .env
```

Start with defaults first. Add optional provider keys later.

## 4. Start Infra + App

```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

Expected services:

- Web UI: `http://localhost:3333`
- Web metrics: `http://localhost:3333/metrics`
- Worker metrics: `http://localhost:4010/metrics`

## 5. Verify Health

In a new terminal:

```bash
pnpm run doctor
pnpm yit health
pnpm yit capabilities
```

If healthy, continue.

## 6. Run Your First Ingest

### UI flow

1. Open `http://localhost:3333`.
2. Paste a YouTube URL and click `Open`.
3. On the video page, click `Ingest`.
4. Watch the Job Center for queue progress and logs.
5. Explore `Transcript`, `Search`, `Entities`, `Context`, and `Chat`.

### CLI flow

```bash
pnpm yit resolve "https://www.youtube.com/watch?v=..."
pnpm yit ingest "https://www.youtube.com/watch?v=..." --wait --logs
pnpm yit search "what was the main argument"
```

## 7. Optional Enrichment Providers

### Semantic embeddings

```bash
export YIT_EMBED_PROVIDER=ollama
export OLLAMA_EMBED_MODEL=nomic-embed-text
```

OpenAI embeddings option:

```bash
export YIT_EMBED_PROVIDER=openai
export OPENAI_API_KEY=...
```

If `OPENAI_API_KEY` is not set in `.env`, the UI `Settings` modal can save a browser-local key and send it to local API routes for embeddings-backed search/chat retrieval.

### STT fallback (when captions are disabled)

```bash
export YIT_STT_PROVIDER=openai
export OPENAI_API_KEY=...
```

### Diarization (speaker segmentation)

```bash
export YIT_DIARIZE_BACKEND=pyannote
export YIT_HF_TOKEN=...
export YIT_PYTHON_BIN=python3.11
```

## 8. Run In Background

```bash
pnpm bg:up
pnpm bg:status
pnpm bg:logs
pnpm bg:down
```

For macOS auto-start at login:

```bash
pnpm svc:install
pnpm svc:status
pnpm svc:uninstall
```

## 9. Common Next Steps

- Read [USE_CASES.md](USE_CASES.md) for concrete workflows.
- Read [CLI.md](CLI.md) for command recipes.
- Read [API.md](API.md) for endpoint-level integration.
- Use [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if anything fails.
