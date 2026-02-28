# Roadmap

This roadmap tracks high-leverage product work. It includes ideas informed by
market research, but implementation is original to this codebase.

## Near term
- Search UX polish:
  - Add optional player-preview mode on `/search` (`videoId` + timestamp in URL)
  - Add clearer result verticals/toggles for global search views
- Search relevance:
  - Add optional advanced query syntax on top of current Postgres FTS + vectors
  - Improve snippet generation around cue boundaries for better readability
- Reliability:
  - Add deterministic tests for API contracts that do not require external
    network services
  - Expand CI coverage with integration smoke tests behind manual trigger

## Mid term
- Better source grounding:
  - Per-answer provenance summaries and stronger citation confidence signals
- Library curation:
  - Better merge/alias tooling for entities and speaker identities
  - Richer facet browsing and saved search scopes
- Operations:
  - Exportable backups and restore workflows for local deployments

## Long term
- Scalable retrieval for large libraries
- Multi-user auth and role-based access for shared deployments
- Optional cloud deployment profiles with hardened defaults
