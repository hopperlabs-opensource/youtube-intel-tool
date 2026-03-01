import { expect, test } from "@playwright/test";

const ACK_KEY = "yit:safety_notice_ack_v1";
const ACK_COOKIE_NAME = "yit_safety_ack_v1";

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();
  await page.addInitScript(([ackKey, cookieName]) => {
    window.localStorage.removeItem(ackKey);
    document.cookie = `${cookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
  }, [ACK_KEY, ACK_COOKIE_NAME]);
});

test("accept button enables only after both checkboxes", async ({ page }) => {
  await page.goto("/safety-check");

  const acceptButton = page.getByRole("button", { name: "I Understand and Accept" });
  const localOnly = page.locator("#safety-local-only");
  const risk = page.locator("#safety-risk");

  await expect(acceptButton).toBeVisible();
  await expect(acceptButton).toBeDisabled();

  await localOnly.click();
  await expect(acceptButton).toBeDisabled();

  await risk.click();
  await expect(acceptButton).toBeEnabled();

  await acceptButton.click();
  await expect(acceptButton).toBeHidden();
});

test("fallback bypass appears and allows continuing", async ({ page }) => {
  await page.goto("/safety-check");

  const bypass = page.getByRole("button", { name: "Continue Without Gate (This Session)" });
  await expect(bypass).toBeVisible({ timeout: 8_000 });
  await bypass.click();

  await expect(page.getByRole("button", { name: "I Understand and Accept" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Safety Gate Check" })).toBeVisible();
});

test("fallback accept works when JavaScript is disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await context.clearCookies();
  await page.goto("/safety-check");
  await expect(page.getByText("Local-Only Security Notice")).toBeVisible();

  await page.locator("summary").click();
  await page.getByRole("button", { name: "Accept via Fallback Reload" }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.goto("/safety-check");

  await expect(page.getByText("Local-Only Security Notice")).toHaveCount(0);
  await context.close();
});
