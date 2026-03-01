# Competitor Patterns To Port
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Mirror competitor repos locally with `pnpm research:sync`.
- Keep `.competitors/` gitignored and reference-only.
- Port patterns, not source code, with strict contract-first implementation.

## Local Mirror Command

```bash
pnpm research:sync
```

Repos are synced to `.competitors/` (gitignored).

## License Guardrails

| Repo | License | Safe Usage Rule |
| --- | --- | --- |
| TubeArchivist | GPL-3.0 | Ideas only; no code reuse |
| Pinchflat | AGPL-3.0 | Ideas only; no code reuse |
| ytdl-sub | GPL-3.0 | Ideas only; no code reuse |
| TubeSync | AGPL-3.0 | Ideas only; no code reuse |
| youtube-transcript-api | MIT | Concepts and optional code patterns are usable |
| SubTubular | MIT | Prior local snapshot only (upstream URL unavailable) |

## High-Value Pattern Backlog

### 1) Saved Search Policies + Priority Buckets
Pain solved:
- Users cannot keep up with new content or repeat query workflows.

Pattern source:
- Subscription/watcher workflows from TubeArchivist, Pinchflat, ytdl-sub.

Implementation in this repo:
- Add DB tables: `saved_policies`, `policy_runs`, `policy_hits`.
- Add endpoints: `GET/POST /api/policies`, `POST /api/policies/:id/run`, `GET /api/policies/:id/hits`.
- Add CLI: `yit policy add|list|run|hits`.
- Score hits using recency + keyword match + semantic score.

Effort: 2 to 3 days

### 2) Incremental Channel Watch Sync
Pain solved:
- Manual ingestion does not scale for ongoing channels.

Pattern source:
- Channel/playlist sync loops from TubeSync and Pinchflat.

Implementation in this repo:
- Add `channel_watch` table with `channel_key`, `last_seen_video_id`, schedule metadata.
- Add worker job type `sync_channel_watch`.
- Reuse existing YouTube discovery routes and ingest queue.

Effort: 2 to 3 days

### 3) Alert Sinks (Webhook First)
Pain solved:
- Users still need to manually check results.

Pattern source:
- Notification patterns across Pinchflat/TubeSync ecosystems.

Implementation in this repo:
- Add `alert_endpoints` table + signature secret.
- Add worker delivery step for new high-priority policy hits.
- Start with outgoing webhooks; add Slack/email adapters later.

Effort: 1 to 2 days

### 4) Search Preview Player In Global Search
Pain solved:
- Context switching from search page to video page is slow.

Pattern source:
- Embedded player workflow from TubeArchivist search page.

Implementation in this repo:
- Update `/search` to optionally render player from `videoId` and `t` query params.
- Keep grouped results and filters visible while previewing.

Effort: 0.5 to 1 day

### 5) Feed Exports (JSON + RSS)
Pain solved:
- Users want external consumption and automation.

Pattern source:
- Feed/subscription workflows in Pinchflat and ytdl-sub.

Implementation in this repo:
- Add endpoints: `GET /api/feeds/:policyId.json` and `GET /api/feeds/:policyId.rss`.
- Output policy hits and canonical links with timestamps.
- Include CLI: `yit feed print <policyId> --format json|rss`.

Effort: 1 day

## Porting Method

1. Capture behavior in a short contract doc in `plan/`.
2. Add/extend Zod contracts in `packages/contracts`.
3. Implement API + repo layer in `packages/core` and `apps/web/app/api`.
4. Add CLI parity in `apps/cli`.
5. Add SDK parity and route parity test updates in `packages/sdk`.
6. Add docs + runbook + integration checks.

## Do Not Do

- Do not import competitor source files into tracked paths.
- Do not copy license headers or proprietary text into this repo.
- Do not reference `.competitors/` paths in runtime code.
