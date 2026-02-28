#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/bg/_common.sh
source "${HERE}/_common.sh"

require_cmd bash
require_cmd curl
require_cmd docker
require_cmd lsof
require_cmd node
require_cmd pnpm

if ! docker_ready; then
  die "docker is not running (start Docker Desktop first)"
fi

WEB_PORT="$(web_port)"
WORKER_METRICS_PORT="$(worker_metrics_port)"
GRAFANA_PORT="$(grafana_port)"
PROMETHEUS_PORT="$(prometheus_port)"

log "prometheus: writing config for web:${WEB_PORT} worker:${WORKER_METRICS_PORT}"
cat >"${ROOT_DIR}/ops/observability/prometheus/prometheus.generated.yml" <<YAML
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: yt_web
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:${WEB_PORT}"]
        labels:
          service: web

  - job_name: yt_worker
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:${WORKER_METRICS_PORT}"]
        labels:
          service: worker
YAML

log "infra: starting postgres/redis"
(cd "${ROOT_DIR}" && docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --remove-orphans postgres redis >/dev/null)

log "db: migrating"
(cd "${ROOT_DIR}" && pnpm db:migrate >/dev/null)

log "obs: starting prometheus/grafana"
(cd "${ROOT_DIR}" && docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --force-recreate --remove-orphans prometheus grafana >/dev/null)

# Prometheus only reads config at startup; restart is cheap and keeps this predictable.
docker restart yt_prometheus >/dev/null 2>&1 || true

if is_yt_worker_up "${WORKER_METRICS_PORT}" >/dev/null 2>&1; then
  log "worker: already up on :${WORKER_METRICS_PORT}"
else
  if [ -n "$(listener_pid "${WORKER_METRICS_PORT}")" ]; then
    die "worker: :${WORKER_METRICS_PORT} is already in use; set YIT_WORKER_METRICS_PORT=<free_port>"
  fi
  start_bg "worker" "METRICS_PORT=${WORKER_METRICS_PORT} pnpm -C apps/worker dev"
  if ! wait_for_worker "${WORKER_METRICS_PORT}"; then
    die "worker: did not become healthy on :${WORKER_METRICS_PORT} (see .run/logs/worker.log)"
  fi
fi

if is_yt_web_up "${WEB_PORT}" >/dev/null 2>&1; then
  log "web: already up on :${WEB_PORT}"
else
  if [ -n "$(listener_pid "${WEB_PORT}")" ]; then
    die "web: :${WEB_PORT} is already in use; set YIT_WEB_PORT=<free_port>"
  fi
  start_bg "web" "WEB_PORT=${WEB_PORT} pnpm -C apps/web dev"
  if ! wait_for_web "${WEB_PORT}"; then
    die "web: did not become healthy on :${WEB_PORT} (see .run/logs/web.log)"
  fi
fi

log "up: web http://localhost:${WEB_PORT}"
log "up: grafana http://localhost:${GRAFANA_PORT} (container yt_grafana)"
log "up: prometheus http://localhost:${PROMETHEUS_PORT} (container yt_prometheus)"
log "up: logs: pnpm bg:logs"
