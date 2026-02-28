# Configuration Model
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- `.env.example` is the tracked source of default local settings.
- Port variables (`YIT_*_PORT`) are the primary config surface.
- Advanced overrides (`DATABASE_URL`, `REDIS_URL`, `METRICS_PORT`, `YIT_BASE_URL`) are optional.

This project now treats `.env.example` as the tracked source of local defaults.

## 1) Single-place defaults

Edit these in `.env.example` (and/or override in your local `.env`):

- `YIT_WEB_PORT`
- `YIT_WORKER_METRICS_PORT`
- `YIT_POSTGRES_PORT`
- `YIT_REDIS_PORT`
- `YIT_PROMETHEUS_PORT`
- `YIT_GRAFANA_PORT`

These values drive:

- `docker-compose*.yml` host port bindings
- background scripts (`ops/bg/*`)
- launchd scripts (`ops/launchd/*`)
- runtime fallback defaults in web/worker/CLI/core

## 2) Derived defaults

If you do not set advanced override vars, runtime derives them from the ports above:

- `DATABASE_URL` from `YIT_POSTGRES_PORT`
- `REDIS_URL` from `YIT_REDIS_PORT`
- `METRICS_PORT` from `YIT_WORKER_METRICS_PORT`
- `YIT_BASE_URL` from `YIT_WEB_PORT`

Advanced overrides are optional and still supported in `.env`:

- `DATABASE_URL`
- `REDIS_URL`
- `METRICS_PORT`
- `YIT_BASE_URL`

## 3) Demo seed list

Starter videos are configured in:

- `config/demo_videos.txt`

Run:

```bash
pnpm seed:demo
```

To auto-run during `pnpm run setup`:

```bash
YIT_SETUP_SEED_DEMO=1 pnpm run setup
```

## 4) Path safety

No absolute user-machine paths are required in config. Worker Python provider paths and migration paths resolve from module location (not `process.cwd()`), so startup is less fragile across launch methods.
