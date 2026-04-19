import { test, expect, type Page } from "@playwright/test";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
      body,
    });
  });
}

async function mockSlowChat(page: Page, reply: string, delayMs = 3_000) {
  await page.route("/api/chat", async (route) => {
    await new Promise((r) => setTimeout(r, delayMs));
    const chunks = reply.match(/[\s\S]{1,10}/g) ?? [reply];
    const body = chunks.map((c) => `0:${JSON.stringify(c)}\n`).join("");
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
      body,
    });
  });
}

/** Grants clipboard permissions and stubs writeText to resolve immediately. */
async function grantClipboard(page: Page) {
  try {
    // Chromium and Firefox support this; WebKit throws — the addInitScript stub below suffices
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  } catch {
    // ignored — clipboard is fully mocked below regardless
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.resolve() },
      writable: true,
      configurable: true,
    });
  });
}

// ── 1. Character Counter ──────────────────────────────────────────────────────

test.describe("Character Counter", () => {
  test("counter is NOT shown when input length is ≤ 400 chars", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByLabel("Message input").fill("a".repeat(400));
    // The counter span only renders when input.length > 400
    await expect(page.locator("text=100")).not.toBeVisible();
  });

  test("counter appears when input length exceeds 400 chars", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByLabel("Message input").fill("a".repeat(401));
    // 500 - 401 = 99 remaining
    await expect(page.locator("text=99")).toBeVisible();
  });

  test("counter shows correct remaining character count", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByLabel("Message input").fill("a".repeat(450));
    await expect(page.locator("text=50")).toBeVisible();
  });

  test("counter turns red when input exceeds 480 chars", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByLabel("Message input").fill("a".repeat(481));
    // The span should have the red class
    const counter = page.locator("span.text-red-400\\/70");
    await expect(counter).toBeVisible();
  });

  test("counter is white/dimmed (not red) between 401 and 480 chars", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByLabel("Message input").fill("a".repeat(440));
    // Red class should NOT be present
    await expect(page.locator("span.text-red-400\\/70")).not.toBeVisible();
    // But the counter itself is present
    await expect(page.locator("text=60")).toBeVisible();
  });
});

// ── 2. Enter Hint Visibility ──────────────────────────────────────────────────

test.describe("Enter Hint Visibility", () => {
  test("enter hint is hidden while the response is streaming", async ({ page }) => {
    await mockHealthOk(page);
    await mockSlowChat(page, "Logan is a QA Engineer.", 3_000);
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait until streaming starts (Stop button appears)
    await expect(page.getByRole("button", { name: /stop/i })).toBeVisible({ timeout: 5_000 });

    // Enter hint must not be rendered while loading
    await expect(page.locator("text=↵")).not.toBeVisible();
  });

  test("enter hint reappears after streaming completes", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait until loading finishes and input is cleared
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20_000 });
    // Input is empty after response → enter hint should return
    await expect(page.locator("text=↵")).toBeVisible();
  });
});

// ── 3. Copy Button Feedback ───────────────────────────────────────────────────

test.describe("Copy Button Feedback", () => {
  test("copy button aria-label changes to 'Copied!' immediately after click", async ({ page }) => {
    await grantClipboard(page);
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan has 16 years of experience.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Tell me about Logan");
    await page.getByRole("button", { name: "Send" }).click();

    const bubble = page.locator(".bubble-assistant").first();
    await expect(bubble).toBeVisible({ timeout: 20_000 });
    await bubble.hover();

    const copyBtn = page.getByRole("button", { name: "Copy message" });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  });

  test("copy button reverts to 'Copy message' after 2 seconds", async ({ page }) => {
    await grantClipboard(page);
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan has 16 years of experience.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Tell me about Logan");
    await page.getByRole("button", { name: "Send" }).click();

    const bubble = page.locator(".bubble-assistant").first();
    await expect(bubble).toBeVisible({ timeout: 20_000 });
    await bubble.hover();
    await page.getByRole("button", { name: "Copy message" }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

    // After the 2-second timeout the label should revert
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 3_500 });
  });
});

// ── 4. Health Indicator Tooltip ───────────────────────────────────────────────

test.describe("Health Indicator Tooltip Text", () => {
  test("tooltip reads 'Verifying connection…' while health check is in-flight", async ({ page }) => {
    await page.route("/api/health", async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      route.fulfill({ status: 200, body: JSON.stringify({ status: "ok" }) });
    });
    await page.goto("/");
    await expect(page.getByText("Verifying connection…")).toBeAttached();
  });

  test("tooltip reads 'API is responsive' when healthy", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByText("API is responsive")).toBeAttached();
  });

  test("tooltip reads 'API failed health check' when unhealthy", async ({ page }) => {
    await page.route("/api/health", (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ status: "error" }) })
    );
    await page.goto("/");
    await expect(page.getByText("API failed health check")).toBeAttached();
  });
});

// ── 5. Message Timestamp ──────────────────────────────────────────────────────

test.describe("Message Timestamp", () => {
  test("timestamp 'just now' is visible on hover within 5 seconds of sending", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    const userBubble = page.locator(".bubble-user").first();
    await expect(userBubble).toBeVisible();
    await userBubble.hover();

    // The timestamp span is opacity-0 until hover; after hover it should contain "just now"
    const timestampArea = userBubble.locator("..").locator("span.text-white\\/20");
    await expect(timestampArea).toContainText("just now");
  });

  test("assistant message also shows a timestamp on hover", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    const assistantBubble = page.locator(".bubble-assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 20_000 });
    await assistantBubble.hover();

    const timestampArea = assistantBubble.locator("..").locator("span.text-white\\/20");
    await expect(timestampArea).toContainText("just now");
  });
});

// ── 6. Input aria and maxLength ───────────────────────────────────────────────

test.describe("Input Attributes", () => {
  test("input has maxLength of 500", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    const input = page.getByLabel("Message input");
    await expect(input).toHaveAttribute("maxlength", "500");
  });

  test("input has aria-label 'Message input'", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByLabel("Message input")).toBeVisible();
  });
});
