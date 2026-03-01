# Karaoke Mode (Eureka Karaoke Tube)
Owner: Maintainers
Status: Stable
Last updated: 2026-03-01

## TL;DR
- Karaoke mode is a local-first app at `http://localhost:<YIT_KARAOKE_PORT>` (default `3334`).
- It runs on the same API/DB as the main web app and uses transcript cues for timing.
- Start it with `pnpm dev:karaoke` (or `pnpm bg:up` for background mode).

> ⚠️ **Watch out**
> Karaoke mode is local/self-hosted software and is not hardened for direct public internet exposure.

## What It Adds

- Track catalog from YouTube URLs
- Session creation with themes
- Queue operations (`play`, `skip`, `complete`, reorder)
- Round start and beat scoring events
- Leaderboard aggregation

## Start It

### Requirements
- Base stack dependencies installed (`pnpm install`, Docker, `yt-dlp`)
- Core web API and worker running

### Steps
```bash
pnpm db:up
pnpm db:migrate
pnpm dev
pnpm dev:karaoke
```

### Verify
- Main app: `http://localhost:<YIT_WEB_PORT>` (default `3333`)
- Karaoke app: `http://localhost:<YIT_KARAOKE_PORT>` (default `3334`)
- Karaoke health: `curl -s http://localhost:${YIT_KARAOKE_PORT:-3334}/api/health | jq`

## Background Mode

```bash
pnpm bg:up
pnpm bg:status
pnpm bg:logs karaoke
pnpm bg:down
```

## API + CLI Surfaces

- API endpoints are under `/api/karaoke/*` (see `docs/API.md`).
- CLI command namespace is `yit karaoke ...` (see `docs/CLI.md`).
- SDK methods are available on `createYitClient()` in `@yt/sdk`.

## Notes

- Track readiness depends on transcript cues (`ready_state=ready` means cue data exists).
- Play screen uses cue timing and queue state to submit score events.
- Session data and leaderboards persist in Postgres (`karaoke_*` tables).
