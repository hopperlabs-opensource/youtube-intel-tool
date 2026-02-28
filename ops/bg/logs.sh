#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/bg/_common.sh
source "${HERE}/_common.sh"

which="${1:-all}"

web_log="${LOG_DIR}/web.log"
worker_log="${LOG_DIR}/worker.log"

mkdir -p "${LOG_DIR}"
touch "${web_log}" "${worker_log}"

case "${which}" in
  web)
    tail -n 200 -f "${web_log}"
    ;;
  worker)
    tail -n 200 -f "${worker_log}"
    ;;
  all)
    tail -n 200 -f "${web_log}" "${worker_log}"
    ;;
  *)
    echo "usage: pnpm bg:logs [web|worker|all]" >&2
    exit 2
    ;;
esac

