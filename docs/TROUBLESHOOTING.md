# Troubleshooting

Use this checklist when local runs are failing.

## Scope reminder

This stack is intended for local/self-hosted use. If you expose it to the
public internet and observe abuse/security issues, treat that as a deployment
hardening gap (auth/TLS/rate limits/secrets/CORS), not a local-run issue.

## Quick Triage

1. Confirm infra is up: `pnpm db:up`
2. Confirm migrations are applied: `pnpm db:migrate`
3. Confirm app is running: `pnpm dev`
4. Run preflight: `pnpm run doctor`
5. Confirm API health: `pnpm yit health`
6. Inspect capabilities: `pnpm yit capabilities`

## Port Conflicts

Symptoms:

- Web app starts on a different port
- Metrics endpoint unreachable

Fix:

```bash
YIT_WEB_PORT=3344 \
YIT_WORKER_METRICS_PORT=4011 \
YIT_PROMETHEUS_PORT=59093 \
YIT_GRAFANA_PORT=53001 \
pnpm bg:up
```

Use the printed port values and set `YIT_BASE_URL` for CLI if needed.
For the full config model, see `docs/CONFIG.md`.

## `yt-dlp` Errors

Symptoms:

- YouTube discovery fails
- Ingest cannot fetch transcript source

Fix:

```bash
brew install yt-dlp
yt-dlp --version
```

Then restart web and worker.

## `ffmpeg` Missing

Symptoms:

- Audio conversion or fallback STT steps fail

Fix:

```bash
brew install ffmpeg
ffmpeg -version
```

## Semantic Search Returns Empty Results

Symptoms:

- `mode=semantic` returns no hits
- `embedding_error` present in response

Fix:

1. Inspect `/api/capabilities` embeddings section.
2. Configure embedding provider environment variables.
3. Re-run ingest for affected videos so chunks get embeddings.

## Diarization Not Available

Symptoms:

- Speaker segments missing
- Diarization steps skipped

Fix:

```bash
export YIT_DIARIZE_BACKEND=pyannote
export YIT_HF_TOKEN=...
export YIT_PYTHON_BIN=python3.11
```

Install required Python dependencies for your pyannote setup and re-run ingest with `--diarize`.

## STT Fallback Not Available

Symptoms:

- Caption-disabled videos fail ingest

Fix:

```bash
export YIT_STT_PROVIDER=openai
export OPENAI_API_KEY=...
```

Re-run ingest. If you need strict transcript-only behavior, keep STT disabled.

## Queue and Worker Issues

Symptoms:

- Jobs stay queued forever
- No job logs appear

Fix:

1. Ensure worker process is running (`pnpm dev` starts both web + worker).
2. Check worker logs for Redis/DB connection failures.
3. Verify Redis container is healthy.

## Database Reset (Local Only)

If your local DB state is corrupted and you want a clean start:

```bash
pnpm db:down
pnpm db:up
pnpm db:migrate
```

If needed, remove persistent volumes manually before `db:up`.

## Contract Test Failures

`pnpm test` expects a running local stack.

Set explicit target and test video if required:

```bash
export YIT_BASE_URL=http://localhost:3333
export YIT_CONTRACT_TEST_INGEST_URL=https://www.youtube.com/watch?v=dQw4w9WgXcQ
pnpm test
```

## Still Stuck

- Capture failing command and full output.
- Include `pnpm yit health` and `/api/capabilities` output.
- Open an issue with repro steps and environment details.
