/**
 * Visual Regression Tests
 *
 * Captures golden screenshots for each meaningful UI state and diffs against
 * them on every CI run. Snapshots live in tests/__snapshots__/visual/.
 *
 * States covered:
 *   1. Empty chat — desktop (1280 × 800)
 *   2. Empty chat — mobile (390 × 844)
 *   3. User message bubble — optimistic render before API responds
 *   4. Thinking indicator — "Logan is thinking…" dots
 *   5. Completed response — single assistant bubble
 *   6. Markdown response — rendered lists, bold, links
 *   7. Error state — red error card with Retry button
 *   8. Character counter — input at 450 / 500 chars
 *   9. Completed chat — mobile viewport
 *
 * Running:
 *   npx playwright test tests/visual.spec.ts              # compare
 *   npx playwright test tests/visual.spec.ts --update-snapshots  # regenerate
 */

import { test, expect, type Page } from "@playwright/test";

// ── Shared helpers ────────────────────────────────────────────────────────────

async function mockHealthOk(page: Page) {
  await page.route("/api/health", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ status: "ok" }) })
  );
}

async function mockChatResponse(page: Page, reply: string) {
  await page.route("/api/chat", (route) => {
    const chunks = reply.match(/[\s\S]{1,10}/g) ?? [reply];
    const body = chunks.map((c) => `0:${JSON.stringify(c)}\n`).join("");
    route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "x-vercel-ai-data-stream": "v1",
      },
      body,
    });
  });
}

async function mockChatError(page: Page) {
  await page.route("/api/chat", (route) =>
    route.fulfill({ status: 500, body: "Internal Server Error" })
  );
}

/** Hang the chat route forever so we can capture the thinking indicator. */
async function mockChatHanging(page: Page) {
  await page.route("/api/chat", () => {
    // intentionally never fulfilled — keeps isLoading=true
  });
}

/** Mask timestamp spans so dynamic "just now" text doesn't cause diff noise. */
const TIMESTAMP_MASK = (page: Page) => [page.locator(".group\\/msg .text-white\\/20")];

// ── 1 & 2. Empty chat ────────────────────────────────────────────────────────

test.describe("Empty chat — initial state", () => {
  test("desktop 1280×800", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockHealthOk(page);
    await page.goto("/");
    // Wait for health indicator to settle (green dot, no pulse)
    await expect(page.locator("span.bg-emerald-400")).toBeVisible();

    await expect(page).toHaveScreenshot("empty-desktop.png");
  });

  test("mobile 390×844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.locator("span.bg-emerald-400")).toBeVisible();

    await expect(page).toHaveScreenshot("empty-mobile.png");
  });
});

// ── 3. User message bubble ────────────────────────────────────────────────────

test.describe("User message bubble", () => {
  test("optimistic bubble renders before API responds", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatHanging(page);
    await page.goto("/");
    await expect(page.locator("span.bg-emerald-400")).toBeVisible();

    await page.getByLabel("Message input").fill("What is Logan's testing stack?");
    await page.getByRole("button", { name: "Send" }).click();

    // Optimistic user bubble must be visible before the API replies
    await expect(page.locator(".bubble-user").first()).toBeVisible();

    await expect(page).toHaveScreenshot("user-bubble.png", {
      mask: TIMESTAMP_MASK(page),
    });
  });
});

// ── 4. Thinking indicator ─────────────────────────────────────────────────────

test.describe("Thinking indicator", () => {
  test("'Logan is thinking…' dots visible during stream", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatHanging(page);
    await page.goto("/");
    await expect(page.locator("span.bg-emerald-400")).toBeVisible();

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Logan is thinking…")).toBeVisible();

    await expect(page).toHaveScreenshot("thinking-indicator.png", {
      mask: TIMESTAMP_MASK(page),
    });
  });
});

// ── 5. Completed response ─────────────────────────────────────────────────────

test.describe("Completed assistant response", () => {
  test("single assistant bubble with plain text", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(
      page,
      "Logan Tallman is a Senior QA Engineer with 16+ years of experience in test automation and CI/CD pipelines."
    );
    await page.goto("/");
    await expect(page.locator("span.bg-emerald-400")).toBeVisible();

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(".bubble-assistant").first()).toBeVisible();

    await expect(page).toHaveScreenshot("completed-response.png", {
      mask: TIMESTAMP_MASK(page),
    });
  });
});

// ── 6. Markdown response ──────────────────────────────────────────────────────

test.describe("Markdown response", () => {
  test("rendered lists, bold, and inline code", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(
      page,
      [
        "Logan's core testing stack includes:\n\n",
        "- **Playwright** — E2E browser automation\n",
        "- **Vitest** — unit and integration tests\n",
        "- **GitHub Actions** — CI/CD pipelines\n\n",
        "He also uses `k6` for load testing and `axe-core` for accessibility audits.",
      ].join("")
    );
    await page.goto("/");
    await expect(page.locator("span.bg-emerald-400")).toBeVisible();

    await page.getByLabel("Message input").fill("What is Logan's testing stack?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(".bubble-assistant").first()).toBeVisible();

    await expect(page).toHaveScreenshot("markdown-response.png", {
      mask: TIMESTAMP_MASK(page),
    });
  });
});

// ── 7. Error state ────────────────────────────────────────────────────────────

test.describe("Error state", () => {
  test("red error card with Retry button after 500 response", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatError(page);
    await page.goto("/");
    await expect(page.locator("span.bg-emerald-400")).toBeVisible();

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Retry")).toBeVisible();

    await expect(page).toHaveScreenshot("error-state.png", {
      mask: TIMESTAMP_MASK(page),
    });
  });
});

// ── 8. Character counter ──────────────────────────────────────────────────────

test.describe("Character counter", () => {
  test("counter appears and turns red when input is near limit", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.locator("span.bg-emerald-400")).toBeVisible();

    // Fill to 450 chars — counter appears but stays neutral
    await page.getByLabel("Message input").fill("a".repeat(450));
    // Counter at 50 remaining — white/25 colour
    await expect(page.getByLabel("Message input")).toHaveValue("a".repeat(450));

    await expect(page).toHaveScreenshot("char-counter-neutral.png");

    // Fill to 485 chars — counter turns red (> 480)
    await page.getByLabel("Message input").fill("a".repeat(485));
    await expect(page).toHaveScreenshot("char-counter-red.png");
  });
});

// ── 9. Completed chat — mobile ────────────────────────────────────────────────

test.describe("Completed chat — mobile", () => {
  test("user + assistant bubbles at 390px width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockHealthOk(page);
    await mockChatResponse(
      page,
      "Logan is a Senior QA Engineer specializing in test automation, CI/CD, and quality strategy."
    );
    await page.goto("/");
    await expect(page.locator("span.bg-emerald-400")).toBeVisible();

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(".bubble-assistant").first()).toBeVisible();

    await expect(page).toHaveScreenshot("completed-mobile.png", {
      mask: TIMESTAMP_MASK(page),
    });
  });
});
