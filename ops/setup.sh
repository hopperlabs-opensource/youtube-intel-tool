#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# shellcheck source=ops/lib/defaults.sh
source "${ROOT_DIR}/ops/lib/defaults.sh"

echo "YouTube Intel Tool Setup"
echo "cwd: ${ROOT_DIR}"
echo

if [ ! -f .env ]; then
  cp .env.example .env
  echo "created .env from .env.example"
else
  echo "using existing .env"
fi

echo
echo "installing dependencies..."
pnpm install

echo
echo "running doctor checks..."
pnpm run doctor

echo
echo "starting local stack..."
pnpm bg:up

echo
echo "verifying health..."
pnpm yit health
pnpm yit capabilities

echo
echo "setup complete"
DEFAULT_WEB_PORT="$(yit_read_default_env "${ROOT_DIR}" "YIT_WEB_PORT" "3333")"
echo "open: http://localhost:${YIT_WEB_PORT:-${DEFAULT_WEB_PORT}}"
echo "stop: pnpm bg:down"
echo "optional demo seed: pnpm seed:demo"

if [ "${YIT_SETUP_SEED_DEMO:-0}" = "1" ]; then
  echo
  echo "seeding demo videos from config/demo_videos.txt..."
  pnpm seed:demo
fi
