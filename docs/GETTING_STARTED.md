# Getting Started
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Bring up local stack with `pnpm run setup`.
- Verify with `pnpm run doctor`, `pnpm yit health`, and `pnpm yit capabilities`.
- Then run one ingest flow (UI or CLI) to validate end to end.

> ⚠️ **Watch out**
> This project is intended for local/self-hosted usage. Do not expose it to the public internet without hardening (auth, TLS/reverse proxy, rate limits, secret management, monitoring).

## 1. Prerequisites

- macOS or Linux
- Node.js `>=20`
- `pnpm` `>=9`
- Docker Desktop (or Docker Engine + Compose)
- `yt-dlp`
- `ffmpeg` (recommended)

Install on macOS:

```bash
brew install pnpm yt-dlp ffmpeg
```

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Configure Environment

```bash
cp .env.example .env
```

Port defaults are centralized in `.env.example`:
- `YIT_WEB_PORT`
- `YIT_WORKER_METRICS_PORT`
- `YIT_POSTGRES_PORT`
- `YIT_REDIS_PORT`
- `YIT_PROMETHEUS_PORT`
- `YIT_GRAFANA_PORT`

## 4. Start Infra + App

### Requirements
- `.env` exists
- Docker is running

### Steps
```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

### Verify
- Web UI: `http://localhost:<YIT_WEB_PORT>` (default `3333`)
- Web metrics: `http://localhost:<YIT_WEB_PORT>/metrics`
- Worker metrics: `http://localhost:<YIT_WORKER_METRICS_PORT>/metrics` (default `4010`)

## 5. Verify Health

```bash
pnpm run doctor
pnpm yit health
pnpm yit capabilities
```

Expected outcome:
- `doctor` reports ready status
- `health` returns success
- `capabilities` lists providers/dependencies with clear enablement status

## 5.1 Verify Tests

```bash
pnpm test
pnpm test:integration
```

Expected outcome:
- Unit tests pass without requiring a running stack.
- Integration suite boots stack, runs contract tests, then tears down.

## 6. First Ingest (UI and CLI)

### UI flow
1. Open `http://localhost:<YIT_WEB_PORT>` (default `3333`).
2. Paste a YouTube URL and click `Open`.
3. On the video page, click `Ingest`.
4. Watch Job Center progress.
5. Explore `Transcript`, `Search`, `Entities`, `Context`, and `Chat`.

### CLI flow
```bash
pnpm yit resolve "https://www.youtube.com/watch?v=..."
pnpm yit ingest "https://www.youtube.com/watch?v=..." --wait --logs
pnpm yit search "what was the main argument"
```

### Optional demo seed pack
```bash
pnpm seed:demo
```

Edit starter URLs in `config/demo_videos.txt`.

## 7. Optional Enrichment Providers

### Semantic embeddings (Ollama)
```bash
export YIT_EMBED_PROVIDER=ollama
export OLLAMA_EMBED_MODEL=nomic-embed-text
```

### Semantic embeddings (OpenAI)
```bash
export YIT_EMBED_PROVIDER=openai
export OPENAI_API_KEY=...
```

If `OPENAI_API_KEY` is not set in `.env`, the UI `Settings` modal can save a browser-local key and send it to local API routes for embeddings-backed search/chat retrieval.

### STT fallback
```bash
export YIT_STT_PROVIDER=openai
export OPENAI_API_KEY=...
```

### Diarization
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

## 9. Next Steps

- [USE_CASES.md](USE_CASES.md)
- [CLI.md](CLI.md)
- [API.md](API.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
