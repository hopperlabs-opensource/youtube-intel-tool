#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"${ROOT_DIR}/ops/docs/ensure_venv.sh"

cd "${ROOT_DIR}"
if [ "$#" -gt 0 ]; then
  "${ROOT_DIR}/.run/venvs/docs/bin/python" -m mkdocs serve "$@"
else
  "${ROOT_DIR}/.run/venvs/docs/bin/python" -m mkdocs serve -a "${YIT_DOCS_ADDR:-127.0.0.1:8010}"
fi
