#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="${ROOT_DIR}/.run/venvs/tests"
REQ_FILE="${ROOT_DIR}/ops/tests/requirements.txt"
STAMP_FILE="${VENV_DIR}/.requirements.sha256"

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

BASE_PY="${YIT_PYTHON_BIN:-python3}"
if ! command -v "${BASE_PY}" >/dev/null 2>&1; then
  if command -v python3 >/dev/null 2>&1; then
    BASE_PY="python3"
  elif command -v python >/dev/null 2>&1; then
    BASE_PY="python"
  else
    echo "no Python interpreter found (expected python3)" >&2
    exit 1
  fi
fi
BASE_PY="$(command -v "${BASE_PY}")"

if [ ! -d "${VENV_DIR}" ]; then
  "${BASE_PY}" -m venv "${VENV_DIR}"
fi

PY_BIN="${VENV_DIR}/bin/python"
PIP_BIN="${VENV_DIR}/bin/pip"

if [ ! -x "${PY_BIN}" ] || [ ! -x "${PIP_BIN}" ]; then
  echo "test venv is missing python/pip binaries at ${VENV_DIR}" >&2
  exit 1
fi

REQ_HASH="$(hash_file "${REQ_FILE}")"
INSTALLED_HASH="$(cat "${STAMP_FILE}" 2>/dev/null || true)"

if [ "${REQ_HASH}" != "${INSTALLED_HASH}" ]; then
  "${PY_BIN}" -m pip install --upgrade pip >&2
  "${PIP_BIN}" install -r "${REQ_FILE}" >&2
  printf '%s' "${REQ_HASH}" > "${STAMP_FILE}"
fi

echo "${PY_BIN}"
