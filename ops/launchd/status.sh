#!/usr/bin/env bash
set -euo pipefail

UID_NUM="$(id -u)"

echo "launchd:"
launchctl list | awk 'NR==1 || $3 ~ /^com\.ytintel\./ {print}'
echo

echo "health:"
curl -fsS http://localhost:${YIT_WEB_PORT:-3333}/api/health || echo "(web health failed)"
echo
curl -fsS http://localhost:${YIT_WORKER_METRICS_PORT:-4010}/health || echo "(worker health failed)"
echo

echo "docker:"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | awk 'NR==1 || $1 ~ /^yt_/ || $1 ~ /^NAME/ {print}'
echo

echo "detail:"
echo "  launchctl print gui/${UID_NUM}/com.ytintel.web"
echo "  launchctl print gui/${UID_NUM}/com.ytintel.worker"
echo "  launchctl print gui/${UID_NUM}/com.ytintel.stack"
