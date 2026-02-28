#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL_FILE="${1:-${ROOT_DIR}/config/demo_videos.txt}"

if [ ! -f "${URL_FILE}" ]; then
  echo "error: demo URL file not found: ${URL_FILE}" >&2
  exit 1
fi

cd "${ROOT_DIR}"

echo "Demo ingest seed"
echo "cwd: ${ROOT_DIR}"
echo "url list: ${URL_FILE}"
echo

if ! pnpm yit health >/dev/null 2>&1; then
  echo "error: stack is not healthy. Start it first with: pnpm bg:up" >&2
  exit 1
fi

ok=0
failed=0

while IFS= read -r raw || [ -n "${raw}" ]; do
  line="${raw#"${raw%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  if [ -z "${line}" ] || [[ "${line}" == \#* ]]; then
    continue
  fi

  echo "ingest: ${line}"
  if pnpm yit ingest "${line}" --wait; then
    ok=$((ok + 1))
  else
    failed=$((failed + 1))
    echo "warn: ingest failed for ${line}" >&2
  fi
  echo
done < "${URL_FILE}"

echo "seed result: ok=${ok} failed=${failed}"

if [ "${failed}" -gt 0 ]; then
  exit 1
fi
