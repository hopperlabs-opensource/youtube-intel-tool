#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "${HERE}/down.sh" || true
bash "${HERE}/up.sh"

