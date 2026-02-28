# 04 - Pipelines And Jobs (BullMQ + Idempotency)

## Job Types
- `ingest_video` (orchestrator job)
- `fetch_transcript`
- `normalize_transcript`
- `build_chunks`
- `build_embeddings`
- `extract_entities`
- `build_entity_index`
- `fetch_context_items`
- `refresh_context_cache`

## Ingest Orchestrator
`ingest_video(video_id, opts)`:
- Ensures Video exists.
- Ensures Transcript exists (fetch if missing).
- Normalizes cues.
- Builds chunks.
- Builds embeddings.
- Runs NER.
- Fetches context items for top entities.

## Idempotency + Caching Strategy
- Every job writes a “derived output record” with a deterministic key.
- If the output exists and is fresh, the job no-ops.

Examples:
- `fetch_transcript` checks `transcripts(video_id, language, source)` exists.
- `build_embeddings` checks `embeddings(chunk_id, model_id)` exists for all chunks.

## Concurrency
- `fetch_transcript`: low concurrency (avoid triggering rate limits).
- `build_embeddings`: higher concurrency but bounded (cost, provider limits).
- `extract_entities`: per-cue NER can be parallelized; merge step is serial.

## Retry / Backoff
- Exponential backoff for transient failures (429, 503).
- Max attempts by job type.
- Dead letter queue for debugging.

## Progress Reporting
Two options:
- Polling: `GET /api/jobs/:jobId`
- Push: Server-Sent Events `GET /api/jobs/:jobId/events`

Recommended V1: polling + periodic refresh (simpler).

## Artifacts & Debuggability
Every stage should write small artifacts:
- transcript raw payload
- normalized cues diff stats
- chunk boundaries
- NER output summary (counts by type)
- context lookup results (hits/misses)

Keep artifacts addressable by video_id + stage + timestamp/job_id.

