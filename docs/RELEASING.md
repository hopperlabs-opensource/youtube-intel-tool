# Releasing
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Publishable packages are `@yt/contracts`, `@yt/sdk`, and `@yt/cli`.
- Run `pnpm verify` and `pnpm release:check` before any publish.
- Use this doc for manual release flow and CI release checks.

This repository includes npm publish scaffolding for:

- `@yt/contracts`
- `@yt/sdk`
- `@yt/cli`

## Preflight

```bash
pnpm verify
pnpm release:check
```

`pnpm release:check` builds each publishable package and writes `.tgz` artifacts to `.run/packs`.

## Package metadata

Each publishable package defines:

- `dist/` build output
- `files` allowlist
- ESM export map
- `publishConfig.access = public`

## Publish manually

```bash
pnpm -C packages/contracts publish --access public
pnpm -C packages/sdk publish --access public
pnpm -C apps/cli publish --access public
```

## CI support

- `CI` workflow runs lint, typecheck, and unit tests.
- `Release Check` workflow builds and packs publishable packages, then uploads artifacts.
