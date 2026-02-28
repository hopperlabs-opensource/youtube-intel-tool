#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REQ_FILE="${ROOT_DIR}/docs/requirements.txt"
VENV_DIR="${ROOT_DIR}/.run/venvs/docs"
LOCK_DIR="${VENV_DIR}.lock"
PYTHON_BIN="${PYTHON_BIN:-python3}"
FORCE_SYNC="${YIT_DOCS_FORCE_SYNC:-0}"

fail() {
  printf 'docs env error: %s\n' "$*" >&2
  exit 1
}

hash_file() {
  local file="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file}" | awk '{print $1}'
    return 0
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
    return 0
  fi
  fail "no sha256 tool found (need shasum or sha256sum)"
}

[ -f "${REQ_FILE}" ] || fail "missing ${REQ_FILE}"
command -v "${PYTHON_BIN}" >/dev/null 2>&1 || fail "${PYTHON_BIN} not found in PATH"

mkdir -p "$(dirname "${VENV_DIR}")"

acquire_lock() {
  local waited=0
  local timeout=600
  while ! mkdir "${LOCK_DIR}" 2>/dev/null; do
    sleep 0.1
    waited=$((waited + 1))
    if [ "${waited}" -ge "${timeout}" ]; then
      fail "timed out waiting for docs env lock: ${LOCK_DIR}"
    fi
  done
  trap 'rmdir "${LOCK_DIR}" >/dev/null 2>&1 || true' EXIT
}

acquire_lock

if [ ! -x "${VENV_DIR}/bin/python" ]; then
  echo "docs env: creating virtualenv at ${VENV_DIR}"
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

REQ_HASH="$(hash_file "${REQ_FILE}")"
STAMP_FILE="${VENV_DIR}/.requirements.sha256"
CURRENT_HASH="$(cat "${STAMP_FILE}" 2>/dev/null || true)"

if [ "${FORCE_SYNC}" = "1" ] || [ "${REQ_HASH}" != "${CURRENT_HASH}" ]; then
  echo "docs env: syncing Python dependencies"
  "${VENV_DIR}/bin/python" -m pip install --upgrade pip
  "${VENV_DIR}/bin/python" -m pip install -r "${REQ_FILE}"
  printf '%s\n' "${REQ_HASH}" > "${STAMP_FILE}"
else
  echo "docs env: dependencies already in sync"
fi
