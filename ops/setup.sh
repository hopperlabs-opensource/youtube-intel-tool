#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

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
echo "open: http://localhost:${YIT_WEB_PORT:-3333}"
echo "stop: pnpm bg:down"
