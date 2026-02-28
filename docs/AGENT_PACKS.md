# Agent Packs
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- The repo ships installable packs for Codex and Claude Code.
- Run `pnpm agents:install` from repo root.
- Packs are local developer tooling assets, not runtime dependencies.

This repo includes installable packs for Codex and Claude Code.

## Install

From repo root:

```bash
pnpm agents:install
```

Or install one side only:

```bash
pnpm agents:install:codex
pnpm agents:install:claude
```

## What gets installed

Codex:

- `agent-packs/codex/skills/yit-local-operator/SKILL.md`
- Installed to `${CODEX_HOME:-~/.codex}/skills`

Claude:

- `agent-packs/claude/commands/yit-setup.md`
- `agent-packs/claude/commands/yit-first-ingest.md`
- `agent-packs/claude/commands/yit-debug.md`
- Installed to `${CLAUDE_HOME:-~/.claude}/commands`

## Notes

- Installers are safe to re-run; files are copied/updated.
- These packs are local developer tooling assets, not server runtime dependencies.
