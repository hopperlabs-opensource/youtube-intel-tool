import { expect, test } from "@playwright/test";

test("noscript warning markup is present in server-rendered HTML", async ({ request }) => {
  const res = await request.get("http://127.0.0.1:3401/safety-check");
  const html = await res.text();
  expect(html).toContain("JavaScript is required for this local UI.");
});

test("hydration watchdog banner can be triggered for blocked-runtime fallback", async ({ page }) => {
  await page.goto("/safety-check");
  const becameVisible = await page.evaluate(() => {
    const el = document.getElementById("yit-hydration-watchdog");
    if (!el) return false;
    const helper = (window as unknown as { __yitShowHydrationWatchdog?: () => void }).__yitShowHydrationWatchdog;
    helper?.();
    return !el.hidden;
  });
  expect(becameVisible).toBe(true);
});
