#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${HERE}/../.." && pwd)"

# shellcheck source=ops/lib/defaults.sh
source "${ROOT_DIR}/ops/lib/defaults.sh"

LOG_DIR="${HOME}/Library/Logs/youtube-intel-tool"
mkdir -p "${LOG_DIR}"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf '%s %s\n' "$(ts)" "$*"; }

WEB_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WEB_PORT" "48333")"
WORKER_METRICS_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WORKER_METRICS_PORT" "48410")"
WEB_PORT="${YIT_WEB_PORT:-${WEB_PORT_DEFAULT}}"
WORKER_METRICS_PORT="${YIT_WORKER_METRICS_PORT:-${WORKER_METRICS_PORT_DEFAULT}}"
PROM_CONFIG_DIR="${ROOT_DIR}/.run/observability"
PROM_CONFIG_PATH="${PROM_CONFIG_DIR}/prometheus.generated.yml"

log "stack: waiting for docker..."
for _ in {1..180}; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker info >/dev/null 2>&1 || { log "stack: docker not ready after timeout"; exit 1; }

log "stack: writing prometheus config for web:${WEB_PORT} worker:${WORKER_METRICS_PORT}"
mkdir -p "${PROM_CONFIG_DIR}"
cat >"${PROM_CONFIG_PATH}" <<YAML
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

log "stack: bringing up docker compose (postgres/redis/prometheus/grafana)"
docker compose \
  --project-directory "${ROOT_DIR}" \
  -f "${ROOT_DIR}/docker-compose.yml" \
  -f "${ROOT_DIR}/docker-compose.observability.yml" \
  up -d --remove-orphans postgres redis prometheus grafana

log "stack: running migrations"
pnpm -C "${ROOT_DIR}" db:migrate

docker restart yt_prometheus >/dev/null 2>&1 || true
log "stack: ok"
