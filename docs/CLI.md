# CLI Reference (`yit`)

The CLI uses the same HTTP API as the web app, so it is ideal for scripting,
smoke tests, and automation.

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
YIT_BASE_URL=http://localhost:3333 pnpm yit --json health
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
