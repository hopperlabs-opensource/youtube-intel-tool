# Public GitHub Checklist

Use this before first push and before major releases.

## 1) Verify no secrets are present
- Confirm no real secrets in tracked files (`.env`, private keys, API tokens).
- Keep `.env.example` as placeholders only.

## 2) Keep local artifacts out of git
- Ensure `.gitignore` is present at repo root.
- Confirm local-only folders are ignored:
  - `node_modules/`
  - `.run/`
  - `.next/`
  - `.env*` (except `.env.example`)
  - `.competitors/`

## 3) Check nested repositories are removed
- Ensure there are no nested `.git` directories inside subfolders.

## 4) Quick scan commands
```bash
find . -type d -name .git
find . -name '.DS_Store'
rg -n --glob '!node_modules/**' --hidden "(OPENAI_API_KEY=|YIT_HF_TOKEN=|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|ghp_|sk-)"
```

## 5) Review what will be committed
```bash
git init
git status --short
git add .
git status --short
```

If anything unexpected appears, remove it before commit.

## 6) Baseline repo metadata
- Ensure these files exist and are up to date:
  - `LICENSE`
  - `README.md`
  - `CONTRIBUTING.md`
  - `SECURITY.md`
  - `CODE_OF_CONDUCT.md`
  - `.github/workflows/*`

## 7) Branch and account protection
- Enable org/repo 2FA requirements for maintainers.
- Protect `main` with pull-request requirement and required checks.
- Keep force-push and branch deletion disabled on `main`.
- Ensure secret scanning and push protection are enabled.
