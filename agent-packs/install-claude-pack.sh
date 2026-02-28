#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/agent-packs/claude/commands"
DEST_DIR="${CLAUDE_HOME:-$HOME/.claude}/commands"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "missing source directory: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp -R "$SRC_DIR"/. "$DEST_DIR"/

echo "Installed Claude commands to: $DEST_DIR"
ls -1 "$DEST_DIR" | sed 's/^/ - /'
