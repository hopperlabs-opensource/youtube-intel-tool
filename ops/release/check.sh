#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/.run/packs"

mkdir -p "$OUT_DIR"

packages=(
  "packages/contracts"
  "packages/sdk"
  "apps/cli"
)

echo "==> Packing publishable packages"
for pkg in "${packages[@]}"; do
  echo "-- $pkg"
  pnpm -C "$ROOT_DIR/$pkg" pack --pack-destination "$OUT_DIR"
done

echo "==> Packed artifacts"
ls -lh "$OUT_DIR"
