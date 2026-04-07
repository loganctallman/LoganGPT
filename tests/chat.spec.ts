import { test, expect, type Page } from "@playwright/test";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Mock /api/health to return a healthy response. */
async function mockHealthOk(page: Page) {
  await page.route("/api/health", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ status: "ok" }) })
  );
}

/** Mock /api/health to return an error. */
async function mockHealthError(page: Page) {
  await page.route("/api/health", (route) =>
    route.fulfill({ status: 500, body: JSON.stringify({ status: "error" }) })
  );
}

/**
 * Mock /api/chat to return a streaming AI SDK data-stream response.
 * The AI SDK useChat hook expects the data-stream format:
 *   0:"token"\n  for text chunks
 */
async function mockChatResponse(page: Page, reply: string) {
  await page.route("/api/chat", (route) => {
    // Encode as AI SDK data-stream protocol (text part type "0:")
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

/** Mock /api/chat to return a network error. */
async function mockChatError(page: Page) {
  await page.route("/api/chat", (route) => route.abort("failed"));
}

/** Mock /api/chat with a delay so streaming state can be observed. */
async function mockSlowChat(page: Page, reply: string, delayMs = 2500) {
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

/** Mock /api/chat to return a 429 rate limit response. */
async function mockRateLimit(page: Page) {
  await page.route("/api/chat", (route) =>
    route.fulfill({ status: 429, body: "Too many requests. Please slow down." })
  );
}

// ── 1. Layout & Header ─────────────────────────────────────────────────────────

test.describe("Layout & Header", () => {
  test("renders title and tagline", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "LoganGPT" })).toBeVisible();
    await expect(page.getByText("Ask anything about Logan")).toBeVisible();
  });

  test("resume link opens correct URL in new tab", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    const resumeLink = page.getByRole("link", { name: /resume/i });
    await expect(resumeLink).toHaveAttribute("target", "_blank");
    await expect(resumeLink).toHaveAttribute(
      "href",
      /drive\.google\.com/
    );
  });

  test("Portfolio link opens correct URL in new tab", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    const portfolioLink = page.getByRole("link", { name: /portfolio/i });
    await expect(portfolioLink).toHaveAttribute("target", "_blank");
    await expect(portfolioLink).toHaveAttribute("href", /loganctallman\.vercel\.app/);
  });

  test("clear chat button is hidden on initial load", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /clear chat/i })).not.toBeVisible();
  });
});

// ── 2. Health Indicator ────────────────────────────────────────────────────────

test.describe("Health Indicator", () => {
  test("shows green dot when API is healthy", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    const dot = page.locator(".bg-emerald-400");
    await expect(dot).toBeVisible();
  });

  test("shows red dot when API is unhealthy", async ({ page }) => {
    await mockHealthError(page);
    await page.goto("/");
    const dot = page.locator(".bg-red-400");
    await expect(dot).toBeVisible();
  });

  test("shows yellow dot while checking (on load)", async ({ page }) => {
    // Delay the health response so we can catch the checking state
    await page.route("/api/health", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      route.fulfill({ status: 200, body: JSON.stringify({ status: "ok" }) });
    });
    await page.goto("/");
    const dot = page.locator(".bg-yellow-400");
    await expect(dot).toBeVisible();
  });
});

// ── 3. Empty State ─────────────────────────────────────────────────────────────

test.describe("Empty State", () => {
  test("shows hint text and chat icon", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(
      page.getByText("Ask about Logan's background, skills, or experience")
    ).toBeVisible();
    await expect(page.getByText("💬")).toBeVisible();
  });

  test("renders all four suggested prompt chips", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "What's Logan's testing stack?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tell me about his side projects" })).toBeVisible();
    await expect(page.getByRole("button", { name: "What makes Logan a strong QA lead?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tell me about Logan's resume." })).toBeVisible();
  });

  test("empty state disappears after a message is sent", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan has 16+ years of QA experience.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Tell me about Logan");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Ask about Logan's background")).not.toBeVisible();
  });
});

// ── 4. Input Bar ───────────────────────────────────────────────────────────────

test.describe("Input Bar", () => {
  test("send button is disabled when input is empty", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("send button enables when text is entered", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByLabel("Message input").fill("Hello");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  test("send button disables again after clearing input", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    const input = page.getByLabel("Message input");
    await input.fill("Hello");
    await input.clear();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("shows enter hint when input is empty", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.locator("text=↵")).toBeVisible();
  });

  test("hides enter hint when input has text", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByLabel("Message input").fill("Hi");
    await expect(page.locator("text=↵")).not.toBeVisible();
  });

  test("enforces 500 character max length", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    const input = page.getByLabel("Message input");
    await input.fill("a".repeat(600));
    const value = await input.inputValue();
    expect(value.length).toBeLessThanOrEqual(500);
  });

  test("shows character counter when near the limit", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByLabel("Message input").fill("a".repeat(450));
    await expect(page.locator("text=50")).toBeVisible();
  });
});

// ── 5. Messaging Flow ──────────────────────────────────────────────────────────

test.describe("Messaging Flow", () => {
  test("user message appears right-aligned after submit", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a Senior QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    const userMsg = page.locator(".bubble-user").first();
    await expect(userMsg).toBeVisible();
    await expect(userMsg).toContainText("Who is Logan?");
  });

  test("assistant response appears after user message", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a Senior QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
  });

  test("input is cleared after sending a message", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a Senior QA Engineer.");
    await page.goto("/");

    const input = page.getByLabel("Message input");
    await input.fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(input).toHaveValue("");
  });

  test("can submit message with Enter key", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a Senior QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.keyboard.press("Enter");

    await expect(page.locator(".bubble-user").first()).toBeVisible();
  });

  test("clicking a suggested prompt sends it as a message", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan's testing stack includes Playwright.");
    await page.goto("/");

    await page.getByRole("button", { name: "What's Logan's testing stack?" }).click();

    const userMsg = page.locator(".bubble-user").first();
    await expect(userMsg).toBeVisible();
    await expect(userMsg).toContainText("What's Logan's testing stack?");
  });

  test("stop button appears while response is streaming", async ({ page }) => {
    await mockHealthOk(page);
    // Slow stream so we can see the stop button
    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 2_000));
      const body = `0:${JSON.stringify("Logan is a QA Engineer.")}\n`;
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body,
      });
    });
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: /stop/i })).toBeVisible({ timeout: 5_000 });
  });

  test("'Logan is thinking…' indicator appears during loading", async ({ page }) => {
    await mockHealthOk(page);
    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 1_500));
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body: `0:${JSON.stringify("Hello")}\n`,
      });
    });
    await page.goto("/");

    await page.getByLabel("Message input").fill("Hi");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Logan is thinking…")).toBeVisible({ timeout: 5_000 });
  });
});

// ── 6. Clear Chat ──────────────────────────────────────────────────────────────

test.describe("Clear Chat", () => {
  test("clear chat button appears after a message is sent", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Hi");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".bubble-user").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /clear chat/i })).toBeVisible();
  });

  test("clear chat removes all messages and restores empty state", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Hi");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-user").first()).toBeVisible();

    await page.getByRole("button", { name: /clear chat/i }).click();

    await expect(page.locator(".bubble-user")).toHaveCount(0);
    await expect(page.getByText("Ask about Logan's background")).toBeVisible();
  });
});

// ── 7. Copy Button ─────────────────────────────────────────────────────────────

test.describe("Copy Button", () => {
  test("copy button is accessible on assistant messages", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan has 16 years of experience.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Tell me about Logan");
    await page.getByRole("button", { name: "Send" }).click();

    const assistantBubble = page.locator(".bubble-assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 10_000 });

    // Hover to reveal copy button
    await assistantBubble.hover();
    const copyBtn = page.getByRole("button", { name: /copy/i });
    await expect(copyBtn).toBeVisible();
  });
});

// ── 8. Error State ─────────────────────────────────────────────────────────────

test.describe("Error State", () => {
  test("shows error message with retry button on API failure", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatError(page);
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});

// ── 9. Accessibility ───────────────────────────────────────────────────────────

test.describe("Accessibility", () => {
  test("messages container has role=log and aria-live", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    const log = page.getByRole("log");
    await expect(log).toBeVisible();
    await expect(log).toHaveAttribute("aria-live", "polite");
  });

  test("input has accessible label", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByLabel("Message input")).toBeVisible();
  });

  test("resume link has aria-label", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /view logan's resume/i })
    ).toBeVisible();
  });

  test("Portfolio link has aria-label", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /view logan's portfolio/i })
    ).toBeVisible();
  });
});

// ── 10. Multi-turn Conversation ────────────────────────────────────────────────

test.describe("Multi-turn Conversation", () => {
  test("second message can be sent after first response", async ({ page }) => {
    await mockHealthOk(page);
    let calls = 0;
    await page.route("/api/chat", (route) => {
      calls++;
      const reply = calls === 1 ? "I am Logan, a QA Engineer." : "I have worked at Extreme Reach.";
      const body = (reply.match(/.{1,10}/g) ?? [reply]).map((c) => `0:${JSON.stringify(c)}\n`).join("");
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body,
      });
    });
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });

    await page.getByLabel("Message input").fill("Where has he worked?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-assistant").nth(1)).toBeVisible({ timeout: 10_000 });
  });

  test("all messages remain visible in conversation history", async ({ page }) => {
    await mockHealthOk(page);
    let calls = 0;
    await page.route("/api/chat", (route) => {
      calls++;
      const reply = calls === 1 ? "I am Logan." : "I worked at Extreme Reach.";
      const body = (reply.match(/.{1,10}/g) ?? [reply]).map((c) => `0:${JSON.stringify(c)}\n`).join("");
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body,
      });
    });
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });

    await page.getByLabel("Message input").fill("Where has he worked?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-assistant").nth(1)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });

    await expect(page.locator(".bubble-user")).toHaveCount(2);
    await expect(page.locator(".bubble-assistant")).toHaveCount(2);
  });
});

// ── 11. Stop Streaming ─────────────────────────────────────────────────────────

test.describe("Stop Streaming", () => {
  test("clicking stop returns the Send button", async ({ page }) => {
    await mockHealthOk(page);
    await mockSlowChat(page, "Logan is a Senior QA Engineer.", 5_000);
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: /stop/i })).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /stop/i }).click();

    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 5_000 });
  });

  test("clicking stop dismisses the typing indicator", async ({ page }) => {
    await mockHealthOk(page);
    await mockSlowChat(page, "Logan is a Senior QA Engineer.", 5_000);
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Logan is thinking…")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /stop/i }).click();

    await expect(page.getByText("Logan is thinking…")).not.toBeVisible();
  });
});

// ── 12. Retry ─────────────────────────────────────────────────────────────────

test.describe("Retry", () => {
  test("clicking retry fires a new request and shows a response", async ({ page }) => {
    await mockHealthOk(page);
    let calls = 0;
    await page.route("/api/chat", (route) => {
      calls++;
      if (calls === 1) {
        route.abort("failed");
      } else {
        const body = `0:${JSON.stringify("Logan is a QA Engineer.")}\n`;
        route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
          body,
        });
      }
    });
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /retry/i }).click();
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 13. Input State During Loading ────────────────────────────────────────────

test.describe("Input State During Loading", () => {
  test("input is disabled while response is streaming", async ({ page }) => {
    await mockHealthOk(page);
    await mockSlowChat(page, "Logan is a QA Engineer.", 2_500);
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: /stop/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel("Message input")).toBeDisabled();
  });

  test("input re-enables after response completes", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Message input")).toBeEnabled();
  });
});

// ── 14. Whitespace Input ──────────────────────────────────────────────────────

test.describe("Whitespace Input", () => {
  test("whitespace-only input keeps Send button disabled", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByLabel("Message input").fill("     ");
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

// ── 15. Markdown Rendering ────────────────────────────────────────────────────

test.describe("Markdown Rendering", () => {
  test("bold text renders as a <strong> element", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a **Senior QA Engineer** with 16 years of experience.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for stream to complete
    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });
    const strong = page.locator(".bubble-assistant strong").first();
    await expect(strong).toBeVisible();
    await expect(strong).toContainText("Senior QA Engineer");
  });

  test("list items render as <li> elements", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Skills:\n\n- Playwright\n- TestRail\n- Jira");
    await page.goto("/");

    await page.getByLabel("Message input").fill("What are Logan's skills?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".bubble-assistant li").first()).toBeVisible();
  });

  test("inline code renders as a <code> element", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan uses `Playwright` for automation testing.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("What does Logan use for testing?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });
    const code = page.locator(".bubble-assistant code").first();
    await expect(code).toBeVisible();
    await expect(code).toContainText("Playwright");
  });
});

// ── 16. Copy Button on User Messages ─────────────────────────────────────────

test.describe("Copy Button on User Messages", () => {
  test("copy button does not appear when hovering a user message", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    const userBubble = page.locator(".bubble-user").first();
    await expect(userBubble).toBeVisible();
    await userBubble.hover();

    // The copy button should not exist in or near the user bubble
    const userMsgContainer = userBubble.locator("..");
    await expect(userMsgContainer.getByRole("button", { name: /copy/i })).not.toBeVisible();
  });
});

// ── 17. Error State Clears ────────────────────────────────────────────────────

test.describe("Error State Clears", () => {
  test("error disappears when a subsequent message succeeds", async ({ page }) => {
    await mockHealthOk(page);
    let calls = 0;
    await page.route("/api/chat", (route) => {
      calls++;
      if (calls === 1) {
        route.abort("failed");
      } else {
        const body = `0:${JSON.stringify("Logan is a QA Engineer.")}\n`;
        route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
          body,
        });
      }
    });
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("Message input").fill("Try again");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Something went wrong.")).not.toBeVisible();
  });
});

// ── 18. Input Focus ───────────────────────────────────────────────────────────

test.describe("Input Focus", () => {
  test("input refocuses after response completes", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a QA Engineer.");
    await page.goto("/");

    // Move focus away from the input
    await page.getByRole("heading", { name: "LoganGPT" }).click();

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for response to complete
    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Message input")).toBeFocused();
  });
});

// ── 19. Health Tooltip ────────────────────────────────────────────────────────

test.describe("Health Tooltip", () => {
  test("tooltip shows correct text when API is healthy", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByText("API is responsive")).toBeAttached();
  });

  test("tooltip shows correct text when API is unhealthy", async ({ page }) => {
    await mockHealthError(page);
    await page.goto("/");
    await expect(page.getByText("API failed health check")).toBeAttached();
  });
});

// ── 20. Rate Limiting ─────────────────────────────────────────────────────────

test.describe("Rate Limiting", () => {
  test("429 response triggers error state", async ({ page }) => {
    await mockHealthOk(page);
    await mockRateLimit(page);
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 10_000 });
  });
});

// ── 21. Page Metadata ─────────────────────────────────────────────────────────

test.describe("Page Metadata", () => {
  test("page has the correct title", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/LoganGPT/);
  });
});

// ── 22. Mobile Viewport ───────────────────────────────────────────────────────

test.describe("Mobile Viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("key elements are visible on mobile", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "LoganGPT" })).toBeVisible();
    await expect(page.getByLabel("Message input")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });

  test("suggested prompt chips are visible on mobile", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "What's Logan's testing stack?" })).toBeVisible();
  });

  test("full chat flow works on mobile", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatResponse(page, "Logan is a Senior QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".bubble-user").first()).toBeVisible();
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
  });
});
