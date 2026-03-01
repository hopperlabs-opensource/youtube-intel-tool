#!/usr/bin/env bash
# CLI verification — test every command using correct subcommand names,
# with output content validation via jq.
set -uo pipefail

VID="${1:-7370eef9-52f8-47c7-bef4-da8475af943f}"
CLI_DIR="/Users/admirablebelsnickle/Desktop/hopperlabs-opensource/youtube-intel-tool/apps/cli"
export YIT_BASE_URL="${YIT_BASE_URL:-http://localhost:48333}"

pass=0; fail=0

yit() {
  pnpm -C "$CLI_DIR" --silent exec tsx src/index.ts "$@"
}

check() {
  local label="$1"; shift
  echo -n "  $label ... "
  if output=$(yit "$@" 2>&1); then
    echo "OK"
    ((pass++))
  else
    echo "FAIL"
    echo "    ${output:0:120}"
    ((fail++))
  fi
}

# check_content: validates CLI succeeds AND jq expression passes on output.
check_content() {
  local label="$1"; shift
  local jq_expr="$1"; shift
  echo -n "  $label ... "
  if output=$(yit "$@" 2>&1); then
    if echo "$output" | jq -e "$jq_expr" > /dev/null 2>&1; then
      echo "OK"
      ((pass++))
    else
      echo "FAIL (content)"
      echo "    jq: $jq_expr"
      echo "    output: ${output:0:120}"
      ((fail++))
    fi
  else
    echo "FAIL"
    echo "    ${output:0:120}"
    ((fail++))
  fi
}

echo "=== CLI Verification (with content validation) ==="
echo "  Video: $VID"
echo "  Base:  $YIT_BASE_URL"
echo ""

check          "health"                 health
check          "capabilities"           capabilities
check_content  "video get"              '.video.id'                      video get "$VID" --json
check_content  "video transcripts"      '.transcripts | type == "array"' video transcripts "$VID" --json
check_content  "search (library)"       '.results != null'               search "zoo" --mode keyword --json --limit 5
check_content  "video speakers"         '.speakers | type == "array"'    video speakers "$VID" --json
check_content  "video tags"             '.tags | type == "array"'        video tags "$VID" --json
check_content  "video chapters"         '.chapters | type == "array"'    video chapters "$VID" --json
check_content  "visual dense-transcript" '.transcript != null'           visual dense-transcript "$VID" --json
check_content  "auto-chapters show"     '.chapters != null'              auto-chapters show "$VID" --json
check_content  "marks list"             '.marks | type == "array"'       marks list "$VID" --json
check_content  "faces list"             '.faces | type == "array"'       faces list "$VID" --json
check_content  "faces ingest"           '.job != null'                   faces ingest "$VID" --json
check_content  "voice ingest"           '.job != null'                   voice ingest "$VID" --json
check_content  "global-speakers list"   '.speakers | type == "array"'    global-speakers list --json
check_content  "policy list"            '.policies | type == "array"'    policy list --json

echo ""
echo "=== Results ==="
echo "  passed: $pass"
echo "  failed: $fail"
[ "$fail" -gt 0 ] && exit 1
echo "ALL PASSED"
