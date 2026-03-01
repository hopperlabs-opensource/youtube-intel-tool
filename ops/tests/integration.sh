#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

kill_listener() {
  local port="$1"
  local pid
  pid="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | head -n1 || true)"
  if [ -z "${pid}" ]; then
    return 0
  fi
  kill "${pid}" >/dev/null 2>&1 || true
  for _ in $(seq 1 40); do
    if ! lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
}

cleanup() {
  if [ "${YIT_TEST_KEEP_STACK:-0}" = "1" ]; then
    echo "integration: leaving stack running (YIT_TEST_KEEP_STACK=1)"
    return 0
  fi
  pnpm bg:down >/dev/null 2>&1 || true
}
trap cleanup EXIT

PY_BIN="$(bash "${ROOT_DIR}/ops/tests/ensure_py_deps.sh")"
export YIT_PYTHON_BIN="${PY_BIN}"
export PYTHON_BIN="${PY_BIN}"

echo "integration: starting local stack"
# Keep integration suite deterministic without external model credentials.
export YIT_EMBED_PROVIDER="${YIT_EMBED_PROVIDER:-none}"
export YIT_STT_PROVIDER="${YIT_STT_PROVIDER:-}"
export YIT_DIARIZE_BACKEND="${YIT_DIARIZE_BACKEND:-}"
echo "integration: python=${YIT_PYTHON_BIN} embed=${YIT_EMBED_PROVIDER} stt=${YIT_STT_PROVIDER:-<unset>}"
# Force a clean restart so worker/web pick up test env (python path/provider overrides).
pnpm bg:down >/dev/null 2>&1 || true
kill_listener "${YIT_WEB_PORT:-48333}"
kill_listener "${YIT_KARAOKE_PORT:-48334}"
kill_listener "${YIT_WORKER_METRICS_PORT:-48410}"
YIT_PYTHON_BIN="${YIT_PYTHON_BIN}" \
PYTHON_BIN="${PYTHON_BIN}" \
YIT_EMBED_PROVIDER="${YIT_EMBED_PROVIDER}" \
YIT_STT_PROVIDER="${YIT_STT_PROVIDER:-}" \
YIT_DIARIZE_BACKEND="${YIT_DIARIZE_BACKEND:-}" \
pnpm bg:up

if [ -z "${YIT_BASE_URL:-}" ]; then
  export YIT_BASE_URL="http://localhost:${YIT_WEB_PORT:-48333}"
fi

echo "integration: waiting for API health"
for _ in $(seq 1 90); do
  if curl -fsS "${YIT_BASE_URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${YIT_BASE_URL}/api/health" >/dev/null 2>&1; then
  echo "integration: health check timed out for ${YIT_BASE_URL}/api/health" >&2
  exit 1
fi

echo "integration: running SDK contract tests against ${YIT_BASE_URL}"
pnpm test:contract
