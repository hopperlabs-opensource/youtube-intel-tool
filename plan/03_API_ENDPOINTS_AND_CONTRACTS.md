# 03 - API Endpoints And Contracts (Zod-First)

The API should be “contracts-first”: define Zod schemas for requests/responses and reuse them:
- server validation
- client types
- docs

## Conventions
- IDs are strings (UUID/ULID).
- Times are integers in **milliseconds**: `start_ms`, `end_ms`.
- All write endpoints return `{ job_id }` for async work when non-trivial.
- Errors return a stable shape: `{ error: { code, message, details? } }`

## Shared Schemas (Sketch)
```ts
import { z } from "zod";

export const IdSchema = z.string().min(1);
export const MsSchema = z.number().int().nonnegative();

export const VideoSchema = z.object({
  id: IdSchema,
  provider: z.enum(["youtube"]),
  provider_video_id: z.string().min(1),
  url: z.string().url(),
  title: z.string().nullable().optional(),
  channel_name: z.string().nullable().optional(),
  duration_ms: MsSchema.nullable().optional(),
});

export const TranscriptCueSchema = z.object({
  id: IdSchema,
  idx: z.number().int().nonnegative(),
  start_ms: MsSchema,
  end_ms: MsSchema,
  text: z.string(),
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
```

## Core Endpoints

### Resolve URL -> Video
`POST /api/videos/resolve`
- Request:
```json
{ "url": "https://www.youtube.com/watch?v=..." }
```
- Response:
```json
{ "video": { "id": "...", "provider":"youtube", "provider_video_id":"...", "url":"..." } }
```

### Start Ingest (fetch transcript + optional enrich)
`POST /api/videos/:videoId/ingest`
- Request:
```json
{
  "language": "en",
  "transcript_provider": "best_effort",
  "steps": ["fetch_transcript", "normalize", "chunk", "embed", "ner", "context"]
}
```
- Response:
```json
{ "job_id": "..." }
```

### Get Job Status
`GET /api/jobs/:jobId`
- Response:
```json
{
  "job": {
    "id":"...",
    "type":"ingest_video",
    "status":"running",
    "progress": 42,
    "output": { "video_id":"...", "transcript_id":"..." }
  }
}
```

### List Transcripts For Video
`GET /api/videos/:videoId/transcripts`
- Response:
```json
{ "transcripts": [ { "id":"...", "language":"en", "is_generated":true, "source":"best_effort" } ] }
```

### Fetch Transcript Cues (paged or full)
`GET /api/transcripts/:transcriptId/cues?cursor=<idx>&limit=500`
- Response:
```json
{
  "cues": [
    { "id":"...", "idx":0, "start_ms":160, "end_ms":3600, "text":"..." }
  ],
  "next_cursor": 500
}
```

### Export Transcript
`GET /api/transcripts/:transcriptId/export?format=vtt|srt|txt`
- Response: file stream

## Search Endpoints

### Keyword / Hybrid Search
`POST /api/videos/:videoId/search`
- Request:
```json
{ "query":"closing the loop", "mode":"hybrid", "limit": 20 }
```
- Response:
```json
{
  "hits": [
    {
      "cue_id":"...",
      "start_ms": 3600000,
      "end_ms": 3603500,
      "score": 0.82,
      "snippet":"...closing the loop..."
    }
  ]
}
```

## Entities + Context

### List Entities (optionally around a timestamp window)
`GET /api/videos/:videoId/entities?at_ms=...&window_ms=120000`
- Response:
```json
{ "entities": [ { "id":"...", "type":"person", "canonical_name":"..." } ] }
```

### Mentions For Entity
`GET /api/videos/:videoId/entities/:entityId/mentions?limit=200`
- Response:
```json
{ "mentions": [ { "cue_id":"...", "start_ms":123, "end_ms":456, "surface":"..." } ] }
```

### Context Cards For “Now”
`GET /api/videos/:videoId/context?at_ms=...&window_ms=120000`
- Response:
```json
{
  "cards": [
    {
      "entity": { "id":"...", "canonical_name":"..." },
      "items": [
        { "source":"wikipedia", "title":"...", "url":"...", "snippet":"..." }
      ]
    }
  ]
}
```

## Chat (SSE)
We want chat grounded in transcript + the current playhead.

`POST /api/videos/:videoId/chat/stream`
- Request:
```json
{
  "provider": "openai|anthropic|gemini|ollama|cli",
  "model_id": "...",
  "at_ms": 3600123,
  "messages": [ { "role":"user", "content":"Summarize what he said about burnout." } ]
}
```
- Response: `text/event-stream` with events:
```json
{ "type":"text", "delta":"..." }
{ "type":"tool_call", "name":"transcript_search", "args":{...} }
{ "type":"tool_result", "name":"transcript_search", "result":{...} }
{ "type":"citation", "start_ms":..., "end_ms":..., "cue_ids":[...] }
{ "type":"done" }
```

### Chat Provenance (Stored Turns)
`GET /api/videos/:videoId/chat/turns?limit=50`

`GET /api/chat/turns/:turnId`

## Control Plane Endpoints (Admin/Debug)
- `GET /metrics` (Prometheus)
- `GET /api/admin/queues` (depth + active)
- `POST /api/admin/retry/:jobId`
- `POST /api/admin/cancel/:jobId`
