#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# shellcheck source=ops/lib/defaults.sh
source "${ROOT_DIR}/ops/lib/defaults.sh"

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

read_local_env_value() {
  local key="$1"
  local file="${ROOT_DIR}/.env"
  if [ ! -f "${file}" ]; then
    return 0
  fi
  local line
  line="$(grep -E "^${key}=" "${file}" | tail -n1 || true)"
  if [ -z "${line}" ]; then
    return 0
  fi
  local value="${line#*=}"
  if [ "${#value}" -ge 2 ]; then
    if [[ "${value}" == \"*\" ]] || [[ "${value}" == \'*\' ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "${value}"
}

extract_port_from_url() {
  local value="$1"
  if [ -z "${value}" ]; then
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    return 0
  fi
  node -e '
    const raw = process.argv[1] || "";
    try {
      const normalized = raw.includes("://") ? raw : `http://${raw}`;
      const u = new URL(normalized);
      process.stdout.write(u.port || "");
    } catch {
      process.stdout.write("");
    }
  ' "${value}"
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

# External DB/Redis mode is valid; Docker should be optional in that case.
EXTERNAL_INFRA_OK=0
if pnpm db:migrate >/dev/null 2>&1; then
  EXTERNAL_INFRA_OK=1
  ok "database reachable via current DATABASE_URL/REDIS_URL (external infra mode supported)"
else
  warn "database not reachable yet (local Docker infra may be required)"
fi

if command -v docker >/dev/null 2>&1; then
  ok "docker installed ($(command -v docker))"
  if docker info >/dev/null 2>&1; then
    ok "docker daemon reachable"
  else
    if [ "${EXTERNAL_INFRA_OK}" -eq 1 ]; then
      warn "docker daemon not reachable (acceptable: external infra mode)"
    else
      fail "docker installed but daemon not reachable, and external DB is unavailable"
    fi
  fi
  if docker compose version >/dev/null 2>&1; then
    ok "docker compose available"
  else
    if [ "${EXTERNAL_INFRA_OK}" -eq 1 ]; then
      warn "docker compose not available (acceptable: external infra mode)"
    else
      fail "docker compose not available and external DB is unavailable"
    fi
  fi
else
  if [ "${EXTERNAL_INFRA_OK}" -eq 1 ]; then
    warn "docker not found (acceptable: external infra mode)"
  else
    fail "docker not found and external DB is unavailable"
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

POSTGRES_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_POSTGRES_PORT" "48432")"
REDIS_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_REDIS_PORT" "48379")"
WEB_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WEB_PORT" "48333")"
WORKER_METRICS_PORT_DEFAULT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WORKER_METRICS_PORT" "48410")"

POSTGRES_PORT="${YIT_POSTGRES_PORT:-$(read_local_env_value "YIT_POSTGRES_PORT")}"
POSTGRES_PORT="${POSTGRES_PORT:-${POSTGRES_PORT_DEFAULT}}"
REDIS_PORT="${YIT_REDIS_PORT:-$(read_local_env_value "YIT_REDIS_PORT")}"
REDIS_PORT="${REDIS_PORT:-${REDIS_PORT_DEFAULT}}"
WEB_PORT="${YIT_WEB_PORT:-${WEB_PORT_DEFAULT}}"
WORKER_METRICS_PORT="${YIT_WORKER_METRICS_PORT:-${WORKER_METRICS_PORT_DEFAULT}}"

DATABASE_URL_LOCAL="${DATABASE_URL:-$(read_local_env_value "DATABASE_URL")}"
if [ -n "${DATABASE_URL_LOCAL}" ]; then
  DB_PORT="$(extract_port_from_url "${DATABASE_URL_LOCAL}")"
  if [ -n "${DB_PORT}" ] && [ "${DB_PORT}" != "${POSTGRES_PORT}" ]; then
    warn "DATABASE_URL port (${DB_PORT}) differs from YIT_POSTGRES_PORT (${POSTGRES_PORT}); services may not connect to local docker DB"
  fi
fi

REDIS_URL_LOCAL="${REDIS_URL:-$(read_local_env_value "REDIS_URL")}"
if [ -n "${REDIS_URL_LOCAL}" ]; then
  REDIS_URL_PORT="$(extract_port_from_url "${REDIS_URL_LOCAL}")"
  if [ -n "${REDIS_URL_PORT}" ] && [ "${REDIS_URL_PORT}" != "${REDIS_PORT}" ]; then
    warn "REDIS_URL port (${REDIS_URL_PORT}) differs from YIT_REDIS_PORT (${REDIS_PORT}); worker queue may fail"
  fi
fi

METRICS_PORT_LOCAL="${METRICS_PORT:-$(read_local_env_value "METRICS_PORT")}"
if [ -n "${METRICS_PORT_LOCAL}" ] && [ "${METRICS_PORT_LOCAL}" != "${WORKER_METRICS_PORT}" ]; then
  warn "METRICS_PORT (${METRICS_PORT_LOCAL}) differs from YIT_WORKER_METRICS_PORT (${WORKER_METRICS_PORT})"
fi

PY_BIN_LOCAL="${YIT_PYTHON_BIN:-$(read_local_env_value "YIT_PYTHON_BIN")}"
if [ -z "${PY_BIN_LOCAL}" ]; then
  PY_BIN_LOCAL="${PYTHON_BIN:-$(read_local_env_value "PYTHON_BIN")}"
fi
if [ -n "${PY_BIN_LOCAL}" ] && command -v "${PY_BIN_LOCAL}" >/dev/null 2>&1; then
  if "${PY_BIN_LOCAL}" -c 'import youtube_transcript_api' >/dev/null 2>&1; then
    ok "python runtime has youtube_transcript_api (${PY_BIN_LOCAL})"
  else
    warn "python runtime (${PY_BIN_LOCAL}) is missing youtube_transcript_api; worker will auto-fallback to .run/venvs/tests when available"
  fi
fi

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
