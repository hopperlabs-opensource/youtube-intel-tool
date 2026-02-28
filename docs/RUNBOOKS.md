# Runbooks

Operational playbooks for local/self-hosted usage.

## 1) First-time bring-up

```bash
pnpm run setup
pnpm run doctor
pnpm yit health
pnpm yit capabilities
```

Expected:

- Web UI: `http://localhost:3333`
- Worker metrics: `http://localhost:4010/metrics`
- Grafana: `http://localhost:53000`
- Prometheus: `http://localhost:59092`

You can change all local ports from one place: `.env` / `.env.example`.

## 2) Foreground development mode

Use this when actively developing and watching logs in the same terminal.

```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

## 3) Background stack mode

Use this for stable local service behavior.

```bash
pnpm bg:up
pnpm bg:status
pnpm bg:logs
pnpm bg:restart
pnpm bg:down
```

Notes:

- `bg:up` starts infra, runs migrations, starts web/worker, and writes Prometheus config.
- Override ports with `YIT_WEB_PORT`, `YIT_WORKER_METRICS_PORT`,
  `YIT_POSTGRES_PORT`, `YIT_REDIS_PORT`, `YIT_PROMETHEUS_PORT`, `YIT_GRAFANA_PORT`.

## 4) macOS login service mode (`launchd`)

Use this to auto-start on login.

```bash
pnpm svc:install
pnpm svc:status
pnpm svc:uninstall
```

This installs three agents:

- `com.ytintel.stack`
- `com.ytintel.web`
- `com.ytintel.worker`

## 5) Observability-only controls

```bash
pnpm obs:up
pnpm obs:down
```

## 6) Verification / smoke

Fast checks:

```bash
pnpm run doctor
pnpm yit health
pnpm yit capabilities
pnpm yit --json health
```

End-to-end smoke:

```bash
pnpm yit smoke --url "https://www.youtube.com/watch?v=..."
```

## 7) Common incidents

### App not reachable

1. `pnpm bg:status`
2. `pnpm bg:logs`
3. `pnpm yit health`

### Port conflict

Run with custom ports:

```bash
YIT_WEB_PORT=3344 \
YIT_WORKER_METRICS_PORT=4011 \
YIT_PROMETHEUS_PORT=59093 \
YIT_GRAFANA_PORT=53001 \
pnpm bg:up
```

### Seed starter content

```bash
pnpm seed:demo
```

### DB state looks broken

```bash
pnpm db:down
pnpm db:up
pnpm db:migrate
```

## 8) Agentic operator prompt

For Codex/Claude Code/other agentic CLIs:

```text
Use docs/GETTING_STARTED.md and docs/RUNBOOKS.md to bring the stack up.
Prefer `pnpm run setup` + `pnpm run doctor`, then run health checks.
Ingest one test URL and verify search works.
If anything fails, use docs/TROUBLESHOOTING.md and report root cause + fix.
```

## 9) Scope reminder

These runbooks are for local/self-hosted operation. For public internet
exposure, add your own hardening first (auth, TLS/reverse proxy, rate limits,
secret management, monitoring).
