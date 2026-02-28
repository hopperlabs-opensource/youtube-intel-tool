# 09 - Open Questions

## Transcript Provider Policy
- Are we shipping an internal tool only (best effort extraction ok), or does this need to be deployable publicly (official captions API)?

## Storage Scope
- Entities are per-video or global? (Start per-video; later global with dedupe.)

## Embeddings
- Local embeddings only (Ollama) vs hosted provider support?
- How do we store multiple embedding models and migrate?

## NER Strategy
- Deterministic NER (spaCy) vs LLM-based linking for quality?
- Do we need entity linking to Wikipedia IDs from day one?

## UI Design
- 3-panel fixed layout vs resizable split panes?
- Do we need “mini-map” timeline view of entity mentions?

## Chat Providers
- Which providers must be supported first?
- Do we need tool execution approvals (like a control-plane) or is it safe by design?

## Governance
- Retention period for transcripts and chat logs?
- PII policy for context ingestion from your DB?

