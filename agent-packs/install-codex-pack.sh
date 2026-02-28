#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/agent-packs/codex/skills"
DEST_DIR="${CODEX_HOME:-$HOME/.codex}/skills"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "missing source directory: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp -R "$SRC_DIR"/. "$DEST_DIR"/

echo "Installed Codex skills to: $DEST_DIR"
ls -1 "$DEST_DIR" | sed 's/^/ - /'
