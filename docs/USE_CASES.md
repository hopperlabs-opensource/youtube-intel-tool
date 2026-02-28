# Use Cases

These workflows show where the tool is strongest today.

## 1. Interview Research Assistant

Goal: extract claims, moments, and context from long-form interviews.

Workflow:

1. Ingest interview URLs.
2. Use global search (`/search`) for a question-style query.
3. Jump to exact timestamps from results.
4. Open chat on the source video for synthesis with citations.

Example query:

```text
What did the guest say about model evaluation tradeoffs?
```

Best features:

- Semantic search
- Click-to-seek transcript cues
- Grounded chat turns with provenance

## 2. Team Knowledge Library

Goal: create a searchable internal library from recorded talks.

Workflow:

1. Ingest a batch of videos.
2. Use library pages (`/library/videos`, `/library/channels`, `/library/topics`).
3. Track recurring entities and topics over time.
4. Use exports for selected transcript artifacts.

Best features:

- Faceted library views
- Entity extraction + mentions
- Repair page for broken library entries

## 3. Speaker and Topic Tracking

Goal: monitor recurring speakers and when specific ideas appear.

Workflow:

1. Ingest with diarization enabled.
2. Open speaker segments per video.
3. Relabel anonymous speaker keys in UI.
4. Search for topic terms and compare moments by speaker.

Best features:

- Diarization segments
- Cue-level speaker assignment
- Per-video and global search

## 4. Editorial QA for Video Content

Goal: quickly answer "who said what, and when?" for editing and publishing.

Workflow:

1. Ingest the source video.
2. Use transcript panel and timestamp jumps.
3. Validate quotes with cue-level snippets.
4. Export transcript to text or VTT.

Best features:

- Timestamp-accurate cue browsing
- Export endpoints
- Fast correction loop via search + playback

## 5. Discovery Before Ingestion

Goal: evaluate channels/playlists before committing local storage.

Workflow:

1. Use `/youtube` discovery UI.
2. Search channels or playlists through yt-dlp-backed APIs.
3. Selectively ingest only high-value videos.

Best features:

- No API keys required for discovery
- Controlled ingestion decisions

## Recommended Rollout Order

1. Start with a single channel and 10 to 20 videos.
2. Validate search quality and entity quality.
3. Enable embeddings and diarization once baseline is stable.
4. Expand to a larger library with observability enabled.
