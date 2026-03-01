# CLI Reference (`yit`)
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Use `yit` for repeatable automation, smoke tests, and CI workflows.
- CLI talks to the same local API as the web app.
- Start with `pnpm yit --help` and `pnpm yit capabilities`.

The CLI uses the same HTTP API as the web app, so it is ideal for scripting, smoke tests, and automation.

Run from repo root:

```bash
pnpm yit --help
```

Installable package name (for npm publishing): `@yt/cli`.

Global install example:

```bash
npm install -g @yt/cli
yit --help
```

## Base Options

- `--base-url <url>` override API base URL (or `YIT_BASE_URL` env var)
- `--json` machine-friendly output for pipelines

Example:

```bash
YIT_BASE_URL="http://localhost:${YIT_WEB_PORT:-48333}" pnpm yit --json health
```

## Core Commands

- `health` check API reachability
- `capabilities` show dependency/provider readiness
- `smoke` end-to-end smoke flow
- `resolve <url>` URL to canonical video
- `ingest <videoIdOrUrl>` queue ingest job
- `search <query...>` global library search
- `video ...` per-video operations
- `youtube ...` discovery operations
- `chat ...` grounded Q&A operations
- `job ...` status and logs
- `transcript ...` cues and export
- `library` list local videos
- `policy ...` saved policy CRUD + run + hits
- `feed ...` policy feed URLs and output
- `karaoke ...` karaoke track/session/queue/scoring flow
- `facets ...` channels/topics/people
- `speaker rename ...` label diarization speakers

## High-Value Recipes

### 1. Resolve + ingest + follow logs

```bash
pnpm yit capabilities
pnpm yit resolve "https://www.youtube.com/watch?v=..."
pnpm yit ingest "https://www.youtube.com/watch?v=..." --wait --logs
```

### 2. Global semantic/hybrid search

```bash
pnpm yit search "comparison of retrieval strategies"
```

### 3. Per-video search

```bash
pnpm yit video search <videoId> "grounded generation"
```

### 4. Chat with citations

```bash
pnpm yit chat ask <videoId> "Summarize main points and cite [S1], [S2]."
```

### 5. Transcript export

```bash
pnpm yit transcript export <transcriptId> --format txt
pnpm yit transcript export <transcriptId> --format vtt
```

### 6. YouTube discovery

```bash
pnpm yit youtube search "retrieval augmented generation"
pnpm yit youtube channel @channel_handle
pnpm yit youtube playlist "https://www.youtube.com/playlist?list=..."
```

### 7. Saved policy + feed

```bash
pnpm yit policy create --name "daily-rag" --query "retrieval quality" --mode hybrid
pnpm yit policy run <policyId> --triggered-by cli
pnpm yit policy hits <policyId> --bucket high
pnpm yit feed url <policyId>
pnpm yit feed print <policyId> --format rss
```

### 8. Rotate feed token

```bash
pnpm yit policy update <policyId> --rotate-feed-token
pnpm yit feed url <policyId>
```

### 9. Cron-friendly run

```bash
YIT_BASE_URL="http://localhost:48333" pnpm yit policy run <policyId> --triggered-by cron
```

### 10. Karaoke flow

```bash
# add/resolve track from YouTube URL
pnpm yit karaoke track add --url "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
pnpm yit karaoke track list --state ready --limit 10

# create a session and inspect queue
pnpm yit karaoke session create --name "Friday Night" --theme gold-stage
pnpm yit karaoke session show --id <sessionId>

# queue, start round, score, and leaderboard
pnpm yit karaoke queue add --session <sessionId> --track <trackId> --player Host
pnpm yit karaoke round start --session <sessionId> --item <queueItemId>
pnpm yit karaoke score add --session <sessionId> --item <queueItemId> --player Alice --cue <cueId> --expected 12000 --actual 12120
pnpm yit karaoke leaderboard --session <sessionId>

# playlist workflow
pnpm yit karaoke playlist create --name "Warmup Set" --description "Openers"
pnpm yit karaoke playlist add-item --playlist <playlistId> --track <trackId>
pnpm yit karaoke playlist queue --session <sessionId> --playlist <playlistId> --requested-by Host

# guest join + moderation
pnpm yit karaoke guest token --session <sessionId> --ttl 240
pnpm yit karaoke guest request-add --token <token> --track <trackId> --name "Sam"
pnpm yit karaoke guest request-list --session <sessionId>
pnpm yit karaoke guest request-handle --session <sessionId> --request <requestId> --action approve

# manifest-driven library (recommended for repeatable local setups)
pnpm yit karaoke library manifest-init --file manifests/karaoke/library.local.json
pnpm yit karaoke library manifest-validate --file manifests/karaoke/library.local.json
pnpm yit karaoke library manifest-import --file manifests/karaoke/library.local.json
pnpm yit karaoke library stats
```

## Ingest Flags

`yit ingest` supports useful operational switches:

- `--wait` block until completion
- `--logs` stream logs while waiting
- `--enrich-cli` run CLI-based enrichment
- `--diarize` run speaker diarization
- `--no-stt` disable STT fallback
- `--steps <csv>` explicit pipeline steps

## Automation Pattern

Use JSON mode with shell tools:

```bash
pnpm yit --json library --limit 5 | jq
```

## Troubleshooting

- If commands fail with connection errors, run `pnpm yit health`.
- If features are disabled, run `pnpm yit capabilities`.
- If semantic results are empty, verify embeddings provider in `/api/capabilities`.
- If discovery fails, verify `yt-dlp` is installed on the host.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for deeper diagnosis.
