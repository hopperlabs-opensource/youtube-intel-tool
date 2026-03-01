# Runbooks
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Use `pnpm run setup` + `pnpm run doctor` for first-time bring-up.
- Use `pnpm bg:*` commands for stable background operation.
- Treat these runbooks as local/self-hosted operation guides.

> ⚠️ **Watch out**
> These procedures assume local/self-hosted operation. Public internet deployment requires extra hardening.

## 1. First-Time Bring-Up

### Requirements
- Docker running
- Prerequisites installed (`Node`, `pnpm`, `yt-dlp`)

### Steps
```bash
pnpm run setup
pnpm run doctor
pnpm yit health
pnpm yit capabilities
```

### Verify
- Web UI: `http://localhost:<YIT_WEB_PORT>` (default `3333`)
- Karaoke UI: `http://localhost:<YIT_KARAOKE_PORT>` (default `3334`)
- Worker metrics: `http://localhost:<YIT_WORKER_METRICS_PORT>/metrics` (default `4010`)
- Grafana: `http://localhost:<YIT_GRAFANA_PORT>` (default `53000`)
- Prometheus: `http://localhost:<YIT_PROMETHEUS_PORT>` (default `59092`)

## 2. Foreground Development Mode

### Requirements
- Docker running

### Steps
```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

### Verify
```bash
pnpm yit health
pnpm yit capabilities
```

## 3. Background Stack Mode

### Requirements
- `.env` configured (or defaults from `.env.example`)

### Steps
```bash
pnpm bg:up
pnpm bg:status
pnpm bg:logs
pnpm bg:restart
```

Target specific logs when needed:

```bash
pnpm bg:logs web
pnpm bg:logs karaoke
pnpm bg:logs worker
```

To stop:

```bash
pnpm bg:down
```

### Verify
- `pnpm bg:status` shows all expected services as running.
- `pnpm yit health` returns success.

Notes:
- `bg:up` starts infra, runs migrations, starts web/karaoke/worker, and writes Prometheus config.
- If `YIT_PYTHON_BIN`/`PYTHON_BIN` are unset, `bg:up` bootstraps a pinned local Python venv for transcript fetch (`.run/venvs/tests`).
- Port overrides: `YIT_WEB_PORT`, `YIT_KARAOKE_PORT`, `YIT_WORKER_METRICS_PORT`, `YIT_POSTGRES_PORT`, `YIT_REDIS_PORT`, `YIT_PROMETHEUS_PORT`, `YIT_GRAFANA_PORT`.

## 4. macOS Login Service Mode (`launchd`)

### Requirements
- macOS host

### Steps
```bash
pnpm svc:install
pnpm svc:status
```

To uninstall:

```bash
pnpm svc:uninstall
```

### Verify
- `pnpm svc:status` shows expected agents:
  - `com.ytintel.stack`
  - `com.ytintel.web`
  - `com.ytintel.karaoke`
  - `com.ytintel.worker`

## 5. Observability Controls

### Requirements
- Stack already running

### Steps
```bash
pnpm obs:up
```

To stop observability services only:

```bash
pnpm obs:down
```

### Verify
- Prometheus and Grafana endpoints are reachable on configured ports.

## 6. Verification and Smoke

### Requirements
- Stack healthy

### Steps
```bash
pnpm run doctor
pnpm yit health
pnpm yit capabilities
pnpm yit --json health
pnpm yit smoke --url "https://www.youtube.com/watch?v=..."
pnpm test
pnpm test:integration
pnpm exec playwright test --config apps/web/e2e/playwright.config.cjs --project=chromium
```

### Verify
- Smoke flow exits successfully and returns expected ingest/search status.
- `pnpm test:integration` uses a pinned Python test venv at `.run/venvs/tests` (source of truth: `ops/tests/requirements.txt`).
- Browser gate/runtime checks pass in Playwright.

## 7. Incident Procedures

### App not reachable

#### Steps
1. `pnpm bg:status`
2. `pnpm bg:logs`
3. `pnpm yit health`

#### Verify
- API health endpoint responds and UI becomes reachable.

### Port conflict

#### Steps
```bash
YIT_WEB_PORT=3344 \
YIT_WORKER_METRICS_PORT=4011 \
YIT_PROMETHEUS_PORT=59093 \
YIT_GRAFANA_PORT=53001 \
pnpm bg:up
```

#### Verify
- Services bind to new ports and CLI reaches API via updated `YIT_BASE_URL`.

### Seed starter content

#### Steps
```bash
pnpm seed:demo
```

#### Verify
- New demo videos appear in library views.

### DB state looks broken

#### Steps
```bash
pnpm db:down
pnpm db:up
pnpm db:migrate
```

#### Verify
- Migrations apply cleanly and `pnpm yit health` succeeds.

## 8. Agentic Operator Prompt

```text
Use docs/GETTING_STARTED.md and docs/RUNBOOKS.md to bring the stack up.
Prefer `pnpm run setup` + `pnpm run doctor`, then run health checks.
Ingest one test URL and verify search works.
If anything fails, use docs/TROUBLESHOOTING.md and report root cause + fix.
```

## 9. Scope Reminder

For public internet exposure, add auth, TLS/reverse proxy, rate limits, CORS controls, secret management, and monitoring before deployment.

## 10. Policy Automation (Cron/CI)

### Requirements
- At least one saved policy (`pnpm yit policy create ...`)
- Local stack reachable at `YIT_BASE_URL`

### Steps
```bash
# create once
pnpm yit policy create --name "daily-rag" --query "retrieval quality" --mode hybrid

# run manually
pnpm yit policy run <policyId> --triggered-by cli

# inspect latest high-priority hits
pnpm yit policy hits <policyId> --bucket high --limit 20
```

Cron example (every 30 minutes):

```bash
*/30 * * * * cd /path/to/youtube-intel-tool && YIT_BASE_URL=http://localhost:3333 pnpm yit policy run <policyId> --triggered-by cron >> .run/logs/policy-cron.log 2>&1
```

### Verify
- `pnpm yit policy runs <policyId>` shows new completed runs.
- `pnpm yit policy hits <policyId> --bucket high` returns expected rows.

## 11. Feed Token Rotation and Feed Access

### Requirements
- Existing policy id

### Steps
```bash
# rotate feed token
pnpm yit policy update <policyId> --rotate-feed-token

# print current feed URLs
pnpm yit feed url <policyId>

# fetch feed payloads
pnpm yit feed print <policyId> --format json
pnpm yit feed print <policyId> --format rss
```

### Verify
- New token URLs return `200`.
- Old token URLs return `401`.
