#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/bg/_common.sh
source "${HERE}/_common.sh"

require_cmd curl
require_cmd lsof
require_cmd node

WEB_PORT="$(web_port)"
KARAOKE_WEB_PORT="$(karaoke_web_port)"
WORKER_METRICS_PORT="$(worker_metrics_port)"

stop_by_port_if_healthy "web" "${WEB_PORT}" "web"
stop_by_port_if_healthy "karaoke-web" "${KARAOKE_WEB_PORT}" "karaoke"
stop_by_port_if_healthy "worker" "${WORKER_METRICS_PORT}" "worker"

log "docker: stopping containers (postgres/redis/prometheus/grafana)"
if command -v docker >/dev/null 2>&1 && docker_ready; then
  (cd "${ROOT_DIR}" && docker_compose_cmd -f docker-compose.yml -f docker-compose.observability.yml down >/dev/null 2>&1 || true)
else
  log "docker: unavailable; skipped container shutdown"
fi

rm -f "${RUN_DIR}/web.pid" "${RUN_DIR}/karaoke-web.pid" "${RUN_DIR}/worker.pid" >/dev/null 2>&1 || true

log "down: ok"
