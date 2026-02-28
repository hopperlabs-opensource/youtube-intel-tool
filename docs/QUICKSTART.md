# Quick Start

Get the local stack running in a few minutes.

## Prerequisites

- Node.js `>=20`
- `pnpm` `>=9`
- Docker Desktop (Postgres + Redis)
- `yt-dlp` (example: `brew install yt-dlp`)

## Fast Setup

```bash
pnpm run setup
pnpm run doctor
```

Open:

- App: `http://localhost:<YIT_WEB_PORT>` (default `3333`)
- Web metrics: `http://localhost:<YIT_WEB_PORT>/metrics`
- Worker metrics: `http://localhost:<YIT_WORKER_METRICS_PORT>` (default `4010`)

## First Ingest Flow

1. Paste a YouTube URL on `/` and select `Open`.
2. On the video page, select `Ingest`.
3. Watch live progress in Job Center.
4. Use `Search`, `Entities`, `Context`, and `Chat`.

Optional starter content:

```bash
pnpm seed:demo
```

The starter list is in `config/demo_videos.txt`.

## Agentic Setup

Use your preferred agentic CLI in repo root with:

```text
Read README.md, docs/GETTING_STARTED.md, and docs/RUNBOOKS.md.
Set up this project locally, verify health, and run the first ingest flow.
```

Install optional local agent packs:

```bash
pnpm agents:install
```

## Stop Services

```bash
pnpm bg:down
```

For deeper setup and operations details, see:

- [GETTING_STARTED.md](GETTING_STARTED.md)
- [RUNBOOKS.md](RUNBOOKS.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
