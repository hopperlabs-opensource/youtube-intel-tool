#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/bg/_common.sh
source "${HERE}/_common.sh"

require_cmd curl
require_cmd docker
require_cmd lsof
require_cmd node

WEB_PORT="$(web_port)"
KARAOKE_WEB_PORT="$(karaoke_web_port)"
WORKER_METRICS_PORT="$(worker_metrics_port)"

stop_by_port_if_healthy "web" "${WEB_PORT}" "web"
stop_by_port_if_healthy "karaoke-web" "${KARAOKE_WEB_PORT}" "karaoke"
stop_by_port_if_healthy "worker" "${WORKER_METRICS_PORT}" "worker"

log "docker: stopping containers (postgres/redis/prometheus/grafana)"
(cd "${ROOT_DIR}" && docker compose -f docker-compose.yml -f docker-compose.observability.yml down >/dev/null 2>&1 || true)

rm -f "${RUN_DIR}/web.pid" "${RUN_DIR}/karaoke-web.pid" "${RUN_DIR}/worker.pid" >/dev/null 2>&1 || true

log "down: ok"
