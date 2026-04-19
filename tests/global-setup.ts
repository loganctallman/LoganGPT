/**
 * Playwright global setup — runs once before any test, after the webServer starts.
 *
 * In CI the Next.js dev server compiles on first request (cold start can take
 * 20-30 s). Without this warm-up, the first few tests call fill() before
 * React has hydrated, onChange never fires, and the Send button stays disabled.
 *
 * This pre-warms the server so every subsequent test gets a fully compiled,
 * hydrated page on the very first page.goto().
 */

import { chromium, type FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    (config.projects[0]?.use as { baseURL?: string })?.baseURL ??
    "http://localhost:3000";

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(baseURL, { waitUntil: "networkidle", timeout: 60_000 });
  } catch {
    // Best-effort — if this fails the individual tests will handle it
  } finally {
    await browser.close();
  }
}
