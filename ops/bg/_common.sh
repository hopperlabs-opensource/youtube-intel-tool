#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="${ROOT_DIR}/.run"
LOG_DIR="${RUN_DIR}/logs"

# shellcheck source=ops/lib/defaults.sh
source "${ROOT_DIR}/ops/lib/defaults.sh"

mkdir -p "${LOG_DIR}"

WEB_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WEB_PORT" "3333")"
WORKER_METRICS_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WORKER_METRICS_PORT" "4010")"
GRAFANA_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_GRAFANA_PORT" "53000")"
PROMETHEUS_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_PROMETHEUS_PORT" "59092")"

ts() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  printf '%s %s\n' "$(ts)" "$*"
}

die() {
  echo "error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

docker_ready() {
  docker info >/dev/null 2>&1
}

web_port() {
  echo "${YIT_WEB_PORT:-$WEB_PORT_DEFAULT}"
}

worker_metrics_port() {
  echo "${YIT_WORKER_METRICS_PORT:-$WORKER_METRICS_PORT_DEFAULT}"
}

grafana_port() {
  echo "${YIT_GRAFANA_PORT:-$GRAFANA_PORT_DEFAULT}"
}

prometheus_port() {
  echo "${YIT_PROMETHEUS_PORT:-$PROMETHEUS_PORT_DEFAULT}"
}

listener_pid() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | head -n1 || true
}

json_service_is() {
  local url="$1"
  local expected_service="$2"
  curl -fsS "${url}" | node -e '
    const expected = process.argv[1];
    let s = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      try {
        const j = JSON.parse(s);
        const ok = j && j.ok === true && j.service === expected;
        process.exit(ok ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });
  ' "${expected_service}"
}

is_yt_web_up() {
  local port="$1"
  json_service_is "http://localhost:${port}/api/health" "yt-web"
}

is_yt_worker_up() {
  local port="$1"
  json_service_is "http://localhost:${port}/health" "yt-worker"
}

wait_for_web() {
  local port="$1"
  for _ in {1..80}; do
    if is_yt_web_up "${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_for_worker() {
  local port="$1"
  for _ in {1..80}; do
    if is_yt_worker_up "${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

start_bg() {
  local name="$1"
  local cmd="$2"
  local log_file="${LOG_DIR}/${name}.log"
  local pid_file="${RUN_DIR}/${name}.pid"

  if [ -f "${pid_file}" ]; then
    local pid
    pid="$(cat "${pid_file}" 2>/dev/null || true)"
    if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
      log "${name}: already running (pid ${pid})"
      return 0
    fi
  fi

  log "${name}: starting..."
  nohup bash -lc "cd \"${ROOT_DIR}\" && ${cmd}" >>"${log_file}" 2>&1 &
  local pid="$!"
  echo "${pid}" >"${pid_file}"
  log "${name}: started (pid ${pid}, log ${log_file})"
}

stop_by_port_if_healthy() {
  local name="$1"
  local port="$2"
  local health_kind="$3" # web|worker

  local pid
  pid="$(listener_pid "${port}")"
  if [ -z "${pid}" ]; then
    log "${name}: not listening on :${port}"
    return 0
  fi

  if [ "${health_kind}" = "web" ]; then
    if ! is_yt_web_up "${port}" >/dev/null 2>&1; then
      die "${name}: port :${port} is in use by pid ${pid} (not yt-web); refusing to stop"
    fi
  elif [ "${health_kind}" = "worker" ]; then
    if ! is_yt_worker_up "${port}" >/dev/null 2>&1; then
      die "${name}: port :${port} is in use by pid ${pid} (not yt-worker); refusing to stop"
    fi
  else
    die "unknown health_kind: ${health_kind}"
  fi

  log "${name}: stopping pid ${pid} on :${port}..."
  kill "${pid}" >/dev/null 2>&1 || true

  for _ in {1..80}; do
    if [ -z "$(listener_pid "${port}")" ]; then
      return 0
    fi
    sleep 0.25
  done

  die "${name}: still listening on :${port} after timeout"
}
