# Screenshot Workflow (Playwright CLI)

Use this workflow to generate consistent, publishable screenshots for GitHub and docs.

## Goals

- Deterministic captures from known routes
- Consistent viewport and theme
- Stable filenames so README links do not change

## Target Files

Store final screenshots in:

- `docs/assets/screenshots/home.png`
- `docs/assets/screenshots/video-workspace.png`
- `docs/assets/screenshots/global-search.png`

The README points at these `.png` paths already. Re-capture in place to refresh visuals.

## 1. Start the App

```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

(Optional) Seed a known test video via CLI so pages have meaningful content.

## 2. Install Playwright Browsers

```bash
pnpm dlx playwright install chromium
```

## 3. Capture Screens

From repo root:

```bash
# Home
pnpm dlx playwright screenshot \
  --device="Desktop Chrome" \
  --wait-for-timeout=1500 \
  http://localhost:3333 \
  docs/assets/screenshots/home.png

# Global search
pnpm dlx playwright screenshot \
  --device="Desktop Chrome" \
  --wait-for-timeout=1500 \
  "http://localhost:3333/search?q=grounded%20chat" \
  docs/assets/screenshots/global-search.png
```

For a video workspace screenshot, open a specific video page URL that already has
transcript + search content:

```bash
pnpm dlx playwright screenshot \
  --device="Desktop Chrome" \
  --wait-for-timeout=1500 \
  "http://localhost:3333/videos/<videoId>" \
  docs/assets/screenshots/video-workspace.png
```

## 4. Keep Screenshots High Quality

- Use a consistent viewport (Desktop Chrome preset).
- Avoid empty states unless documenting first-run behavior.
- Include content-rich panels (transcript + search + chat where possible).
- Re-capture when major UI layout changes land.

## 5. Keep README Current

`README.md` links directly to the `.png` files above. Replace those files in-place
when UI changes.
