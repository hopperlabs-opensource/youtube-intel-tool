#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

FAILURES=0

ok() {
  printf 'ok: %s\n' "$*"
}

warn() {
  printf 'warn: %s\n' "$*"
}

fail() {
  printf 'fail: %s\n' "$*"
  FAILURES=$((FAILURES + 1))
}

major_from_version() {
  local raw="$1"
  raw="${raw#v}"
  echo "${raw}" | awk -F. '{print $1}'
}

check_cmd() {
  local name="$1"
  if command -v "${name}" >/dev/null 2>&1; then
    ok "${name} installed ($(command -v "${name}"))"
    return 0
  fi
  fail "${name} not found in PATH"
  return 1
}

echo "YouTube Intel Tool Doctor"
echo "cwd: ${ROOT_DIR}"
echo

if check_cmd node; then
  NODE_VER="$(node -v 2>/dev/null || true)"
  NODE_MAJOR="$(major_from_version "${NODE_VER}")"
  if [ -n "${NODE_MAJOR}" ] && [ "${NODE_MAJOR}" -ge 20 ]; then
    ok "node version ${NODE_VER} (>=20)"
  else
    fail "node version ${NODE_VER:-unknown} (need >=20)"
  fi
fi

if check_cmd pnpm; then
  PNPM_VER="$(pnpm -v 2>/dev/null || true)"
  PNPM_MAJOR="$(major_from_version "${PNPM_VER}")"
  if [ -n "${PNPM_MAJOR}" ] && [ "${PNPM_MAJOR}" -ge 9 ]; then
    ok "pnpm version ${PNPM_VER} (>=9)"
  else
    fail "pnpm version ${PNPM_VER:-unknown} (need >=9)"
  fi
fi

if check_cmd docker; then
  if docker info >/dev/null 2>&1; then
    ok "docker daemon reachable"
  else
    fail "docker installed but daemon not reachable (start Docker Desktop)"
  fi
  if docker compose version >/dev/null 2>&1; then
    ok "docker compose available"
  else
    fail "docker compose not available"
  fi
fi

check_cmd yt-dlp || true
if command -v yt-dlp >/dev/null 2>&1; then
  ok "yt-dlp version $(yt-dlp --version 2>/dev/null | head -n1)"
fi

if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg installed"
else
  warn "ffmpeg not found (recommended for broader media handling)"
fi

if [ -f .env ]; then
  ok ".env present"
else
  warn ".env missing (copy .env.example -> .env)"
fi

WEB_PORT="${YIT_WEB_PORT:-3333}"
WORKER_METRICS_PORT="${YIT_WORKER_METRICS_PORT:-4010}"

if curl -fsS "http://localhost:${WEB_PORT}/api/health" >/dev/null 2>&1; then
  ok "web health reachable on :${WEB_PORT}"
else
  warn "web health not reachable on :${WEB_PORT} (start stack with: pnpm bg:up)"
fi

if curl -fsS "http://localhost:${WORKER_METRICS_PORT}/health" >/dev/null 2>&1; then
  ok "worker health reachable on :${WORKER_METRICS_PORT}"
else
  warn "worker health not reachable on :${WORKER_METRICS_PORT}"
fi

if [ "${FAILURES}" -gt 0 ]; then
  echo
  echo "doctor result: FAILED (${FAILURES} hard issue(s))"
  exit 1
fi

echo
echo "doctor result: OK"
