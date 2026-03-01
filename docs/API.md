# API Reference
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- API handlers live under `apps/web/app/api`.
- Base URL is local: `http://localhost:<YIT_WEB_PORT>` (default `3333`).
- Contracts are defined in `packages/contracts/src/index.ts`.

> ⚠️ **Watch out**
> This API is designed for local/self-hosted usage and is not hardened as a public internet API by default.

## Conventions

- Content type: `application/json`
- Optional header for browser-supplied OpenAI fallback key: `x-openai-api-key: <key>`
- Validation: request/response schemas use Zod contracts in `packages/contracts`
- Error envelope:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "...",
    "details": {}
  }
}
```

- Typical status codes:
  - `200` success
  - `400` validation/dependency errors
  - `404` resource not found

## Base URL

```text
http://localhost:<YIT_WEB_PORT>  (default 3333)
```

Helper used in examples:

```bash
BASE_URL="${YIT_BASE_URL:-http://localhost:${YIT_WEB_PORT:-3333}}"
```

## Health and Capabilities

- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/settings/openai`
- `GET /api/metrics`

Example:

```bash
curl -s "$BASE_URL/api/health" | jq
curl -s "$BASE_URL/api/capabilities" | jq
```

## Video Lifecycle

- `POST /api/videos/resolve`
- `GET /api/videos`
- `GET /api/videos/:videoId`
- `POST /api/videos/:videoId/ingest`
- `GET /api/videos/:videoId/chapters`
- `GET /api/videos/:videoId/tags`

Resolve example:

```bash
curl -s -X POST "$BASE_URL/api/videos/resolve" \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' | jq
```

Ingest example:

```bash
curl -i -s -X POST "$BASE_URL/api/videos/<videoId>/ingest" \
  -H 'content-type: application/json' \
  -d '{"language":"en","steps":["enrich_cli","diarize"]}'
```

`POST /ingest` returns an `x-trace-id` header for correlation.
If `videoId` does not exist, it returns `404` with a contract error envelope.

## Jobs

- `GET /api/jobs/:jobId`
- `GET /api/jobs/:jobId/logs`
- `GET /api/jobs/:jobId/stream` (SSE)

SSE example:

```bash
curl -N "$BASE_URL/api/jobs/<jobId>/stream"
```

## Transcripts and Search

- `GET /api/videos/:videoId/transcripts`
- `GET /api/transcripts/:transcriptId/cues`
- `GET /api/transcripts/:transcriptId/export?format=txt|vtt`
- `POST /api/videos/:videoId/search`
- `POST /api/search`

Global search example:

```bash
curl -s -X POST "$BASE_URL/api/search" \
  -H 'content-type: application/json' \
  -d '{"query":"retrieval quality","mode":"hybrid","limit":10}' | jq
```

## Entities, Context, and Speakers

- `GET /api/videos/:videoId/entities`
- `GET /api/videos/:videoId/entities/:entityId/mentions`
- `GET /api/videos/:videoId/context`
- `GET /api/videos/:videoId/speakers`
- `GET /api/videos/:videoId/speakers/segments`
- `PATCH /api/videos/:videoId/speakers/:speakerId`

Speaker relabel example:

```bash
curl -s -X PATCH "$BASE_URL/api/videos/<videoId>/speakers/<speakerId>" \
  -H 'content-type: application/json' \
  -d '{"label":"Host"}' | jq
```

## Chat

- `POST /api/videos/:videoId/chat`
- `POST /api/videos/:videoId/chat/stream` (SSE)
- `GET /api/videos/:videoId/chat/turns`
- `GET /api/chat/turns/:turnId`

Chat example:

```bash
curl -s -X POST "$BASE_URL/api/videos/<videoId>/chat" \
  -H 'content-type: application/json' \
  -d '{
    "provider":"cli",
    "messages":[{"role":"user","content":"Summarize key points and cite [S1]."}]
  }' | jq
```

## Library and Repair

- `GET /api/library/channels`
- `GET /api/library/topics`
- `GET /api/library/people`
- `GET /api/library/health`
- `POST /api/library/repair`

## Saved Policies and Feeds

- `GET /api/policies`
- `POST /api/policies`
- `GET /api/policies/:policyId`
- `PATCH /api/policies/:policyId`
- `POST /api/policies/:policyId/run`
- `GET /api/policies/:policyId/runs`
- `GET /api/policies/:policyId/hits`
- `GET /api/feeds/:policyId.json?token=<feed_token>`
- `GET /api/feeds/:policyId.rss?token=<feed_token>`

Create policy example:

```bash
curl -s -X POST "$BASE_URL/api/policies" \
  -H 'content-type: application/json' \
  -d '{
    "name":"daily-rag",
    "search_payload":{"query":"retrieval quality","mode":"hybrid","limit":20,"language":"en"},
    "priority_config":{"weights":{"recency":0.3,"relevance":0.6,"channel_boost":0.1},"thresholds":{"high":0.85,"medium":0.55}}
  }' | jq
```

Run policy now:

```bash
curl -s -X POST "$BASE_URL/api/policies/<policyId>/run" \
  -H 'content-type: application/json' \
  -d '{"triggered_by":"cli"}' | jq
```

Consume feed:

```bash
curl -s "$BASE_URL/api/feeds/<policyId>.json?token=<feed_token>" | jq
curl -s "$BASE_URL/api/feeds/<policyId>.rss?token=<feed_token>"
```

Policy/feed error semantics:
- Invalid or missing feed token -> `401 unauthorized`
- `PATCH /api/policies/:policyId` with empty body -> `400 invalid_request`

## Karaoke Sessions (Eureka Karaoke Tube)

- `POST /api/karaoke/tracks/resolve`
- `GET /api/karaoke/tracks`
- `GET /api/karaoke/tracks/:trackId`
- `POST /api/karaoke/sessions`
- `GET /api/karaoke/sessions/:sessionId`
- `PATCH /api/karaoke/sessions/:sessionId`
- `POST /api/karaoke/sessions/:sessionId/queue`
- `PATCH /api/karaoke/sessions/:sessionId/queue/:itemId`
- `POST /api/karaoke/sessions/:sessionId/rounds/start`
- `POST /api/karaoke/sessions/:sessionId/scores/events`
- `GET /api/karaoke/sessions/:sessionId/leaderboard`
- `GET /api/karaoke/themes`

Resolve and queue example:

```bash
# 1) resolve/add track
TRACK_ID="$(
  curl -s -X POST "$BASE_URL/api/karaoke/tracks/resolve" \
    -H 'content-type: application/json' \
    -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","language":"en"}' \
  | jq -r '.track.id'
)"

# 2) create session
SESSION_ID="$(
  curl -s -X POST "$BASE_URL/api/karaoke/sessions" \
    -H 'content-type: application/json' \
    -d '{"name":"Friday Session","theme_id":"gold-stage"}' \
  | jq -r '.session.id'
)"

# 3) add queue item
curl -s -X POST "$BASE_URL/api/karaoke/sessions/$SESSION_ID/queue" \
  -H 'content-type: application/json' \
  -d "{\"track_id\":\"$TRACK_ID\",\"requested_by\":\"Host\"}" | jq
```

## YouTube Discovery (yt-dlp)

- `POST /api/youtube/search`
- `POST /api/youtube/channel/uploads`
- `POST /api/youtube/playlist/items`

If `yt-dlp` is missing, discovery endpoints return a structured install-guidance error.

## Contract Source Of Truth

For exact fields and schema evolution, use:
- `packages/contracts/src/index.ts`

This is the canonical API contract for web UI, CLI, SDK, and tests.
