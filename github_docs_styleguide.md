# GitHub Docs Style Guide (YouTube Intelligence Platform)
Version: 1.1
Status: Stable
Last updated: 2026-02-28

Purpose: define one consistent, high-signal documentation style for this repository so docs stay product-grade, accurate, and LLM-friendly.

Scope: `README.md`, `docs/*.md`, docs assets, and documentation-related PRs.

---

## 0) Core Principles (Non-Negotiable)

1. Skimmable first, deep second
- Every doc starts with a 10-30 second summary (`TL;DR` or equivalent).
- Every major section starts with 1-2 lines of context.

2. Stable anchors
- Keep heading names stable once published.
- Prefer `##` and `###`; avoid going deeper than `####`.

3. Single source of truth
- Do not duplicate setup steps in multiple files unless necessary.
- Link to the canonical section/file when repeating context.

4. Concrete over generic
- Every claim must point to a command, path, API endpoint, schema, or image.

5. Docs are contracts
- Docs define expected behavior, boundaries, and done criteria.

6. Local-first safety is explicit
- This repo is local/self-hosted by default.
- Any internet-facing guidance must include hardening requirements.

---

## 1) Repository Docs Set (This Repo)

### 1.1 Required at repo root
- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `PUBLIC_REPO_CHECKLIST.md`
- `github_docs_styleguide.md` (this file)

### 1.2 Canonical docs under `/docs`
- `docs/README.md` (docs index for repo browsing)
- `docs/index.md` (docs index for docs site)
- `docs/QUICKSTART.md`
- `docs/GETTING_STARTED.md`
- `docs/RUNBOOKS.md`
- `docs/CLI.md`
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/USE_CASES.md`
- `docs/CONFIG.md`
- `docs/TROUBLESHOOTING.md`
- `docs/GOVERNANCE.md`
- `docs/CONNECT.md`
- `docs/RELEASING.md`
- `docs/AGENT_PACKS.md`
- `docs/SCREENSHOTS.md`

### 1.3 Assets
- `docs/assets/screenshots/`
- Optional but recommended:
  - `docs/assets/banner.png`
  - `docs/assets/demo.gif`
  - `docs/assets/icons/` (if using local SVG icon assets)

---

## 2) Visual System (GitHub README + Docs)

### 2.1 README above-the-fold contract
Top of `README.md` should be in this order:

1. Project name (`# ...`)
2. 3-6 status badges max
3. One-line headline (user outcome)
4. One-line subhead (what this does)
5. Value proposition block (pain/promise/outcome)
6. Product preview (screenshots or demo GIF)
7. Quick navigation links or TOC

### 2.2 Icon policy
Pick one style per section and keep it consistent.

Style A (emoji-first, fastest)
- Good for callouts and simple lists.
- Avoid random emoji usage outside approved meanings.

Style B (SVG/logo icons)
- Good for support/channel tables and brand sections.
- Prefer local assets in `docs/assets/icons/`.
- If remote icon source is used, it must be stable and minimal.

Do not mix random badge styles and random icon sets in the same table/section.

### 2.3 Color policy (for images/diagrams)
Use one palette across banners/diagrams/demo overlays.

Recommended for this repo:
- Primary: `#1F6FEB`
- Accent: `#14B8A6`
- Support accent: `#EA4AAA`
- Neutral ink: `#111827`

Avoid heavy saturated strips at top unless proven readable in GitHub light and dark modes.

### 2.4 Spacing/layout policy
- Use `---` to separate major blocks.
- Keep paragraphs to 1-3 sentences.
- Use tables for comparison/at-a-glance sections.
- Keep badge rows compact (no giant multi-row badge walls).

---

## 3) Writing Style

### 3.1 Voice
- Engineering-facing, specific, practical.
- No hype or vague marketing statements.

### 3.2 Tense/perspective
- Instructions: second person, imperative (Run, Set, Open).
- Facts: present tense (The API returns ...).

### 3.3 Formatting rules
- Paths in backticks: `apps/web/app/api/health/route.ts`
- Commands in fenced blocks with shell info string.
- Env vars in ALLCAPS: `YIT_WEB_PORT`, `OPENAI_API_KEY`.

### 3.4 Definition-of-done language
Use measurable outcomes:
- Server returns 200 on `/api/health`
- `pnpm run doctor` passes
- `pnpm yit capabilities` reports expected providers/deps

---

## 4) Markdown Building Blocks (Project-Specific)

### 4.1 Standard header for docs files
Use this on operational/reference docs where useful:

```md
# <Doc Title>
Owner: <team/name>
Status: Draft | Stable | Deprecated
Last updated: YYYY-MM-DD

## TL;DR
- What this doc is for
- Who should read it
- Key action(s)
```

### 4.2 GitHub-safe callouts
```md
> ✅ GOOD DEFAULT
> Use `pnpm run setup` for first local bring-up.

> ⚠️ WARNING
> `pnpm db:down` will stop local DB services.

> ❌ DON'T
> Do not commit `.env` or local runtime artifacts.

> 🔒 SECURITY
> Treat browser-stored keys as local-profile plaintext.
```

### 4.3 Quickstart block (this repo)
````md
## Quickstart

### Prereqs
- Node.js >= 20
- pnpm >= 9
- Docker Desktop
- yt-dlp

### Run
```bash
pnpm install
pnpm run setup
pnpm run doctor
```

### Verify
```bash
pnpm yit health
pnpm yit capabilities
```
````

### 4.4 Value proposition block (this repo)
```md
## Why this exists
- Content overload makes it hard to stay current.
- Default recommendation algorithms are not your algorithm.
- This project converts video into structured text intelligence for search, ranking, and automation.

This project does NOT:
- Replace YouTube
- Guarantee internet-safe production hosting out of the box
```

### 4.5 Feature grid (product-page feel)
```md
## Core capabilities

| Module | What it does | Where |
|---|---|---|
| Web UI | Video workspace, search, chat, operations UX | `apps/web` |
| CLI | Automation and scripted workflows | `apps/cli` |
| Worker | Ingest and enrichment jobs | `apps/worker` |
| Contracts | Request/response schemas (Zod) | `packages/contracts` |
| SDK | Typed API client + route parity tests | `packages/sdk` |
```

### 4.6 Architecture diagram (ASCII)
```md
## Architecture (high level)

Client/UI/CLI
    |
    v
+-----------------------+
| Next.js API handlers  |
+-----------+-----------+
            |
     +------+------+
     |             |
     v             v
+---------+    +--------+
| Postgres|    | Redis  |
+----+----+    +---+----+
     |             |
     +------+------+
            |
            v
      +-----------+
      |  Worker   |
      | ingest/*  |
      +-----------+
```

### 4.7 Contracts snippet
````md
## Contracts
- Location: `packages/contracts/`
- Rule: no breaking request/response changes without explicit versioning and migration note.

Example envelope:
```json
{
  "error": {
    "code": "invalid_request",
    "message": "...",
    "details": {}
  }
}
```
````

### 4.8 API snippet (this repo)
```md
## API

### Base URL
- Local: `http://localhost:${YIT_WEB_PORT:-3333}`

### Health
`GET /api/health`

### Resolve video
`POST /api/videos/resolve`

### Ingest
`POST /api/videos/:videoId/ingest`
```

### 4.9 Troubleshooting snippet
````md
## Troubleshooting

### Symptom: CLI cannot reach API
Likely causes:
- Web app not running
- Wrong `YIT_BASE_URL`

Fix:
```bash
pnpm yit health
export YIT_BASE_URL="http://localhost:${YIT_WEB_PORT:-3333}"
pnpm yit health
```
````

---

## 5) README Layout Blueprint (This Repo)

Use this ordering:

1. Project title
2. Compact badges (3-6)
3. One-line headline and one-line subhead
4. Value proposition table (pain/promise/outcome)
5. Product preview strip (3 screenshots or 1 GIF)
6. Personal Algorithm (CLI/SDK/API) section
7. TL;DR / quickstart
8. Security boundary
9. Deeper capability/reference sections
10. Connect and support

Rules:
- Keep top section clean in GitHub light/dark mode.
- Do not use broken/404 badges.
- Prefer local images over fragile remote embeds.

---

## 6) Procedure Pattern for Ops Docs

For every operational procedure, use:
- Requirements
- Steps
- Verify

Template:
```md
## <Procedure Name>

### Requirements
- ...

### Steps
1. ...
2. ...

### Verify
- Command output and expected result
```

---

## 7) Diagram Rules

- Label arrows with verbs (`reads`, `writes`, `queues`, `streams`).
- Keep naming consistent with code paths.
- Max width around 110 chars.
- Prefer one diagram per section, with links to deeper docs.

Minimum diagram set:
1. High-level architecture
2. Ingest sequence
3. Search/chat retrieval flow
4. Optional deployment topology

---

## 8) What to Avoid

- Giant unbroken paragraphs
- Multiple conflicting quickstarts
- More than 6 badges near top of README
- Hidden assumptions (missing prereqs/env)
- Claims without example command/path
- Styling experiments that render poorly in GitHub

---

## 9) LLM Prompt Instructions (Drop-in)

Use this when asking an LLM/Codex to write docs for this repo:

```text
Follow github_docs_styleguide.md.
- Keep docs skimmable and concrete.
- Use repo-accurate commands, paths, and env vars.
- Use Requirements -> Steps -> Verify for procedures.
- Keep README top section: headline, value table, preview, then quickstart.
- Respect local-first security boundary language.
- Do not invent endpoints; use docs/API.md and packages/contracts as source of truth.
```

---

## 10) Grading Rubric (Scorecard)

Score each category from 0-10, then compute weighted score out of 100.

`weighted_score = sum(category_score/10 * weight)`

| Category | Weight | 10/10 Definition |
|---|---:|---|
| Value proposition clarity | 15 | Pain/promise/outcome is explicit, concrete, and user-centered |
| Visual hierarchy | 10 | Above-the-fold is clean, readable, and ordered |
| Onboarding quality | 15 | Quickstart is accurate, minimal, and verifiable |
| Technical accuracy | 15 | Commands, paths, env vars, and endpoints are correct |
| CLI/SDK/API discoverability | 10 | Users can find and use interfaces fast |
| Architecture clarity | 10 | Diagrams and boundaries are understandable |
| Security/support clarity | 10 | Local-first boundary and support channels are explicit |
| Consistency/brand | 10 | One visual system, one tone, one structure |
| Maintainability (SSOT) | 5 | Minimal duplication and clear canonical docs |

Grade bands:
- 95-100: A+
- 90-94: A
- 85-89: B+
- 80-84: B
- 70-79: C
- <70: needs rework

Recommended merge gate for docs-heavy PRs:
- README score >= 85
- Security/support clarity >= 8/10
- Onboarding quality >= 8/10

---

## 11) Publish Checklist

README:
- [ ] Clean top block (headline + value + preview)
- [ ] 3-6 badges max
- [ ] Working quickstart + verify commands
- [ ] Accurate links to canonical docs
- [ ] Connect/support section accurate (`Live` vs `Coming soon`)

Docs:
- [ ] Procedures use Requirements -> Steps -> Verify
- [ ] API docs match current route handlers/contracts
- [ ] No conflicting duplicate instructions
- [ ] Local-first security boundary is present where needed

Assets:
- [ ] Images render in GitHub
- [ ] No broken remote links
- [ ] Naming is consistent under `docs/assets/`

---

## 12) Roadmap-Adjacent Docs Pattern (Alerts/Policy)

When documenting future personal-algorithm features, use this template:

```md
## Policy and Alerts (MVP)

### Goal
Convert new video content into prioritized watch/alert queues.

### Inputs
- Channels
- Topics/keywords/entities
- Priority rules

### Outputs
- Priority buckets (high/medium/low)
- Raw feed export (json/rss)
- Alert events (webhook/email/slack)

### Verify
- Policy run completes
- New items are scored and bucketed
- Alert sink receives expected event
```

This keeps roadmap docs specific and implementation-ready.
