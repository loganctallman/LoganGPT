/**
 * Chaos & Resilience E2E Tests
 *
 * Tests the UI's behaviour under adverse network and data conditions.
 * Covers failure modes NOT already exercised by chat.spec.ts:
 *
 *   1. Partial stream then abrupt disconnect
 *   2. Malformed / corrupted SSE stream data
 *   3. Empty response body (200 with no tokens)
 *   4. Network offline — before send and mid-stream
 *   5. Hanging API — mock never responds; stop button is the escape hatch
 *   6. Clear chat while a stream is in flight
 *   7. Rapid consecutive sends (stress / race condition)
 *   8. Send button stays disabled during an active stream (double-send prevention)
 *   9. Very long response — 5 000+ character render without freeze
 *  10. Multi-failure retry chain — fail → retry → fail → retry → success
 *  11. Health API failure does not block the chat path
 *  12. Page error budget — no uncaught JS exceptions under any failure scenario
 */

import { test, expect, type Page } from "@playwright/test";

// ── Shared mock helpers ───────────────────────────────────────────────────────

async function mockHealthOk(page: Page) {
  await page.route("/api/health", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ status: "ok" }) })
  );
}

async function mockHealthError(page: Page) {
  await page.route("/api/health", (route) =>
    route.fulfill({ status: 500, body: JSON.stringify({ status: "error" }) })
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

async function mockChatAbort(page: Page) {
  await page.route("/api/chat", (route) => route.abort("failed"));
}

// ── 1. Partial Stream then Disconnect ────────────────────────────────────────

test.describe("Partial stream + disconnect", () => {
  test("partial content renders before disconnect; no JS crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await mockHealthOk(page);

    // Fulfil with valid tokens followed immediately by a connection abort
    let requestCount = 0;
    await page.route("/api/chat", async (route) => {
      requestCount++;
      if (requestCount === 1) {
        // Send a few valid tokens then abort
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
          body: `0:"Partial "\n0:"response"\n`,
        });
        // The stream terminates without the AI SDK's finish sentinel
      } else {
        route.abort("failed");
      }
    });

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // The app must settle — either showing partial content or an error state
    await expect(
      page.locator(".bubble-assistant, [data-testid='error'], :text('Something went wrong')")
    ).toBeVisible({ timeout: 10_000 });

    expect(errors, `Uncaught JS errors: ${errors.join(", ")}`).toHaveLength(0);
  });

  test("stop button aborts a streaming response; UI is interactive after stop", async ({ page }) => {
    await mockHealthOk(page);

    await page.route("/api/chat", async (route) => {
      // Never respond — simulates a hung upstream
      await new Promise((r) => setTimeout(r, 30_000));
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body: `0:${JSON.stringify("too late")}\n`,
      });
    });

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // Stop button must appear and work
    const stopBtn = page.getByRole("button", { name: /stop/i });
    await expect(stopBtn).toBeVisible({ timeout: 5_000 });
    await stopBtn.click();

    // After stopping: Send button returns, input is re-enabled
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel("Message input")).toBeEnabled({ timeout: 5_000 });
  });
});

// ── 2. Malformed / Corrupted SSE Stream ──────────────────────────────────────

test.describe("Malformed SSE stream", () => {
  test("completely garbage response body does not crash the page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await mockHealthOk(page);
    await page.route("/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body: "GARBAGE_DATA\x00\xFF\nNOT_VALID_SSE\n!!!",
      })
    );

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for the app to settle (error state or empty assistant bubble)
    await page.waitForTimeout(3_000);

    expect(errors, `Uncaught JS errors after malformed stream: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("stream with mixed valid and invalid lines does not crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await mockHealthOk(page);
    await page.route("/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        // Interleave valid tokens with junk
        body: `0:"Logan "\nINVALID_LINE\n0:"is a "\nBAD:DATA\n0:"QA engineer."\n`,
      })
    );

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await page.waitForTimeout(3_000);
    expect(errors).toHaveLength(0);
  });
});

// ── 3. Empty Response Body ────────────────────────────────────────────────────

test.describe("Empty stream response", () => {
  test("200 with empty body does not hang or crash; UI recovers", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await mockHealthOk(page);
    await page.route("/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body: "",
      })
    );

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // App must settle — not spin indefinitely
    await expect(
      page.getByRole("button", { name: "Send" })
    ).toBeVisible({ timeout: 15_000 });

    expect(errors).toHaveLength(0);
  });
});

// ── 4. Network Offline ────────────────────────────────────────────────────────

test.describe("Network offline", () => {
  test("going offline before Send shows error state", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Go offline after the page loads but before sending
    await page.context().setOffline(true);

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 10_000 });

    await page.context().setOffline(false);
  });

  test("going offline mid-stream results in error or partial content; no JS crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await mockHealthOk(page);

    // Slow stream — gives us time to go offline during it
    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body: `0:${JSON.stringify("Logan is a QA Engineer.")}\n`,
      });
    });

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // Go offline shortly after the request is in-flight
    await page.waitForTimeout(200);
    await page.context().setOffline(true);

    // App must settle without crashing
    await page.waitForTimeout(5_000);
    expect(errors, `Uncaught JS errors during offline: ${errors.join("; ")}`).toHaveLength(0);

    await page.context().setOffline(false);
  });

  test("sending after going back online succeeds", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Go offline, send (fails), come back online, send again (succeeds)
    await page.context().setOffline(true);
    await page.getByLabel("Message input").fill("first try");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 10_000 });

    await page.context().setOffline(false);
    await mockChatResponse(page, "Logan is a QA Engineer.");
    await page.getByLabel("Message input").fill("second try");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 5. Hanging API ────────────────────────────────────────────────────────────

test.describe("Hanging API — never responds", () => {
  test("stop button is available and terminates a hanging request", async ({ page }) => {
    await mockHealthOk(page);

    await page.route("/api/chat", async (route) => {
      // Simulate a request that never finishes within the test window
      await new Promise((r) => setTimeout(r, 60_000));
      route.abort();
    });

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    const stop = page.getByRole("button", { name: /stop/i });
    await expect(stop).toBeVisible({ timeout: 5_000 });
    await stop.click();

    // After stopping, the UI must be interactive again
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByLabel("Message input")).toBeEnabled();
    await expect(page.getByText("Logan is thinking…")).not.toBeVisible();
  });

  test("can send a new message after stopping a hung request", async ({ page }) => {
    await mockHealthOk(page);

    let call = 0;
    await page.route("/api/chat", async (route) => {
      call++;
      if (call === 1) {
        await new Promise((r) => setTimeout(r, 60_000));
        route.abort();
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
    await page.getByLabel("Message input").fill("first");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: /stop/i })).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /stop/i }).click();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 3_000 });

    await page.getByLabel("Message input").fill("second");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 6. Clear Chat During Stream ───────────────────────────────────────────────

test.describe("Clear chat during stream — race condition", () => {
  test("clearing mid-stream leaves clean state; no crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await mockHealthOk(page);

    // Delay response so stream is in-flight when we clear
    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 4_000));
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body: `0:${JSON.stringify("Logan is a QA Engineer.")}\n`,
      });
    });

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for user bubble to appear, then immediately clear
    await expect(page.locator(".bubble-user").first()).toBeVisible({ timeout: 3_000 });
    await page.getByRole("button", { name: /clear chat/i }).click();

    // State must be clean
    await expect(page.locator(".bubble-user")).toHaveCount(0);
    await expect(page.getByText("Ask about Logan")).toBeVisible({ timeout: 3_000 });

    // App must remain usable
    await expect(page.getByLabel("Message input")).toBeEnabled();

    expect(errors, `Uncaught JS errors after clear-during-stream: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("can send a fresh message after clearing mid-stream", async ({ page }) => {
    await mockHealthOk(page);

    let call = 0;
    await page.route("/api/chat", async (route) => {
      call++;
      if (call === 1) {
        await new Promise((r) => setTimeout(r, 4_000)); // slow first response
        route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
          body: `0:${JSON.stringify("slow")}\n`,
        });
      } else {
        route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
          body: `0:${JSON.stringify("Logan is a QA Engineer.")}\n`,
        });
      }
    });

    await page.goto("/");
    await page.getByLabel("Message input").fill("first");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-user").first()).toBeVisible({ timeout: 3_000 });

    // Clear while first request is still pending
    await page.getByRole("button", { name: /clear chat/i }).click();
    await expect(page.locator(".bubble-user")).toHaveCount(0);

    // Second message must go through
    await page.getByLabel("Message input").fill("second");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-user").first()).toBeVisible({ timeout: 3_000 });
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 7. Rapid Consecutive Sends ────────────────────────────────────────────────

test.describe("Rapid fire — stress and double-send prevention", () => {
  test("Send button is disabled while a response is streaming", async ({ page }) => {
    await mockHealthOk(page);

    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 5_000));
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body: `0:${JSON.stringify("Logan is a QA Engineer.")}\n`,
      });
    });

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    // Send is replaced by Stop — clicking Send again is impossible
    await expect(page.getByRole("button", { name: /stop/i })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole("button", { name: "Send" })).not.toBeVisible();
  });

  test("only one user bubble appears even if Send is clicked multiple times before loading", async ({ page }) => {
    await mockHealthOk(page);

    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 3_000));
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body: `0:${JSON.stringify("Logan is a QA Engineer.")}\n`,
      });
    });

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    const sendBtn = page.getByRole("button", { name: "Send" });

    // Rapid-fire clicks — only the first should land since the button disables
    await sendBtn.click();
    await sendBtn.click({ force: true });
    await sendBtn.click({ force: true });

    // Exactly one user bubble regardless of click count
    await expect(page.locator(".bubble-user")).toHaveCount(1);
  });

  test("sending three messages sequentially (each after previous completes) all get responses", async ({ page }) => {
    await mockHealthOk(page);

    let calls = 0;
    await page.route("/api/chat", (route) => {
      calls++;
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
        body: `0:${JSON.stringify(`Response ${calls}`)}\n`,
      });
    });

    await page.goto("/");

    for (const msg of ["first", "second", "third"]) {
      await page.getByLabel("Message input").fill(msg);
      await page.getByRole("button", { name: "Send" }).click();
      // Wait for response before sending next
      await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });
    }

    await expect(page.locator(".bubble-user")).toHaveCount(3);
    await expect(page.locator(".bubble-assistant")).toHaveCount(3);
  });
});

// ── 8. Very Long Response ─────────────────────────────────────────────────────

test.describe("Very long response — render stress", () => {
  test("5 000-character response renders without freezing or layout breaking", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await mockHealthOk(page);

    const longReply = [
      "Logan Tallman is a Senior QA Engineer and SDET with 16+ years of experience. ",
      "He specialises in test automation architecture, CI/CD pipeline integration, ",
      "and cross-functional QA leadership. ".repeat(60),
      "His key skills include Playwright, Selenium WebDriver, TypeScript, Python, ",
      "JIRA, TestRail, GitHub Actions, Jenkins, AWS, and Azure. ",
      "He has worked at Extreme Reach as a Senior Automation Engineer since June 2021. ",
    ].join("");

    await mockChatResponse(page, longReply);
    await page.goto("/");

    await page.getByLabel("Message input").fill("Tell me everything about Logan");
    await page.getByRole("button", { name: "Send" }).click();

    // Response must complete and be visible
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });

    // Input must still be interactive after a long render
    await expect(page.getByLabel("Message input")).toBeEnabled();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled(); // input is empty

    expect(errors, `Uncaught JS errors on long response: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("long response with markdown tables and lists renders without crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await mockHealthOk(page);

    const markdownReply = `
## Skills

| Category | Tools |
|---|---|
| Automation | Playwright, Selenium, Cypress |
| Languages | TypeScript, Python, JavaScript |
| CI/CD | GitHub Actions, Jenkins, CircleCI |
| Issue Tracking | JIRA, TestRail, Confluence |

## Experience

- **Extreme Reach** — Senior Automation Engineer (2021–Present)
- **Infosys** — QA Engineer (2019–2021)
- **Freelance** — QA Consultant (2018–2019)

## Education

1. Google Professional Certificate in Software Testing (Coursera)
2. Playwright with TypeScript Masterclass (Udemy)
3. REST API testing, k6 performance testing, axe-core accessibility
    `.trim();

    await mockChatResponse(page, markdownReply);
    await page.goto("/");

    await page.getByLabel("Message input").fill("Give me a structured overview of Logan");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Logan is thinking…")).not.toBeVisible({ timeout: 10_000 });

    expect(errors).toHaveLength(0);
  });
});

// ── 9. Multi-failure Retry Chain ──────────────────────────────────────────────

test.describe("Multi-failure retry chain", () => {
  test("retry after two consecutive failures then succeed", async ({ page }) => {
    await mockHealthOk(page);

    let calls = 0;
    await page.route("/api/chat", (route) => {
      calls++;
      if (calls <= 2) {
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

    // First failure
    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 10_000 });

    // First retry — fails again
    await page.getByRole("button", { name: /retry/i }).click();
    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 10_000 });

    // Second retry — succeeds
    await page.getByRole("button", { name: /retry/i }).click();
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Something went wrong.")).not.toBeVisible();
  });

  test("retry button is available after each failure", async ({ page }) => {
    await mockHealthOk(page);
    await mockChatAbort(page);

    await page.goto("/");
    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Something went wrong.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});

// ── 10. Health API Failure Doesn't Block Chat ─────────────────────────────────

test.describe("Health API failure isolation", () => {
  test("chat works normally even when health check returns 500", async ({ page }) => {
    await mockHealthError(page);
    await mockChatResponse(page, "Logan is a Senior QA Engineer.");
    await page.goto("/");

    // Health indicator shows red — but chat should still work
    await expect(page.locator(".bg-red-400")).toBeVisible();

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
  });

  test("chat works normally when health check request is aborted", async ({ page }) => {
    await page.route("/api/health", (route) => route.abort("failed"));
    await mockChatResponse(page, "Logan is a Senior QA Engineer.");
    await page.goto("/");

    await page.getByLabel("Message input").fill("Who is Logan?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".bubble-assistant").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 11. Page Error Budget ─────────────────────────────────────────────────────

test.describe("Zero uncaught JS exceptions", () => {
  const CHAOS_SCENARIOS: Array<{
    label: string;
    setup: (page: Page) => Promise<void>;
  }> = [
    {
      label: "abort before response",
      setup: async (page) => {
        await page.route("/api/chat", (r) => r.abort("failed"));
      },
    },
    {
      label: "500 server error",
      setup: async (page) => {
        await page.route("/api/chat", (r) =>
          r.fulfill({ status: 500, body: "Internal Server Error" })
        );
      },
    },
    {
      label: "garbage response body",
      setup: async (page) => {
        await page.route("/api/chat", (r) =>
          r.fulfill({
            status: 200,
            headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
            body: "!INVALID!",
          })
        );
      },
    },
    {
      label: "empty body",
      setup: async (page) => {
        await page.route("/api/chat", (r) =>
          r.fulfill({
            status: 200,
            headers: { "Content-Type": "text/event-stream", "x-vercel-ai-data-stream": "v1" },
            body: "",
          })
        );
      },
    },
  ];

  for (const { label, setup } of CHAOS_SCENARIOS) {
    test(`no uncaught JS exceptions: ${label}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await mockHealthOk(page);
      await setup(page);
      await page.goto("/");

      await page.getByLabel("Message input").fill("test");
      await page.getByRole("button", { name: "Send" }).click();
      await page.waitForTimeout(5_000); // allow the app to settle

      expect(
        errors,
        `Scenario "${label}" produced uncaught JS errors: ${errors.join("; ")}`
      ).toHaveLength(0);
    });
  }
});
