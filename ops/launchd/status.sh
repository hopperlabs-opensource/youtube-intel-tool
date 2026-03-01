#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${HERE}/../.." && pwd)"

# shellcheck source=ops/lib/defaults.sh
source "${ROOT_DIR}/ops/lib/defaults.sh"

UID_NUM="$(id -u)"
WEB_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WEB_PORT" "48333")"
KARAOKE_WEB_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_KARAOKE_PORT" "48334")"
WORKER_METRICS_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WORKER_METRICS_PORT" "48410")"
WEB_PORT="${YIT_WEB_PORT:-${WEB_PORT_DEFAULT}}"
KARAOKE_WEB_PORT="${YIT_KARAOKE_PORT:-${KARAOKE_WEB_PORT_DEFAULT}}"
WORKER_METRICS_PORT="${YIT_WORKER_METRICS_PORT:-${WORKER_METRICS_PORT_DEFAULT}}"

echo "launchd:"
launchctl list | awk 'NR==1 || $3 ~ /^com\.ytintel\./ {print}'
echo

echo "health:"
curl -fsS "http://localhost:${WEB_PORT}/api/health" || echo "(web health failed)"
echo
curl -fsS "http://localhost:${KARAOKE_WEB_PORT}/api/health" || echo "(karaoke health failed)"
echo
curl -fsS "http://localhost:${WORKER_METRICS_PORT}/health" || echo "(worker health failed)"
echo

echo "docker:"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | awk 'NR==1 || $1 ~ /^yt_/ || $1 ~ /^NAME/ {print}'
echo

echo "detail:"
echo "  launchctl print gui/${UID_NUM}/com.ytintel.web"
echo "  launchctl print gui/${UID_NUM}/com.ytintel.karaoke"
echo "  launchctl print gui/${UID_NUM}/com.ytintel.worker"
echo "  launchctl print gui/${UID_NUM}/com.ytintel.stack"
