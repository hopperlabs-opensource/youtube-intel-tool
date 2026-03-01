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

echo "Ports:"
echo "  web:    ${WEB_PORT}"
echo "  karaoke:${KARAOKE_WEB_PORT}"
echo "  worker: ${WORKER_METRICS_PORT}"
echo

if is_yt_web_up "${WEB_PORT}" >/dev/null 2>&1; then
  echo "yt-web:    up   http://localhost:${WEB_PORT}"
else
  echo "yt-web:    down (or wrong port)"
fi

if is_yt_karaoke_web_up "${KARAOKE_WEB_PORT}" >/dev/null 2>&1; then
  echo "yt-karaoke: up   http://localhost:${KARAOKE_WEB_PORT}"
else
  echo "yt-karaoke: down (or wrong port)"
fi

if is_yt_worker_up "${WORKER_METRICS_PORT}" >/dev/null 2>&1; then
  echo "yt-worker: up   http://localhost:${WORKER_METRICS_PORT}/metrics"
else
  echo "yt-worker: down (or wrong port)"
fi

echo
echo "Docker:"
if command -v docker >/dev/null 2>&1 && docker_ready; then
  if [ -n "${DOCKER_CONTEXT_NAME:-}" ]; then
    echo "  context: ${DOCKER_CONTEXT_NAME}"
  fi
  docker_cmd ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | awk 'NR==1 || $1 ~ /^yt_/ || $1 ~ /^NAME/ {print}'
else
  echo "  docker unavailable (external infra mode)"
fi

echo
echo "Logs:"
echo "  web:    ${LOG_DIR}/web.log"
echo "  karaoke:${LOG_DIR}/karaoke-web.log"
echo "  worker: ${LOG_DIR}/worker.log"
