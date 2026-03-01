#!/usr/bin/env bash
#
# Full CLI end-to-end test.
#
# Requires:
#   docker compose up -d
#   pnpm run db:migrate
#   pnpm --filter worker run dev &
#   pnpm --filter web run dev &
#
# Usage:
#   bash ops/tests/e2e-cli.sh [youtube-url]
#
set -euo pipefail

URL="${1:-https://www.youtube.com/watch?v=dQw4w9WgXcQ}"
YIT="${YIT_CLI:-npx yit}"
BASE="${YIT_BASE_URL:-http://localhost:48333}"

pass=0
fail=0

run() {
  local label="$1"; shift
  echo -n "  $label ... "
  if output=$("$@" 2>&1); then
    echo "OK"
    ((pass++))
  else
    echo "FAIL"
    echo "    $output" | head -5
    ((fail++))
  fi
}

echo "=== CLI E2E Tests ==="
echo "  URL:  $URL"
echo "  CLI:  $YIT"
echo "  API:  $BASE"
echo ""

# ─── Health ──────────────────────────────────────────────────────────────────

echo "--- Health ---"
run "api health" curl -sf "$BASE/api/health"
echo ""

# ─── Resolve + Ingest ────────────────────────────────────────────────────────

echo "--- Resolve + Ingest ---"
RESOLVE_OUT=$($YIT resolve "$URL" --json 2>&1) || { echo "FAIL: resolve"; echo "$RESOLVE_OUT"; exit 1; }
VIDEO_ID=$(echo "$RESOLVE_OUT" | jq -r '.video.id // empty')
if [ -z "$VIDEO_ID" ]; then
  echo "FAIL: could not extract video ID from resolve output"
  echo "$RESOLVE_OUT"
  exit 1
fi
echo "  resolved video: $VIDEO_ID"

run "ingest" $YIT ingest "$VIDEO_ID" --language en --steps enrich_cli --json
echo ""

# ─── Data Queries ────────────────────────────────────────────────────────────

echo "--- Data Queries ---"
run "transcripts list" $YIT transcripts list "$VIDEO_ID" --json
run "search keyword" $YIT search "$VIDEO_ID" --query "never" --mode keyword --json
run "entities" $YIT entities "$VIDEO_ID" --json
run "speakers list" $YIT speakers list "$VIDEO_ID" --json
run "tags" $YIT tags "$VIDEO_ID" --json
run "chapters" $YIT chapters "$VIDEO_ID" --json
echo ""

# ─── Visual Features ─────────────────────────────────────────────────────────

echo "--- Visual Features ---"
run "visual ingest (queue)" $YIT visual ingest "$VIDEO_ID" --json || true
run "dense-transcript read" $YIT visual dense-transcript "$VIDEO_ID" --json || true
run "auto-chapters read" $YIT auto-chapters "$VIDEO_ID" --json || true
run "marks list" $YIT marks "$VIDEO_ID" --json || true
echo ""

# ─── Faces ───────────────────────────────────────────────────────────────────

echo "--- Faces ---"
run "faces ingest (queue)" $YIT faces ingest "$VIDEO_ID" --json || true
run "faces list" $YIT faces list "$VIDEO_ID" --json
echo ""

# ─── Voice ───────────────────────────────────────────────────────────────────

echo "--- Voice ---"
run "voice ingest (queue)" $YIT voice ingest "$VIDEO_ID" --json || true

# Get first speaker ID for voice info/match
SPEAKERS_OUT=$($YIT speakers list "$VIDEO_ID" --json 2>&1) || true
SPEAKER_ID=$(echo "$SPEAKERS_OUT" | jq -r '.speakers[0].id // empty' 2>/dev/null) || true
if [ -n "$SPEAKER_ID" ]; then
  run "voice info" $YIT voice info "$VIDEO_ID" "$SPEAKER_ID" --json || true
  run "voice match" $YIT voice match "$VIDEO_ID" "$SPEAKER_ID" --json || true
else
  echo "  [skip] no speakers found for voice info/match"
fi
echo ""

# ─── Global Speakers ─────────────────────────────────────────────────────────

echo "--- Global Speakers ---"
run "global-speakers list" $YIT global-speakers list --json
echo ""

# ─── Policies ────────────────────────────────────────────────────────────────

echo "--- Policies ---"
run "policies list" $YIT policies list --json
echo ""

# ─── Direct API curl tests ──────────────────────────────────────────────────

echo "--- Direct API Tests ---"

# PATCH face identity (if any)
FACES_OUT=$(curl -sf "$BASE/api/videos/$VIDEO_ID/faces" 2>/dev/null) || true
IDENTITY_ID=$(echo "$FACES_OUT" | jq -r '.identities[0].id // empty' 2>/dev/null) || true
if [ -n "$IDENTITY_ID" ]; then
  run "PATCH face identity" curl -sf -X PATCH \
    -H "Content-Type: application/json" \
    -d '{"display_name":"e2e-test-face"}' \
    "$BASE/api/videos/$VIDEO_ID/faces/$IDENTITY_ID"

  run "GET face detections" curl -sf "$BASE/api/videos/$VIDEO_ID/faces/$IDENTITY_ID/detections"
else
  echo "  [skip] no face identities for PATCH/detections test"
fi

# Global speaker CRUD via curl
GS_CREATE=$(curl -sf -X POST -H "Content-Type: application/json" \
  -d "{\"display_name\":\"e2e-curl-${RANDOM}\"}" \
  "$BASE/api/global-speakers" 2>/dev/null) || true
GS_ID=$(echo "$GS_CREATE" | jq -r '.global_speaker.id // empty' 2>/dev/null) || true
if [ -n "$GS_ID" ]; then
  run "PATCH global speaker" curl -sf -X PATCH \
    -H "Content-Type: application/json" \
    -d '{"display_name":"e2e-curl-updated"}' \
    "$BASE/api/global-speakers/$GS_ID"
else
  echo "  [skip] global speaker PATCH (create failed)"
fi
echo ""

# ─── Summary ─────────────────────────────────────────────────────────────────

echo "=== Results ==="
echo "  passed: $pass"
echo "  failed: $fail"
echo ""

if [ "$fail" -gt 0 ]; then
  echo "SOME TESTS FAILED"
  exit 1
fi
echo "ALL TESTS PASSED"
