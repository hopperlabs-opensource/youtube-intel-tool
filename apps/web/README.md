# Web App (`apps/web`)

Next.js App Router frontend for YouTube Intel Tool.

## What Lives Here

- User-facing routes (`/`, `/search`, `/youtube`, `/library/*`, `/videos/:videoId`)
- API route handlers under `app/api/*`
- UI components for transcript, search, entities, context, chat, and job inspection

## Local Dev

From repo root:

```bash
pnpm dev:web
```

Or run full stack:

```bash
pnpm dev
```

Default URL:

- `http://localhost:3333`

## API Surface

This app exposes the project API through Next.js route handlers.

Entry point:

- `app/api/**/route.ts`

Contracts are defined in `packages/contracts` and used by web + CLI + tests.

## Metrics

Web metrics endpoint:

- `GET /metrics`

## Related Docs

- [Root README](../../README.md)
- [Getting Started](../../docs/GETTING_STARTED.md)
- [API Reference](../../docs/API.md)
- [Architecture](../../docs/ARCHITECTURE.md)
