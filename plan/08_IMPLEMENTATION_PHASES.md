# 08 - Implementation Phases (Concrete Deliverables)

## Phase 0: Skeleton + Contracts (1-2 days)
- Repo setup (Next.js app + worker + DB).
- Zod contracts for all core endpoints.
- Basic DB migrations for videos/transcripts/cues/jobs.
- Minimal job runner + queue.

Acceptance:
- `POST /videos/resolve` works.
- `POST /videos/:id/ingest` enqueues job.
- `GET /jobs/:id` returns progress.

## Phase 1: Transcript Viewer MVP (2-4 days)
- Fetch transcript (best effort provider for local dev).
- Store cues.
- UI: video + transcript panel.
- Click-to-seek + follow mode + virtualization.

Acceptance:
- Paste URL, watch video, transcript follows, click cue seeks.

## Phase 2: Keyword Search + Jump (1-2 days)
- Postgres FTS over normalized cues.
- UI search results with timestamps.

Acceptance:
- Search hits are relevant and jump to correct time.

## Phase 3: Embeddings + Semantic Search (2-5 days)
- Chunker + embeddings pipeline.
- pgvector index.
- Hybrid search endpoint.

Acceptance:
- Semantic queries find “concept matches” not exact phrases.

## Phase 4: NER + Mentions Timeline (3-7 days)
- NER provider (start deterministic).
- UI entity list + mentions + highlight in transcript.

Acceptance:
- Entities show up with time-aligned mentions; click mention seeks.

## Phase 5: Context Cards (2-6 days)
- Wikipedia provider + caching.
- Context panel updates based on active entities.
- DB context provider interface.

Acceptance:
- As you watch, context cards update and are useful.

## Phase 6: Grounded Chat (3-10 days)
- SSE chat endpoint.
- Tools: window retrieval, search, entities, context.
- Citations with timestamps.

Acceptance:
- Chat answers cite video timestamps; “jump” actions work.

## Phase 7: CLI Power Mode (optional)
- CLI provider wrapper + sandbox.
- UI toggle.

Acceptance:
- It works locally without compromising safety.

