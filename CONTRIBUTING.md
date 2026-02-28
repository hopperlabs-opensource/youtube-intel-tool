# Contributing

Thanks for contributing.

## Development setup
1. Install dependencies:
```bash
pnpm install
```
2. Start infrastructure:
```bash
pnpm db:up
```
3. Run migrations:
```bash
pnpm db:migrate
```
4. Start the app:
```bash
pnpm dev
```

## Documentation standards
- Treat `README.md` as the product landing page: short value proposition, fast start, links to deeper docs.
- Put detailed guides under `docs/` (`GETTING_STARTED`, `USE_CASES`, `API`, `CLI`, `TROUBLESHOOTING`).
- Keep `docs/RUNBOOKS.md` aligned with `package.json` scripts and `ops/*` behavior.
- Keep command examples copy-paste ready and tested against current scripts.
- Prefer screenshots that show real data states; keep assets under `docs/assets/screenshots/`.
- If a UI/API behavior changes, update docs in the same PR.

## Quality gates
Before opening a PR, run:
```bash
pnpm verify
```

## Contract tests
Use these commands depending on intent:

- `pnpm test` for unit tests only (no local stack required)
- `pnpm test:contract` for contract tests against an already running stack
- `pnpm test:integration` to boot stack + run contract suite + teardown

If needed, set:
```bash
export YIT_BASE_URL="http://localhost:${YIT_WEB_PORT:-3333}"
export YIT_CONTRACT_TEST_INGEST_URL=https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

## Pull requests
- Keep PRs focused and small where possible.
- Include tests or validation notes for behavior changes.
- Update docs (`README.md`, `docs/`, `plan/`, or API contracts) when interfaces change.
- Do not commit secrets, local logs, or generated artifacts.

## Access and maintainer policy

- Public contributors should use fork + pull request.
- Protected `main` requires pull requests, required checks, and 1 approval.
- New maintainer access is granted after consistent, high-signal contributions and trusted review behavior.
- Maintainer access is expected to follow org security policy (2FA required).

Maintainer request channels:
- Preferred: open a GitHub Discussion or Issue requesting maintainer consideration.
- Direct email should only be published after a dedicated role alias exists.

## Security
If you find a vulnerability, do not open a public issue first.
See [SECURITY.md](SECURITY.md) for reporting instructions.
