# 10 - Future Repo File Tree (When We Build)

This is the proposed structure for the actual implementation (not created yet).

## Option A (Recommended): One Next.js App + Worker
```text
codex-implementation/
  apps/
    web/
      app/
        (routes)/
        api/
          videos/
          transcripts/
          jobs/
          search/
          entities/
          context/
          chat/
      components/
        player/
        transcript/
        search/
        chat/
        context/
      lib/
        api-client/
        contracts/          # Zod schemas
        player-adapters/
        stores/             # Zustand stores
        db/                 # Prisma or SQL helpers
  workers/
    ingest-worker/
      src/
        jobs/
        providers/
        metrics/
  packages/
    contracts/             # shared Zod contracts
    core/                  # shared domain logic
  docker/
    docker-compose.yml
  artifacts/
  plan/
```

## Option B: Separate API Service + UI App
Use this if you want the API independently deployable.
```text
codex-implementation/
  services/
    api/
    worker/
  apps/
    web/
  packages/
    contracts/
    core/
  plan/
```

