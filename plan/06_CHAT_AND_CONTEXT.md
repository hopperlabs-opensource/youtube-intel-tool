# 06 - Chat And Context (Grounded, Tool-Driven)

## Status (V1 Implemented)
- Endpoints:
  - `POST /api/videos/:videoId/chat` (JSON)
  - `POST /api/videos/:videoId/chat/stream` (SSE)
- Retrieval:
  - cue-window around `at_ms`
  - keyword cues (FTS)
  - semantic chunks (pgvector) when embeddings/Ollama available
- Provenance:
  - `chat_turns` table stores request/retrieval/response + `trace_id`
- Citation scheme:
  - prompt references `S1..Sn`, model is instructed to cite `[S1]` style
  - server extracts `cited_refs` from the answer post-hoc

## Chat Goals
- Answers should cite timestamps and cue ranges.
- Chat should be aware of:
  - transcript content
  - user’s current time (`at_ms`)
  - selected entity/cue
  - cached context cards (wiki + db)

## “Tools” For The Chat Model
Expose internal operations as tools (function calling):
- `transcript_search(query, mode, limit)`
- `transcript_get_window(at_ms, window_ms)`
- `entities_list(at_ms, window_ms)`
- `entity_mentions(entity_id)`
- `context_get(at_ms, window_ms)`
- `video_seek(start_ms)` (UI action)

All tool inputs/outputs should have Zod schemas.

## RAG Strategy
- Default retrieval:
  - Window around `at_ms` (e.g. 2 minutes).
  - Semantic search over embeddings for query.
  - Merge and dedupe cues; keep a max token budget.
- Response format:
  - Assistant answer
  - citations (cue ids + start_ms/end_ms)

## Context Cards (Wikipedia + DB)
Pipeline:
1. Identify “active entities” around `at_ms`.
2. For each, lookup cached context items.
3. If missing or expired, enqueue context refresh.

Wikipedia provider:
- Use MediaWiki API for summary + canonical URL.
- Cache aggressively; set `expires_at` far in the future.

DB provider:
- Interface: `lookup(entity) -> cards`.
- Must be fast. Pre-index your DB by name/aliases.

## CLI-Backed Chat (Codex CLI / Gemini CLI / Claude Code)
Treat CLI providers as an optional “power mode”:
- Backend spawns the CLI process.
- Streams output via SSE.
- Hard gate behind config flag and auth.

Security rules for CLI providers:
- Allowlist exact executable + args.
- Run in a restricted working directory.
- No arbitrary shell.
- Timeouts and output size limits.

## Chat Session Storage
V1: client keeps history and sends it each request.
V2: server assigns a `session_id` and stores message history (Redis/Postgres).
