#!/usr/bin/env bash
set -euo pipefail

UID_NUM="$(id -u)"
AGENTS_DIR="${HOME}/Library/LaunchAgents"

STACK_PLIST="${AGENTS_DIR}/com.ytintel.stack.plist"
WEB_PLIST="${AGENTS_DIR}/com.ytintel.web.plist"
KARAOKE_WEB_PLIST="${AGENTS_DIR}/com.ytintel.karaoke.plist"
WORKER_PLIST="${AGENTS_DIR}/com.ytintel.worker.plist"

launchctl bootout "gui/${UID_NUM}" "${WEB_PLIST}" >/dev/null 2>&1 || true
launchctl bootout "gui/${UID_NUM}" "${KARAOKE_WEB_PLIST}" >/dev/null 2>&1 || true
launchctl bootout "gui/${UID_NUM}" "${WORKER_PLIST}" >/dev/null 2>&1 || true
launchctl bootout "gui/${UID_NUM}" "${STACK_PLIST}" >/dev/null 2>&1 || true

rm -f "${WEB_PLIST}" "${KARAOKE_WEB_PLIST}" "${WORKER_PLIST}" "${STACK_PLIST}" >/dev/null 2>&1 || true

echo "Uninstalled launchd agents (if they were installed):"
echo "  ${STACK_PLIST}"
echo "  ${WEB_PLIST}"
echo "  ${KARAOKE_WEB_PLIST}"
echo "  ${WORKER_PLIST}"
