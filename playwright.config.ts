import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    },
  },
  projects: [
    // ── Full suite on Chromium ────────────────────────────────────────────────
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    // ── Cross-browser: functional core only ──────────────────────────────────
    // visual.spec.ts  — snapshots are browser-specific; Chromium baselines are canonical
    // performance.spec.ts — thresholds are tuned for Chrome's Performance API
    // chaos.spec.ts   — 30–60 s hanging mocks; running on 3 browsers triples CI time
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: [
        "**/visual.spec.ts",
        "**/performance.spec.ts",
        "**/chaos.spec.ts",
      ],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      timeout: 90_000,
      // Linux WebKit does not reliably fire React 19 onChange via Playwright's
      // fill() — the synthetic input event is lost before hydration completes.
      // Specs that rely on fill() are fully covered by the Chromium project.
      // WebKit retains navigation/metadata tests that do not require typed input.
      testIgnore: [
        "**/visual.spec.ts",
        "**/performance.spec.ts",
        "**/chaos.spec.ts",
        "**/chat.spec.ts",
        "**/components.spec.ts",
        "**/accessibility.spec.ts",
      ],
    },

    // ── Mobile responsive: core functional at real phone viewport ─────────────
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      testMatch: ["**/chat.spec.ts", "**/accessibility.spec.ts"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // Next.js first compile on CI can take 60-90 s
  },
});
