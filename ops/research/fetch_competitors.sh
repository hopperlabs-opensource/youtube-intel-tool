#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_DIR="${ROOT}/.competitors"

mkdir -p "${TARGET_DIR}"

# Format: name|url|license
REPOS=(
  "tubearchivist|https://github.com/tubearchivist/tubearchivist.git|GPL-3.0"
  "pinchflat|https://github.com/kieraneglin/pinchflat.git|AGPL-3.0"
  "ytdl-sub|https://github.com/jmbannon/ytdl-sub.git|GPL-3.0"
  "tubesync|https://github.com/meeb/tubesync.git|AGPL-3.0"
  "youtube-transcript-api|https://github.com/jdepoix/youtube-transcript-api.git|MIT"
)

echo "Syncing competitor repos into ${TARGET_DIR}"

for entry in "${REPOS[@]}"; do
  IFS="|" read -r name url license <<<"${entry}"
  dest="${TARGET_DIR}/${name}"

  if [[ -d "${dest}/.git" ]]; then
    echo "Updating ${name} (${license})"
    git -C "${dest}" fetch --depth=1 origin
    default_branch="$(git -C "${dest}" remote show origin | sed -n '/HEAD branch/s/.*: //p')"
    if [[ -z "${default_branch}" ]]; then
      default_branch="main"
    fi
    git -C "${dest}" checkout "${default_branch}" >/dev/null 2>&1 || true
    git -C "${dest}" reset --hard "origin/${default_branch}"
    git -C "${dest}" clean -fdx
  else
    echo "Cloning ${name} (${license})"
    git clone --depth=1 "${url}" "${dest}"
  fi
done

cat >"${TARGET_DIR}/README.md" <<'EOF'
# Competitor Research Mirror (Local Only)

This directory is intentionally gitignored.

Purpose:
- Inspect ecosystem patterns and UX.
- Re-implement ideas in our own architecture.

Rules:
- Do not copy/paste code from copyleft repos (GPL/AGPL).
- Treat this folder as reference material only.
- Keep implementation original and contract-first in this repository.
EOF

echo "Done. Repos mirrored locally under ${TARGET_DIR}"
