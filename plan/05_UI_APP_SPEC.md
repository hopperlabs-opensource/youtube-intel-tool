# 05 - UI App Spec (Next.js/React + Zustand)

## Core Layout
Primary layout: 3 columns with optional 4th “context” panel.
- Left: Transcript
- Center: Video
- Right: Tabs: Search | Chat | Entities
- Optional: Context (rightmost, or a collapsible section in right column)

```text
| Transcript (scroll) | Video Player | Search/Chat/Entities | Context |
```

## Key Interactions
- Click cue -> seek video -> set selected cue -> scroll transcript to cue.
- Follow mode:
  - When enabled, on time updates highlight active cue and keep it in view.
  - When user scrolls manually, temporarily disable follow until re-enabled.
- Hover entity in “Entities” list:
  - highlight mentions in transcript in the current window.
- Search results:
  - click -> seek and scroll
  - show why it matched (snippet + score)

## Performance Requirements
- Transcripts can be thousands of cues (10k+). Must be virtualized.
- Use `@tanstack/react-virtual` or `react-window`.
- Binary search cue index by `start_ms`.

## Client Data Layer
- Server state: TanStack Query
  - `useVideo(video_id)`
  - `useTranscriptCues(transcript_id, cursor paging)`
  - `useSearch(video_id, query)`
  - `useEntities(video_id, at_ms, window_ms)`
  - `useContext(video_id, at_ms, window_ms)`
- UI state: Zustand
  - `layout` (panel sizes, selected tab)
  - `player` (at_ms, isPlaying, followMode)
  - `selection` (selectedCueId, selectedEntityId)

## Suggested Zustand Store Shape (Sketch)
```ts
type UiState = {
  videoId: string | null;
  transcriptId: string | null;
  atMs: number;
  followMode: boolean;
  selectedCueId: string | null;
  selectedEntityId: string | null;
  rightTab: "search" | "chat" | "entities";
  setAtMs(ms: number): void;
  seekTo(ms: number): void; // calls player API via callback
};
```

## Transcript UX Details
- Render cue rows with:
  - timestamp badge (`mm:ss` or `hh:mm:ss`)
  - text
  - optional entity chips (if mentions in that cue)
- Active cue highlight should be subtle but obvious.
- When in follow mode, use `scrollIntoView({block:"center"})` with throttling.

## Video Player
- YouTube embed or native HTML5 (if you have the media).
- Prefer YouTube IFrame API for seeking and currentTime.
- Keep an abstraction: `PlayerAdapter`:
  - `getCurrentTimeMs()`
  - `seekToMs(ms)`
  - `onTimeUpdate(cb)`

