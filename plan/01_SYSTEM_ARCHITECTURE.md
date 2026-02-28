# 01 - System Architecture

## High-Level Components
- **Web App (UI + BFF API)**: Next.js app that serves UI and hosts “API routes” (or a separate API service).
- **Worker(s)**: BullMQ workers processing ingestion and enrichment jobs.
- **Postgres (pgvector)**: canonical storage + FTS + vector search.
- **Redis**: BullMQ queues, rate limiting, SSE session state if needed.
- **Artifacts Store**: local disk for dev; optional S3-compatible storage later.
- **Observability Stack**: Prometheus scrape + Grafana dashboards.

## Reference Topology
```mermaid
flowchart LR
  UI[Next.js UI] -->|HTTP| API[Next.js API routes / BFF]
  API -->|SQL| PG[(Postgres + pgvector)]
  API -->|enqueue| Q[(Redis / BullMQ)]
  W[Worker] -->|dequeue| Q
  W -->|SQL| PG
  W -->|Artifacts| FS[(Local artifacts or S3)]
  Prom[Prometheus] -->|scrape /metrics| API
  Prom -->|scrape /metrics| W
  Graf[Grafana] --> Prom
```

## Key Flows

### 1) Ingest Video (URL -> transcript)
```mermaid
sequenceDiagram
  participant U as User
  participant UI as Web UI
  participant API as API/BFF
  participant Q as Queue
  participant W as Worker
  participant PG as Postgres

  U->>UI: Paste YouTube URL
  UI->>API: POST /api/videos/resolve {url}
  API->>PG: upsert Video record
  API-->>UI: {video_id}
  UI->>API: POST /api/videos/:id/ingest
  API->>Q: enqueue fetch_transcript(video_id)
  API-->>UI: {job_id}
  W->>Q: fetch job
  W->>PG: write Transcript + Cues
  W-->>API: job progress events (optional)
  UI->>API: GET /api/jobs/:job_id
  API-->>UI: status=completed + transcript_id
```

### 2) Playback Sync (video time -> active cue)
UI polls `player.currentTime` and:
- Converts seconds -> `at_ms`.
- Finds current cue via binary search on `cues[i].start_ms`.
- Highlights that cue; optionally auto-scroll.

### 3) Search -> Jump
- Keyword search uses Postgres FTS on `norm_text`.
- Semantic search uses pgvector over chunk embeddings.
- Results return `cue_id` + `start_ms`, so UI can seek and scroll.

## Technology Choices (Recommended)
- UI: Next.js (App Router), React, Tailwind, TanStack Query.
- State: Zustand for UI state (panels, follow-mode, selection).
- API contracts: Zod (request/response).
- Worker: BullMQ.
- DB: Postgres + pgvector + FTS.
- Embeddings:
  - Local: Ollama embedding model (`nomic-embed-text`) if available.
  - Hosted: OpenAI/Anthropic embeddings as optional.
- NER:
  - Deterministic: spaCy (Python worker) for speed.
  - Optional: LLM-based for improved entity linking.

## Core Interfaces (Pluggable Providers)

### TranscriptProvider
- `fetchTranscript({provider_video_id, language}) -> TranscriptCue[]`
- returns cue `text`, `start_ms`, `duration_ms` (or end_ms).

### EmbeddingProvider
- `embed({texts[]}) -> vectors[]`
- tracks: model_id, dimensions, cost, latency.

### NerProvider
- `extract({text, cues}) -> Entities + Mentions`
- must map mentions back to cue/time. (Use per-cue NER first, then merge entities.)

### ContextProvider
- `lookup(entity) -> ContextItem[]`
- Wikipedia provider, plus “Your DB” provider(s).

