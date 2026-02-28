# API Reference

The API is served by Next.js route handlers under `apps/web/app/api`.

This API is intended for local/self-hosted usage. It is not a production-ready
public internet API without additional hardening.

Base URL (local):

```text
http://localhost:<YIT_WEB_PORT>  (default 3333)
```

## Conventions

- Content type: `application/json`
- Optional header for browser-supplied OpenAI fallback key: `x-openai-api-key: <key>`
- Validation: request and response schemas are defined with Zod in `packages/contracts`
- Error shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "...",
    "details": {}
  }
}
```

- Status codes:
  - `200` successful requests
  - `400` validation or dependency errors

## Health and Capabilities

- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/settings/openai`
- `GET /api/metrics`

Quick check:

```bash
BASE_URL="${YIT_BASE_URL:-http://localhost:${YIT_WEB_PORT:-3333}}"
curl -s "$BASE_URL/api/health" | jq
```

## Video Lifecycle

- `POST /api/videos/resolve`
- `GET /api/videos`
- `GET /api/videos/:videoId`
- `POST /api/videos/:videoId/ingest`

Resolve example:

```bash
BASE_URL="${YIT_BASE_URL:-http://localhost:${YIT_WEB_PORT:-3333}}"
curl -s -X POST "$BASE_URL/api/videos/resolve" \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' | jq
```

Ingest example:

```bash
BASE_URL="${YIT_BASE_URL:-http://localhost:${YIT_WEB_PORT:-3333}}"
curl -i -s -X POST "$BASE_URL/api/videos/<videoId>/ingest" \
  -H 'content-type: application/json' \
  -d '{"language":"en","steps":["enrich_cli","diarize"]}'
```

`POST /ingest` returns `x-trace-id` header for correlation.

## Jobs

- `GET /api/jobs/:jobId`
- `GET /api/jobs/:jobId/logs`
- `GET /api/jobs/:jobId/stream` (SSE)

SSE stream example:

```bash
BASE_URL="${YIT_BASE_URL:-http://localhost:${YIT_WEB_PORT:-3333}}"
curl -N "$BASE_URL/api/jobs/<jobId>/stream"
```

## Transcript and Search

- `GET /api/videos/:videoId/transcripts`
- `GET /api/transcripts/:transcriptId/cues`
- `GET /api/transcripts/:transcriptId/export?format=txt|vtt`
- `POST /api/videos/:videoId/search`
- `POST /api/search`

Global search example:

```bash
BASE_URL="${YIT_BASE_URL:-http://localhost:${YIT_WEB_PORT:-3333}}"
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
BASE_URL="${YIT_BASE_URL:-http://localhost:${YIT_WEB_PORT:-3333}}"
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
BASE_URL="${YIT_BASE_URL:-http://localhost:${YIT_WEB_PORT:-3333}}"
curl -s -X POST "$BASE_URL/api/videos/<videoId>/chat" \
  -H 'content-type: application/json' \
  -d '{
    "provider":"cli",
    "messages":[{"role":"user","content":"Summarize key points and cite [S1]."}]
  }' | jq
```

## Library Facets and Repair

- `GET /api/library/channels`
- `GET /api/library/topics`
- `GET /api/library/people`
- `GET /api/library/health`
- `POST /api/library/repair`

## YouTube Discovery (yt-dlp powered)

- `POST /api/youtube/search`
- `POST /api/youtube/channel/uploads`
- `POST /api/youtube/playlist/items`

If `yt-dlp` is missing, discovery endpoints return a structured error with
install guidance.

## Contract Source of Truth

For exact request and response fields, use:

- `packages/contracts/src/index.ts`

This is the canonical API contract for UI, CLI, and tests.
