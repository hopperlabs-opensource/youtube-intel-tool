# Agent Packs

Local install bundles for agentic workflows.

## Codex Skill Pack

Install:

```bash
bash agent-packs/install-codex-pack.sh
```

This installs:

- `yit-local-operator` skill into `${CODEX_HOME:-~/.codex}/skills`

## Claude Command Pack

Install:

```bash
bash agent-packs/install-claude-pack.sh
```

This installs commands into `${CLAUDE_HOME:-~/.claude}/commands`:

- `yit-setup`
- `yit-first-ingest`
- `yit-debug`

## Notes

- Re-running installers is safe; files are copied/updated in place.
- These packs are plain markdown assets and shell installers.
