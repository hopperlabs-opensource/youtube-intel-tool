# 02 - Data Model

Assume Postgres (pgvector enabled). This is a “canonical + derived” schema.

## Canonical Tables

### videos
- `id` (uuid/ulid)
- `provider` (enum: `youtube`)
- `provider_video_id` (string, unique per provider)
- `url` (string)
- `title` (string, nullable)
- `channel_name` (string, nullable)
- `duration_ms` (int, nullable)
- `created_at`, `updated_at`

Indexes:
- unique `(provider, provider_video_id)`

### transcripts
- `id`
- `video_id` (fk)
- `language` (e.g. `en`)
- `source` (enum: `official|best_effort`)
- `is_generated` (bool)
- `fetched_at`
- `provider_payload_json` (jsonb, nullable)

Indexes:
- `(video_id, language)`

### transcript_cues
- `id`
- `transcript_id` (fk)
- `idx` (int) increasing
- `start_ms` (int)
- `end_ms` (int)
- `text` (text)
- `norm_text` (text) normalized for search
- `tsv` (tsvector) generated from `norm_text` (optional)

Indexes:
- `(transcript_id, idx)` unique
- `(transcript_id, start_ms)`
- FTS: `GIN(tsv)`

## Derived Tables

### transcript_chunks
Chunk = group of consecutive cues for embeddings + semantic search.
- `id`
- `transcript_id`
- `start_ms`, `end_ms`
- `text` (text)
- `cue_range` (int4range or json)
- `token_estimate` (int)

Indexes:
- `(transcript_id, start_ms)`

### embeddings
Using pgvector:
- `id`
- `video_id`
- `transcript_id`
- `chunk_id` (fk)
- `model_id`
- `dimensions`
- `embedding` (vector)
- `text_hash` (for idempotency)
- `created_at`

Indexes:
- ivfflat/hnsw on `embedding` (depending on pgvector version)
- `(chunk_id, model_id)` unique

### entities
Entity canonical record per video (or global, but start per-video).
- `id`
- `video_id`
- `type` (person|org|location|product|event|other)
- `canonical_name`
- `aliases` (text[])
- `created_at`

Indexes:
- `(video_id, canonical_name)`

### entity_mentions
Mentions tied to cues/time windows.
- `id`
- `entity_id`
- `cue_id`
- `start_ms`, `end_ms` (copy from cue for fast window queries)
- `surface` (text)
- `confidence` (real)

Indexes:
- `(entity_id, start_ms)`
- `(cue_id)`
- `(video_id, start_ms)` via join or denormalized `video_id`

### context_items
Cache external lookups (Wikipedia/DB).
- `id`
- `entity_id`
- `source` (wikipedia|db|custom)
- `source_id` (page id / db id)
- `title`
- `snippet`
- `url`
- `payload_json` (jsonb)
- `fetched_at`
- `expires_at`

Indexes:
- `(entity_id, source)`

## Jobs / Control Plane

### jobs
- `id`
- `type` (fetch_transcript|normalize|ner|embed|context|chat_trace)
- `status` (queued|running|completed|failed|canceled)
- `progress` (0-100)
- `input_json`, `output_json`
- `error`
- `created_at`, `started_at`, `finished_at`

### job_logs (optional)
- `id`
- `job_id`
- `ts`
- `level`
- `message`
- `data_json`

### chat_turns
Chat provenance table (one row per chat turn).
- `id`
- `video_id`, `transcript_id`
- `trace_id`
- `provider`, `model_id`
- `status`
- `at_ms`
- `request_json` (messages + options)
- `retrieval_json` (window + hit counts + embedding_error)
- `response_text`, `response_json` (answer + cited_refs + sources)
- `error`
- `created_at`, `finished_at`, `duration_ms`

## Artifacts Layout (dev)
Store debug artifacts by deterministic key:
- `artifacts/videos/<video_id>/transcripts/<transcript_id>/raw.json`
- `artifacts/videos/<video_id>/transcripts/<transcript_id>/export.vtt`
- `artifacts/videos/<video_id>/enrichment/ner/<job_id>.json`
- `artifacts/videos/<video_id>/enrichment/context/<job_id>.json`

## Idempotency Keys
- Transcript fetch: `(provider, provider_video_id, language, source_provider_version)`
- Cue write: `(transcript_id, idx)`
- Chunking: `(transcript_id, start_ms, end_ms, chunker_version)`
- Embedding: `(chunk_id, model_id, text_hash)`
- NER: `(transcript_id, ner_model_id, ner_version)`
- Context: `(entity_id, source, source_id)`
