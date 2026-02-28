#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"${ROOT_DIR}/ops/docs/ensure_venv.sh"

echo "docs env ready: ${ROOT_DIR}/.run/venvs/docs"
