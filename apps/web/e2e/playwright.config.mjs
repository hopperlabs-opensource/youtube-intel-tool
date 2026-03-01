import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3401";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const bravePath = process.env.E2E_BRAVE_PATH;

const projects = [
  { name: "chromium", use: { browserName: "chromium" } },
  { name: "firefox", use: { browserName: "firefox" } },
  { name: "webkit", use: { browserName: "webkit" } },
];

if (process.env.E2E_ENABLE_CHROME === "1") {
  projects.push({
    name: "chrome",
    use: { browserName: "chromium", channel: "chrome" },
  });
}

if (bravePath) {
  projects.push({
    name: "brave",
    use: {
      browserName: "chromium",
      launchOptions: { executablePath: bravePath },
    },
  });
}

export default defineConfig({
  testDir: ".",
  testMatch: ["*.spec.ts"],
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  outputDir: "../../../.run/e2e-results",
  reporter: [["line"]],
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command:
      "pnpm build:packages && NEXT_PUBLIC_YIT_SAFETY_BYPASS_DELAY_MS=1200 YIT_WEB_PORT=3401 WEB_PORT=3401 PORT=3401 pnpm -C apps/web exec next dev -p 3401",
    cwd: repoRoot,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects,
});
