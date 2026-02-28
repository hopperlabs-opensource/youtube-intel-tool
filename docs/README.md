# Documentation Index
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- This is the canonical docs directory map.
- For web docs, open `https://hopperlabs-opensource.github.io/youtube-intel-tool/`.
- For local preview, run `pnpm docs:serve` (it bootstraps a local venv at `.run/venvs/docs`).

Docs site (GitHub Pages): `https://hopperlabs-opensource.github.io/youtube-intel-tool/`

Local preview:

```bash
pnpm docs:serve
```

Force a Python dependency resync when needed:

```bash
YIT_DOCS_FORCE_SYNC=1 pnpm docs:requirements
```

- [Connect & Support](CONNECT.md)
- [Quick Start](QUICKSTART.md)
- [Getting Started](GETTING_STARTED.md)
- [Runbooks](RUNBOOKS.md)
- [Use Cases](USE_CASES.md)
- [Architecture](ARCHITECTURE.md)
- [CLI Reference](CLI.md)
- [API Reference](API.md)
- [Governance](GOVERNANCE.md)
- [Configuration Model](CONFIG.md)
- [Agent Packs](AGENT_PACKS.md)
- [Releasing](RELEASING.md)
- [GitHub Docs Style Guide](github_docs_styleguide.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Screenshot Workflow](SCREENSHOTS.md)
