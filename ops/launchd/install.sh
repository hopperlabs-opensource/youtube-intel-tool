#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${HERE}/../.." && pwd)"

# shellcheck source=ops/lib/defaults.sh
source "${ROOT_DIR}/ops/lib/defaults.sh"

UID_NUM="$(id -u)"
AGENTS_DIR="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/youtube-intel-tool"

mkdir -p "${AGENTS_DIR}" "${LOG_DIR}"

PNPM_BIN="$(command -v pnpm || true)"
DOCKER_BIN="$(command -v docker || true)"
BASH_BIN="$(command -v bash || true)"
PYTHON_BIN="$(command -v python3 || true)"

[ -n "${PNPM_BIN}" ] || { echo "error: pnpm not found in PATH" >&2; exit 1; }
[ -n "${DOCKER_BIN}" ] || { echo "error: docker not found in PATH" >&2; exit 1; }
[ -n "${BASH_BIN}" ] || BASH_BIN="/bin/bash"

PNPM_DIR="$(dirname "${PNPM_BIN}")"
DOCKER_DIR="$(dirname "${DOCKER_BIN}")"

# Launchd does not reliably inherit your shell PATH (especially with nvm).
LAUNCHD_PATH="${PNPM_DIR}:${DOCKER_DIR}:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

WEB_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WEB_PORT" "3333")"
KARAOKE_WEB_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_KARAOKE_PORT" "3334")"
WORKER_METRICS_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WORKER_METRICS_PORT" "4010")"
WEB_PORT="${YIT_WEB_PORT:-${WEB_PORT_DEFAULT}}"
KARAOKE_WEB_PORT="${YIT_KARAOKE_PORT:-${KARAOKE_WEB_PORT_DEFAULT}}"
WORKER_METRICS_PORT="${YIT_WORKER_METRICS_PORT:-${WORKER_METRICS_PORT_DEFAULT}}"

STACK_PLIST="${AGENTS_DIR}/com.ytintel.stack.plist"
WEB_PLIST="${AGENTS_DIR}/com.ytintel.web.plist"
KARAOKE_WEB_PLIST="${AGENTS_DIR}/com.ytintel.karaoke.plist"
WORKER_PLIST="${AGENTS_DIR}/com.ytintel.worker.plist"

cat >"${STACK_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.ytintel.stack</string>

    <key>WorkingDirectory</key>
    <string>${HOME}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${BASH_BIN}</string>
      <string>-c</string>
      <string>bash ${ROOT_DIR}/ops/launchd/stack_up.sh</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${LAUNCHD_PATH}</string>
      <key>YIT_PYTHON_BIN</key>
      <string>${PYTHON_BIN}</string>
      <key>YIT_WEB_PORT</key>
      <string>${WEB_PORT}</string>
      <key>YIT_WORKER_METRICS_PORT</key>
      <string>${WORKER_METRICS_PORT}</string>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/stack.out.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/stack.err.log</string>
  </dict>
</plist>
PLIST

cat >"${WEB_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.ytintel.web</string>

    <key>WorkingDirectory</key>
    <string>${HOME}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${BASH_BIN}</string>
      <string>-c</string>
      <string>pnpm -C ${ROOT_DIR}/apps/web dev</string>
    </array>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>

    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${LAUNCHD_PATH}</string>
      <key>NODE_ENV</key>
      <string>development</string>
      <key>WEB_PORT</key>
      <string>${WEB_PORT}</string>
      <key>PORT</key>
      <string>${WEB_PORT}</string>
      <key>YIT_WEB_PORT</key>
      <string>${WEB_PORT}</string>
      <key>YIT_WORKER_METRICS_PORT</key>
      <string>${WORKER_METRICS_PORT}</string>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/web.out.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/web.err.log</string>
  </dict>
</plist>
PLIST

cat >"${KARAOKE_WEB_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.ytintel.karaoke</string>

    <key>WorkingDirectory</key>
    <string>${HOME}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${BASH_BIN}</string>
      <string>-c</string>
      <string>pnpm -C ${ROOT_DIR}/apps/karaoke-web dev</string>
    </array>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>

    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${LAUNCHD_PATH}</string>
      <key>NODE_ENV</key>
      <string>development</string>
      <key>YIT_BASE_URL</key>
      <string>http://localhost:${WEB_PORT}</string>
      <key>KARAOKE_WEB_PORT</key>
      <string>${KARAOKE_WEB_PORT}</string>
      <key>PORT</key>
      <string>${KARAOKE_WEB_PORT}</string>
      <key>YIT_WEB_PORT</key>
      <string>${WEB_PORT}</string>
      <key>YIT_KARAOKE_PORT</key>
      <string>${KARAOKE_WEB_PORT}</string>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/karaoke.out.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/karaoke.err.log</string>
  </dict>
</plist>
PLIST

cat >"${WORKER_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.ytintel.worker</string>

    <key>WorkingDirectory</key>
    <string>${HOME}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${BASH_BIN}</string>
      <string>-c</string>
      <string>pnpm -C ${ROOT_DIR}/apps/worker dev</string>
    </array>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>

    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${LAUNCHD_PATH}</string>
      <key>NODE_ENV</key>
      <string>development</string>
      <key>YIT_PYTHON_BIN</key>
      <string>${PYTHON_BIN}</string>
      <key>METRICS_PORT</key>
      <string>${WORKER_METRICS_PORT}</string>
      <key>YIT_WEB_PORT</key>
      <string>${WEB_PORT}</string>
      <key>YIT_WORKER_METRICS_PORT</key>
      <string>${WORKER_METRICS_PORT}</string>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/worker.out.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/worker.err.log</string>
  </dict>
</plist>
PLIST

launchctl bootout "gui/${UID_NUM}" "${STACK_PLIST}" >/dev/null 2>&1 || true
launchctl bootout "gui/${UID_NUM}" "${WEB_PLIST}" >/dev/null 2>&1 || true
launchctl bootout "gui/${UID_NUM}" "${KARAOKE_WEB_PLIST}" >/dev/null 2>&1 || true
launchctl bootout "gui/${UID_NUM}" "${WORKER_PLIST}" >/dev/null 2>&1 || true

launchctl bootstrap "gui/${UID_NUM}" "${STACK_PLIST}"
launchctl bootstrap "gui/${UID_NUM}" "${WEB_PLIST}"
launchctl bootstrap "gui/${UID_NUM}" "${KARAOKE_WEB_PLIST}"
launchctl bootstrap "gui/${UID_NUM}" "${WORKER_PLIST}"

launchctl kickstart -k "gui/${UID_NUM}/com.ytintel.stack" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/${UID_NUM}/com.ytintel.web" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/${UID_NUM}/com.ytintel.karaoke" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/${UID_NUM}/com.ytintel.worker" >/dev/null 2>&1 || true

echo "Installed launchd agents:"
echo "  ${STACK_PLIST}"
echo "  ${WEB_PLIST}"
echo "  ${KARAOKE_WEB_PLIST}"
echo "  ${WORKER_PLIST}"
echo
echo "Logs:"
echo "  ${LOG_DIR}/stack.out.log"
echo "  ${LOG_DIR}/web.out.log"
echo "  ${LOG_DIR}/karaoke.out.log"
echo "  ${LOG_DIR}/worker.out.log"
echo
echo "Status:"
echo "  pnpm svc:status"
echo
echo "UI:"
echo "  http://localhost:${WEB_PORT}"
echo "Karaoke UI:"
echo "  http://localhost:${KARAOKE_WEB_PORT}"
