# Competitor Audit (Time-Boxed)

Date: 2026-02-13  
Audited code pulled into: `.competitors/`

Targets:
- TubeArchivist: `.competitors/tubearchivist`
- SubTubular: `.competitors/subtubular`

This doc is intentionally pragmatic: what to copy (patterns), what to avoid, and what we should do differently to win as an "agent-grade" YouTube intel tool.

---

## Licensing (Non-Negotiable)

### TubeArchivist
- License: **GPLv3** (`.competitors/tubearchivist/LICENSE`).
- Practical implication: **do not copy or reuse TubeArchivist code** unless this project is willing to become GPLv3-compatible.
- OK: copy *ideas/patterns* and re-implement.

### SubTubular
- License: **MIT** (`.competitors/subtubular/LICENSE`).
- Practical implication: patterns are safe, and code reuse is legally possible, but it’s a **C#/F#** codebase so we’d realistically *port concepts*, not drop code in.

---

## What They Prove (Market Reality)

1. People will absolutely use tools that let them:
   - Search across *lots* of videos (channels/playlists), not one-off.
   - Jump to the exact timestamp of a match.
   - Iterate quickly using caching and good defaults.
2. "Search UI with verticals" (videos/channels/playlists/subtitles) is a stable, proven mental model.

---

## TubeArchivist (Patterns Worth Copying)

TubeArchivist is a self-hosted **archive + media server** for YouTube built around:
- `yt-dlp` downloads
- indexing/search via **Elasticsearch**
- a React UI with **unified search** and **result verticals**

### 1) Unified Search With Explicit Verticals
Code:
- Search query parser and ES query building: `backend/common/src/searching.py`
- UI search page: `frontend/src/pages/Search.tsx`

Observed pattern:
- One search box, results grouped into:
  - Video results
  - Channel results
  - Playlist results
  - Fulltext (subtitles) results
- A query prefix changes the search mode (`video:`, `channel:`, `playlist:`, `full:`).
- Fulltext search supports filters like `lang:` and `source:` (auto vs user).

What we should copy:
- Search page that feels like Google:
  - Search input at top
  - Vertical tabs (or sections) for `All | Videos | People | Topics | Channels | Captions`
  - Scoped filters drive query params + API filters

### 2) Subtitle Index as First-Class Records
Code:
- ES mapping excerpt: `backend/appsettings/index_mapping.json` (`index_name: subtitle`)
- Fulltext query + highlight: `backend/common/src/searching.py` (`_build_fulltext`)

Observed pattern:
- Each subtitle fragment is indexed with:
  - `youtube_id`, `title`, `subtitle_line`, `subtitle_start`, `subtitle_end`, `subtitle_lang`, `subtitle_source`, `subtitle_channel`, etc.
- Search highlights the matching `subtitle_line`.

What we should copy:
- Treat cue-level transcript lines like first-class search rows.
- Store enough metadata on each cue to render meaningful search results without extra DB round-trips.

### 3) “Embedded Player on Search Page”
Code:
- `frontend/src/pages/Search.tsx` (reads `videoId` query param and renders `EmbeddableVideoPlayer`)

Observed pattern:
- Search results can drive a player preview so users can jump around without leaving search.

What we should copy:
- Optional “player preview” mode in `/search`:
  - selecting a hit updates `?videoId=...&t=...` and plays the moment
  - keeps the search context visible

### 4) Operational Hardening Lessons
TubeArchivist docs explicitly call out:
- Port collisions
- ES disk watermark causing read-only indices
- `vm.max_map_count` tuning for ES

What we should copy:
- Similar “production friction” guidance for our stack:
  - infra health checks
  - disk pressure warnings
  - “what breaks first” docs

What we should *not* copy:
- Elasticsearch dependency unless we absolutely need it.
  - ES buys great search features, but adds heavy ops + failure modes.
  - For our tool: Postgres FTS + pg_trgm + vectors is likely enough for v1.

---

## SubTubular (Patterns Worth Copying)

SubTubular is a **local-first** GUI+CLI that:
- searches **captions + metadata**
- supports channel/playlist/video scopes
- returns **timestamped** results
- caches aggressively to make iteration fast

### 1) Scope Model: Channels / Playlists / Videos
Doc:
- `ReadMe.md` (scope options, caching model)

Observed pattern:
- User searches within explicit scopes:
  - `search channels ...`
  - `search playlists ...`
  - `search videos ...`
- Each scope supports:
  - `--skip`, `--take` to constrain work
  - `--cache-hours` to control freshness

What we should copy:
- Scope as a first-class concept in our UI + CLI:
  - UI: facet chips and “search within” selectors (Channels, Topics, People)
  - CLI: `--channel`, `--playlist`, `--since`, `--limit`, `--refresh`

### 2) Strong Full-Text Query Syntax (Not Just “contains”)
Doc:
- `ReadMe.md` references LIFTI query syntax (fuzzy, wildcard, phrase, proximity, field restrictions).
Code:
- Indexing: `SubTubular/VideoIndex.cs`

Observed pattern:
- One query language that supports:
  - fuzzy terms
  - wildcards
  - phrase matches
  - proximity (“near”)
  - field restrictions (title/description/keywords/captions)

What we should copy:
- For *deterministic* search: implement a query DSL that maps to:
  - Postgres `websearch_to_tsquery` for the basic case
  - `pg_trgm` similarity for fuzzy/wildcard fallback
  - (optional) a richer parser later for proximity/sequence

### 3) Timestamp Mapping via “FullText Index -> Caption” Table
Code:
- Build caption fulltext + mapping: `SubTubular/Video.cs` (see `GetCaptionAtFullTextIndex`)
- Build snippet + timestamp from match offsets: `SubTubular/VideoSearchResult.cs` (`SyncWithCaptions`)

Observed pattern:
- Captions are concatenated into full text.
- A dictionary maps “character offset in fulltext” -> “caption object w/ timestamp”.
- Search matches return offsets; offsets map back to captions; captions map to timestamps.
- Result snippet is generated by “padding” around the match.

What we should copy (adapted to our cue model):
- Store cues as the primitive:
  - each cue already has `start_ms`, `end_ms`, `text`
- For keyword search:
  - match inside cue text directly
  - build a snippet by taking N cues around the match (or padding by ms)
- For semantic search:
  - return chunk hit, then offer “refine within this time window” keyword search to pinpoint cue hits

### 4) “Search YouTube” Without API Keys (Discovery)
Doc + code:
- SubTubular uses YoutubeExplode (no API key) to:
  - resolve channels by handle/slug/user
  - list uploads playlist
  - load playlists/videos

What we should copy (but using our preferred tooling):
- Implement YouTube discovery via **CLI tools** (fits your constraint):
  - use `yt-dlp --dump-single-json` and `--flat-playlist` for channel/playlist listing
  - use `yt-dlp "ytsearchN:QUERY"` for YouTube search
  - store results in our DB with a TTL
- This becomes the basis of a real “Search YouTube” page and “ingest selected” flows.

---

## Copy / Ignore / Differentiate (Concrete)

### Copy (High ROI)
1. **Vertical search UI** (TubeArchivist): unified search + grouped results.
2. **Scopes + caching knobs** (SubTubular): channel/playlist/video scopes, skip/take, TTL.
3. **Time-aligned result snippets** (SubTubular): predictable “jump to moment” output.
4. **YouTube discovery** without API keys (SubTubular concept; implement via `yt-dlp`).

### Ignore (Wrong Fit)
1. **Direct code reuse** from TubeArchivist (GPLv3).
2. **Full video archiving** as a requirement (TubeArchivist focus). Optional later.
3. **Elasticsearch** as a default dependency. Consider only if Postgres FTS + vectors is insufficient.

### Differentiate (Where We Can Win)
1. **Agent-grade provenance**
   - every ingest job: trace id, logs, artifacts, retries, outputs
   - every chat response: retrieval JSON + citations back to cues
2. **Enrichment pipeline that is CLI-first**
   - Gemini/Claude/Codex CLI orchestration for NER/topic tagging/outlines
   - deterministic baseline + optional “CLI override”
3. **Diarization + (future) identity labeling**
   - anonymous speakers + segments + cue assignment (already in our stack)
   - manual labeling “Speaker 0 -> Lex”
4. **Faceted library search: People | Topics | Channels**
   - SubTubular has scopes; we can go further by adding derived facets + graph edges.

---

## Implications For Our Next Architecture Pass

1. Add **YouTube discovery** surface:
   - UI page: `/youtube/search`
   - CLI: `pnpm yit youtube search "<q>"`, `... youtube channel <handle> --take 50`
   - Implementation: `yt-dlp`-backed provider (no API keys)

2. Add **library facets**:
   - Pages: `/library/videos`, `/library/channels`, `/library/people`, `/library/topics`
   - Search scopes: `?channels=...&people=...&topics=...`

3. Add **deterministic full-text** (first) + semantic (second):
   - baseline: Postgres FTS for cue text + title/description
   - semantic: embeddings for recall + then cue refinement for precision

4. Make results feel “obviously clickable”:
   - every hit has: video card (thumbnail/title/channel), timestamp, snippet
   - click -> seeks player + scroll transcript + highlights cue

