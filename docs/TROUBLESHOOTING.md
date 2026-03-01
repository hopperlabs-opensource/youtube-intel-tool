# Troubleshooting
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Start with `pnpm run doctor`, then `pnpm yit health` and `pnpm yit capabilities`.
- Most local failures are port conflicts, missing host tools, or provider configuration gaps.
- Use this guide for local/self-hosted operation.

> ⚠️ **Watch out**
> If you expose this stack publicly and see abuse/security issues, treat that as an internet hardening gap (auth/TLS/rate limits/secrets/CORS), not a local-run defect.

## Quick Triage

```bash
pnpm db:up
pnpm db:migrate
pnpm dev
pnpm run doctor
pnpm yit health
pnpm yit capabilities
```

## Symptom: Port conflicts

### Likely causes
- Existing process already bound to default ports
- Previous stack instance still running

### Steps
```bash
YIT_WEB_PORT=3344 \
YIT_WORKER_METRICS_PORT=4011 \
YIT_PROMETHEUS_PORT=59093 \
YIT_GRAFANA_PORT=53001 \
pnpm bg:up
```

### Verify
- App and metrics endpoints are reachable on new ports.
- If needed, set CLI base URL:

```bash
export YIT_BASE_URL="http://localhost:${YIT_WEB_PORT:-3333}"
pnpm yit health
```

## Symptom: `yt-dlp` errors

### Likely causes
- `yt-dlp` missing from host
- Old `yt-dlp` binary

### Steps
```bash
brew install yt-dlp
yt-dlp --version
```

Then restart web/worker processes.

### Verify
- `pnpm yit youtube search "test"` returns results.
- Ingest can fetch transcript sources.

## Symptom: `ffmpeg` missing

### Likely causes
- `ffmpeg` not installed on host

### Steps
```bash
brew install ffmpeg
ffmpeg -version
```

### Verify
- Audio conversion and fallback STT steps complete during ingest.

## Symptom: Semantic search returns empty results

### Likely causes
- Embeddings provider disabled/misconfigured
- Existing videos ingested before embeddings were enabled

### Steps
1. Inspect `/api/capabilities` embeddings section.
2. Configure provider environment variables.
3. Re-run ingest for affected videos.

### Verify
- `mode=semantic` or `mode=hybrid` search returns embedding-backed hits.

## Symptom: Diarization unavailable

### Likely causes
- Diarization backend not configured
- Missing Hugging Face token or Python runtime

### Steps
```bash
export YIT_DIARIZE_BACKEND=pyannote
export YIT_HF_TOKEN=...
export YIT_PYTHON_BIN=python3.11
```

Install required Python deps for your pyannote setup, then re-run ingest with diarization enabled.

### Verify
- Speaker segments appear in `GET /api/videos/:videoId/speakers/segments`.

## Symptom: STT fallback unavailable

### Likely causes
- STT provider not configured
- Missing provider key

### Steps
```bash
export YIT_STT_PROVIDER=openai
export OPENAI_API_KEY=...
```

Re-run ingest.

### Verify
- Caption-disabled videos can complete ingest via STT fallback.

## Symptom: Jobs stay queued / no worker logs

### Likely causes
- Worker process not running
- Redis or DB connectivity failure

### Steps
1. Ensure worker is running (`pnpm dev` starts web + worker).
2. Check logs for connection errors.
3. Verify Redis container health.

### Verify
- New ingest jobs transition from queued to running.

## Symptom: Local DB state is corrupted

### Steps
```bash
pnpm db:down
pnpm db:up
pnpm db:migrate
```

If needed, remove persistent volumes manually before `db:up`.

### Verify
- Migration completes and `pnpm yit health` succeeds.

## Symptom: Contract tests failing

### Likely causes
- Local stack not running
- Test ingest URL unavailable

### Steps
```bash
export YIT_BASE_URL="http://localhost:${YIT_WEB_PORT:-3333}"
export YIT_CONTRACT_TEST_INGEST_URL=https://www.youtube.com/watch?v=dQw4w9WgXcQ
pnpm test:integration
```

### Verify
- Contract test suite exits successfully.
- Python transcript dependency is sourced from pinned `ops/tests/requirements.txt` via `.run/venvs/tests`.

## Symptom: Safety notice checkboxes are checked but Accept stays disabled

### Likely causes
- Brave Shields or privacy/script-blocking extensions are interfering with localhost scripts.
- Browser storage is blocked in this profile.

### Steps
1. Disable Shields for `http://localhost:3333`.
2. Disable script/privacy extensions for localhost.
3. Hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`).
4. If needed, clear site storage and reload.

### Verify
- After checking both boxes, `I Understand and Accept` becomes enabled.
- If browser protections still interfere, use `Continue Without Gate (This Session)`.

### Extra validation
```bash
pnpm exec playwright test --config apps/web/e2e/playwright.config.cjs --project=chromium
pnpm exec playwright test --config apps/web/e2e/playwright.config.cjs --project=firefox
pnpm exec playwright test --config apps/web/e2e/playwright.config.cjs --project=webkit

# optional local channels
E2E_ENABLE_CHROME=1 pnpm exec playwright test --config apps/web/e2e/playwright.config.cjs --project=chrome
E2E_BRAVE_PATH=\"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser\" pnpm exec playwright test --config apps/web/e2e/playwright.config.cjs --project=brave
```

## Still Stuck

When opening an issue, include:
- Failing command and full output
- `pnpm yit health` output
- `/api/capabilities` output
- Environment details (OS, Node, pnpm, Docker versions)
