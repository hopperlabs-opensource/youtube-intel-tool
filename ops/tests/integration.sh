#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

cleanup() {
  if [ "${YIT_TEST_KEEP_STACK:-0}" = "1" ]; then
    echo "integration: leaving stack running (YIT_TEST_KEEP_STACK=1)"
    return 0
  fi
  pnpm bg:down >/dev/null 2>&1 || true
}
trap cleanup EXIT

PY_BIN="${YIT_PYTHON_BIN:-python3}"
if ! command -v "${PY_BIN}" >/dev/null 2>&1; then
  if command -v python3 >/dev/null 2>&1; then
    PY_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PY_BIN="python"
  fi
fi

if command -v "${PY_BIN}" >/dev/null 2>&1; then
  PY_BIN="$(command -v "${PY_BIN}")"
  export YIT_PYTHON_BIN="${PY_BIN}"
  export PYTHON_BIN="${PY_BIN}"
  if ! "${PY_BIN}" -c "import youtube_transcript_api" >/dev/null 2>&1; then
    echo "integration: installing missing python dependency youtube-transcript-api via ${PY_BIN}"
    "${PY_BIN}" -m pip install --user youtube-transcript-api
  fi
fi

echo "integration: starting local stack"
# Keep integration suite deterministic without external model credentials.
export YIT_EMBED_PROVIDER="${YIT_EMBED_PROVIDER:-none}"
export YIT_STT_PROVIDER="${YIT_STT_PROVIDER:-}"
export YIT_DIARIZE_BACKEND="${YIT_DIARIZE_BACKEND:-}"
echo "integration: python=${YIT_PYTHON_BIN:-<unset>} embed=${YIT_EMBED_PROVIDER} stt=${YIT_STT_PROVIDER:-<unset>}"
YIT_PYTHON_BIN="${YIT_PYTHON_BIN:-}" \
PYTHON_BIN="${PYTHON_BIN:-}" \
YIT_EMBED_PROVIDER="${YIT_EMBED_PROVIDER}" \
YIT_STT_PROVIDER="${YIT_STT_PROVIDER:-}" \
YIT_DIARIZE_BACKEND="${YIT_DIARIZE_BACKEND:-}" \
pnpm bg:up

if [ -z "${YIT_BASE_URL:-}" ]; then
  export YIT_BASE_URL="http://localhost:${YIT_WEB_PORT:-3333}"
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
