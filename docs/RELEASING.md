# Releasing
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Publishable packages are `@yt/contracts`, `@yt/sdk`, and `@yt/cli`.
- Run `pnpm verify`, `pnpm test:integration`, and `pnpm release:check` before any publish.
- Use this doc for manual release flow and CI release checks.

This repository includes npm publish scaffolding for:

- `@yt/contracts`
- `@yt/sdk`
- `@yt/cli`

## Preflight

```bash
pnpm verify
pnpm test:integration
pnpm release:check
```

`pnpm release:check` builds each publishable package and writes `.tgz` artifacts to `.run/packs`.

## Versioning policy

- `@yt/contracts`:
  - Breaking schema changes require a major bump.
  - Additive schema changes require minor bump.
- `@yt/sdk`:
  - Breaking API/type changes require a major bump.
  - Backward-compatible API additions require minor bump.
- `@yt/cli`:
  - Breaking command/flag behavior requires a major bump.
  - Backward-compatible command additions require minor bump.
- Patch releases are for bug fixes and documentation-only packaging changes.

## Release checklist

1. Confirm branch protection checks are passing on `main`.
2. Run local preflight commands.
3. Update versions/changelog.
4. Run `pnpm release:check` and inspect generated `.tgz` contents.
5. Publish packages in dependency order (`contracts` -> `sdk` -> `cli`).
6. Create GitHub release notes with package versions and key changes.

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

If using npm provenance/signing, run publish from CI with trusted publishing configured.

## CI support

- `CI` workflow runs lint, typecheck, and unit tests.
- `Secret Scan` workflow checks for leaked secrets on pushes/PRs.
- `Release Check` workflow builds and packs publishable packages, then uploads artifacts.
