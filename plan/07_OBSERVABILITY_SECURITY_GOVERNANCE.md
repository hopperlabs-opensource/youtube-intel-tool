# 07 - Observability, Security, Governance

## Observability (Prometheus + Grafana)
Expose `/metrics` on API and worker.

Key metrics:
- `youtube_intel_jobs_total{type,status}`
- `youtube_intel_job_duration_ms_bucket{type}`
- `youtube_intel_queue_depth{queue}`
- `youtube_intel_transcript_cues_total{video_id}`
- `youtube_intel_search_requests_total{mode}`
- `youtube_intel_chat_requests_total{provider,model}`
- `youtube_intel_llm_cost_usd_total{provider,model}`

Dashboards:
- Pipeline health (success rate, p50/p95 by stage)
- Queue depth and worker saturation
- Search latency
- LLM cost over time

## Logging
- Structured logs (json) with `job_id`, `video_id`, `stage`.
- Keep a job log table for UI inspection (optional).

## Security Baselines
- Authentication required for all endpoints (even local, plan it in).
- RBAC for admin endpoints (job retry/cancel, CLI providers).
- Rate limiting by user + endpoint (especially transcript fetch).
- Input validation via Zod for all writes.

## Data Governance
- Store transcripts and derived artifacts encrypted-at-rest if team environment.
- Decide retention policy:
  - transcripts: keep
  - embeddings: rebuildable
  - context items: cache
  - chat logs: optional, redact by default

## External Requests Policy
- Wikipedia calls: safe, but cache and include user agent.
- YouTube calls: avoid aggressive scraping; prefer official APIs for production.

