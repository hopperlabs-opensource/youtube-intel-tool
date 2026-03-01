#!/usr/bin/env bash
# Quick API verification — hit every endpoint, validate HTTP status AND response content.
set -uo pipefail

VID="${1:-7370eef9-52f8-47c7-bef4-da8475af943f}"
BASE="${YIT_BASE_URL:-http://localhost:48333}"
pass=0; fail=0

check() {
  local label="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    echo "  OK   $label"
    ((pass++))
  else
    echo "  FAIL $label"
    echo "       ${out:0:120}"
    ((fail++))
  fi
}

# check_json: validates both HTTP success AND a jq expression on the JSON body.
check_json() {
  local label="$1"; shift
  local jq_expr="$1"; shift
  local out
  echo -n "  $label ... "
  if out=$("$@" 2>&1); then
    if echo "$out" | jq -e "$jq_expr" > /dev/null 2>&1; then
      echo "OK"
      ((pass++))
    else
      echo "FAIL (content)"
      echo "       jq: $jq_expr"
      echo "       body: ${out:0:120}"
      ((fail++))
    fi
  else
    echo "FAIL (http)"
    echo "       ${out:0:120}"
    ((fail++))
  fi
}

echo "=== API Verification (with content validation) ==="
echo "  Video: $VID"
echo "  Base:  $BASE"
echo ""

check       "health"                    curl -sf "$BASE/api/health"
check_json  "video detail"              '.video.id'                         curl -sf "$BASE/api/videos/$VID"
check_json  "transcripts list"          '.transcripts | type == "array"'    curl -sf "$BASE/api/videos/$VID/transcripts"
check_json  "search keyword"            '.results != null'                  curl -sf -X POST -H "Content-Type: application/json" -d '{"query":"zoo","mode":"keyword"}' "$BASE/api/videos/$VID/search"
check_json  "entities list"             '.entities | type == "array"'       curl -sf "$BASE/api/videos/$VID/entities"
check_json  "tags"                      '.tags | type == "array"'           curl -sf "$BASE/api/videos/$VID/tags"
check_json  "chapters"                  '.chapters | type == "array"'       curl -sf "$BASE/api/videos/$VID/chapters"
check_json  "speakers list"             '.speakers | type == "array"'       curl -sf "$BASE/api/videos/$VID/speakers"
check       "visual transcript"         curl -sf "$BASE/api/videos/$VID/visual/transcript"
check_json  "visual status"             '.status != null'                   curl -sf "$BASE/api/videos/$VID/visual/status"
check_json  "frames list"               '.frames | type == "array"'         curl -sf "$BASE/api/videos/$VID/frames"
check_json  "visual chunks"             '.chunks | type == "array"'         curl -sf "$BASE/api/videos/$VID/visual/chunks"
check_json  "dense-transcript"          '.transcript != null'               curl -sf "$BASE/api/videos/$VID/visual/dense-transcript"
check_json  "auto-chapters"             '.chapters != null'                 curl -sf "$BASE/api/videos/$VID/auto-chapters"
check_json  "marks"                     '.marks | type == "array"'          curl -sf "$BASE/api/videos/$VID/marks"
check_json  "faces list"                '.faces | type == "array"'          curl -sf "$BASE/api/videos/$VID/faces"
check_json  "global-speakers list"      '.speakers | type == "array"'       curl -sf "$BASE/api/global-speakers"
check_json  "policies list"             '.policies | type == "array"'       curl -sf "$BASE/api/policies"

# POST endpoints (ingest jobs)
check_json  "faces ingest (queue)"      '.job != null'                      curl -sf -X POST -H "Content-Type: application/json" -d '{}' "$BASE/api/videos/$VID/faces/ingest"
check_json  "voice ingest (queue)"      '.job != null'                      curl -sf -X POST -H "Content-Type: application/json" -d '{}' "$BASE/api/videos/$VID/speakers/voice-ingest"

echo ""
echo "=== Results ==="
echo "  passed: $pass"
echo "  failed: $fail"
[ "$fail" -gt 0 ] && exit 1
echo "ALL PASSED"
