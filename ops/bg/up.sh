#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/bg/_common.sh
source "${HERE}/_common.sh"

require_cmd bash
require_cmd curl
require_cmd lsof
require_cmd node
require_cmd pnpm

WEB_PORT="$(web_port)"
KARAOKE_WEB_PORT="$(karaoke_web_port)"
WORKER_METRICS_PORT="$(worker_metrics_port)"
GRAFANA_PORT="$(grafana_port)"
PROMETHEUS_PORT="$(prometheus_port)"
PROM_CONFIG_DIR="${ROOT_DIR}/.run/observability"
PROM_CONFIG_PATH="${PROM_CONFIG_DIR}/prometheus.generated.yml"

log "prometheus: writing config for web:${WEB_PORT} worker:${WORKER_METRICS_PORT}"
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

USE_DOCKER_INFRA=0
if (cd "${ROOT_DIR}" && pnpm db:migrate >/dev/null 2>&1); then
  log "infra: external database is reachable via DATABASE_URL; skipping docker postgres/redis"
else
  USE_DOCKER_INFRA=1
fi

if [ "${USE_DOCKER_INFRA}" -eq 1 ]; then
  require_cmd docker
  if ! docker_ready; then
    die "database is unreachable and docker is not running; start docker or point DATABASE_URL/REDIS_URL to running services"
  fi
  if [ -n "${DOCKER_CONTEXT_NAME:-}" ]; then
    log "docker: using context ${DOCKER_CONTEXT_NAME}"
  fi

  log "infra: starting postgres/redis"
  (cd "${ROOT_DIR}" && docker_compose_cmd -f docker-compose.yml -f docker-compose.observability.yml up -d --remove-orphans postgres redis >/dev/null)

  log "db: migrating"
  (cd "${ROOT_DIR}" && pnpm db:migrate >/dev/null)

  log "obs: starting prometheus/grafana"
  (cd "${ROOT_DIR}" && docker_compose_cmd -f docker-compose.yml -f docker-compose.observability.yml up -d --force-recreate --remove-orphans prometheus grafana >/dev/null)

  # Prometheus only reads config at startup; restart is cheap and keeps this predictable.
  docker_cmd restart yt_prometheus >/dev/null 2>&1 || true
else
  log "db: migrations already up to date (or external DB managed)"
fi

if is_yt_worker_up "${WORKER_METRICS_PORT}" >/dev/null 2>&1; then
  log "worker: already up on :${WORKER_METRICS_PORT}"
else
  if [ -n "$(listener_pid "${WORKER_METRICS_PORT}")" ]; then
    die "worker: :${WORKER_METRICS_PORT} is already in use; set YIT_WORKER_METRICS_PORT=<free_port>"
  fi

  # Ensure the worker python runtime has youtube_transcript_api available.
  WORKER_PY_PREFIX=""
  CANDIDATE_PY="${YIT_PYTHON_BIN:-${PYTHON_BIN:-}}"
  PY_READY=0
  if [ -n "${CANDIDATE_PY}" ] && command -v "${CANDIDATE_PY}" >/dev/null 2>&1; then
    if "${CANDIDATE_PY}" -c 'import youtube_transcript_api' >/dev/null 2>&1; then
      PY_READY=1
    fi
  fi
  if [ "${PY_READY}" -eq 0 ] && [ -f "${ROOT_DIR}/ops/tests/ensure_py_deps.sh" ]; then
    if WORKER_PY_BIN="$(bash "${ROOT_DIR}/ops/tests/ensure_py_deps.sh" 2>/dev/null)"; then
      log "worker: using local python venv ${WORKER_PY_BIN}"
      WORKER_PY_PREFIX="YIT_PYTHON_BIN=${WORKER_PY_BIN} PYTHON_BIN=${WORKER_PY_BIN}"
    elif [ -n "${CANDIDATE_PY}" ]; then
      log "worker: configured python (${CANDIDATE_PY}) missing youtube_transcript_api and venv bootstrap failed"
    else
      log "worker: python venv bootstrap skipped (continuing with system python)"
    fi
  fi

  WORKER_CMD="METRICS_PORT=${WORKER_METRICS_PORT} pnpm -C apps/worker dev"
  if [ -n "${WORKER_PY_PREFIX}" ]; then
    WORKER_CMD="${WORKER_PY_PREFIX} ${WORKER_CMD}"
  fi

  start_bg "worker" "${WORKER_CMD}"
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

if is_yt_karaoke_web_up "${KARAOKE_WEB_PORT}" >/dev/null 2>&1; then
  log "karaoke-web: already up on :${KARAOKE_WEB_PORT}"
else
  if [ -n "$(listener_pid "${KARAOKE_WEB_PORT}")" ]; then
    die "karaoke-web: :${KARAOKE_WEB_PORT} is already in use; set YIT_KARAOKE_PORT=<free_port>"
  fi
  start_bg "karaoke-web" "YIT_BASE_URL=http://localhost:${WEB_PORT} KARAOKE_WEB_PORT=${KARAOKE_WEB_PORT} pnpm -C apps/karaoke-web dev"
  if ! wait_for_karaoke_web "${KARAOKE_WEB_PORT}"; then
    die "karaoke-web: did not become healthy on :${KARAOKE_WEB_PORT} (see .run/logs/karaoke-web.log)"
  fi
fi

log "up: web http://localhost:${WEB_PORT}"
log "up: karaoke-web http://localhost:${KARAOKE_WEB_PORT}"
if [ "${USE_DOCKER_INFRA}" -eq 1 ]; then
  log "up: grafana http://localhost:${GRAFANA_PORT} (container yt_grafana)"
  log "up: prometheus http://localhost:${PROMETHEUS_PORT} (container yt_prometheus)"
else
  log "up: docker observability skipped (external infra mode)"
fi
log "up: logs: pnpm bg:logs"
