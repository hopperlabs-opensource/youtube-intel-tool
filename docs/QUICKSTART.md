# Quick Start
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Fastest path: run setup + doctor, then open the app.
- Use this doc for a first local bring-up only.
- For deeper ops and debugging, use `docs/RUNBOOKS.md` and `docs/TROUBLESHOOTING.md`.

> ✅ **Good default**
> Use `pnpm run setup` for first bring-up on a new machine.

> ⚠️ **Watch out**
> This stack is local-first and not hardened for direct public internet exposure.

## Prerequisites

- Node.js `>=20`
- `pnpm` `>=9`
- Docker Desktop (Postgres + Redis)
- `yt-dlp` (example: `brew install yt-dlp`)

## Bring Up The Stack

### Requirements
- Repo cloned locally
- Prerequisites installed

### Steps
```bash
pnpm run setup
pnpm run doctor
```

### Verify
- App: `http://localhost:<YIT_WEB_PORT>` (default `3333`)
- Web metrics: `http://localhost:<YIT_WEB_PORT>/metrics`
- Worker metrics: `http://localhost:<YIT_WORKER_METRICS_PORT>/metrics` (default `4010`)
- Tests: `pnpm test` and `pnpm test:integration`

## First Ingest Flow

### Requirements
- Stack is running and healthy

### Steps
1. Open `http://localhost:<YIT_WEB_PORT>` (default `3333`).
2. Paste a YouTube URL on `/` and select `Open`.
3. On the video page, select `Ingest`.
4. Watch progress in Job Center.
5. Use `Search`, `Entities`, `Context`, and `Chat`.

### Verify
- Job status moves from queued/running to completed.
- Search results and transcript cues are returned for the ingested video.

Optional starter content:

```bash
pnpm seed:demo
```

Starter list path: `config/demo_videos.txt`.

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

## Next Docs

- [GETTING_STARTED.md](GETTING_STARTED.md)
- [RUNBOOKS.md](RUNBOOKS.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
