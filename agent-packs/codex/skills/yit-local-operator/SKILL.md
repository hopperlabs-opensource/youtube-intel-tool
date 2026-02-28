# yit-local-operator

Use this skill when operating or extending the YouTube Intel Tool locally.

## Scope
- Bring the stack up on a local machine.
- Run health and dependency checks.
- Execute ingest/search/chat validation loops.
- Debug common issues (ports, Docker, worker, API capability flags).

## Guardrails
- Treat this repo as local-first software unless explicitly told otherwise.
- Never commit `.env`, API keys, transcript dumps, or `.run/` artifacts.
- Prefer `pnpm run setup` and `pnpm run doctor` before invasive changes.

## Workflow
1. Baseline
- `pnpm run setup`
- `pnpm run doctor`
- `pnpm yit health`
- `pnpm yit capabilities`

2. First content
- `pnpm seed:demo` (optional)
- or `pnpm yit ingest "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --wait --logs`

3. Validate behavior
- `pnpm yit search "query"`
- `pnpm yit chat ask <videoId> "Summarize with citations."`

4. Verify code changes
- `pnpm verify`
- Run focused package tests if relevant (`pnpm -C packages/sdk test:unit`).

## Useful references
- `README.md`
- `docs/GETTING_STARTED.md`
- `docs/RUNBOOKS.md`
- `docs/TROUBLESHOOTING.md`
