# 00 - Scope And Principles

## Product Definition
**YouTube Intel Tool** is a local-first (then team-ready) system that turns a video URL into:
- A time-aligned transcript (cues with timestamps).
- Enriched data (entities, mentions, topics/chapters).
- Query surfaces (search, entity browsing, chat).
- A viewing experience (video + transcript follow + context sidebar).
- An API/control-plane to run ingestion/enrichment as jobs with logs and metrics.

## Primary User Stories
- Paste a URL, get transcript with timestamps.
- Click any transcript line and the video seeks to that time.
- While watching, transcript auto-scrolls and highlights the current cue.
- Search for a phrase or idea and jump to the best timestamp.
- See named entities (people/orgs/locations/products/events) and where they appear in time.
- While watching, see “context cards” (Wikipedia + your DB) about the entities currently being discussed.
- Ask questions like “what did he say about burnout?” and get grounded answers with citations pointing to timestamps.
- Export: VTT/SRT, JSON, “shareable excerpt” (time ranges + quotes, optionally redacted).

## Non-Goals (For V1)
- Full automatic speaker diarization (requires audio pipeline; big scope).
- Perfect entity linking/disambiguation at scale (start with high precision, then iterate).
- Running a public SaaS (assume internal tool, controlled environment, authenticated).

## Design Principles
- **Pluggable connectors**: transcript fetching, embeddings, NER, context sources should be swappable.
- **Canonical data + derived indexes**: store raw transcript cues, then build search/vector/entity indexes as derived artifacts.
- **Idempotent jobs**: running the same job twice should not duplicate data; use deterministic keys.
- **Time is the primary key**: nearly every feature should anchor back to `start_ms/end_ms`.
- **Contracts first**: define Zod schemas for every endpoint; generate types and clients from them.
- **Observable by default**: queue depth, job durations, per-stage success rates, and LLM costs are first-class.
- **Privacy + governance**: protect stored transcripts, prompts, and any external context; minimize PII.

## Deployment Targets
- Local dev: single machine with Docker Compose (Postgres + Redis), Node/Next, worker.
- Team dev: same, but with auth/RBAC and object storage for artifacts.

## Transcript Acquisition Constraints (Reality Check)
You need to decide which lane you’re in:
- Lane A (recommended for “real” deployments): YouTube Data API Captions with OAuth and proper permissions.
- Lane B (best effort local): scrape/extract captions using tools/libraries.

Plan for both:
- Implement transcript providers behind an interface:
  - `YouTubeCaptionsApiProvider` (official)
  - `YtDlpProvider` (local)
  - `TranscriptApiProvider` (local)
- Persist `source=official|best_effort`, `is_generated`, and `confidence`.

