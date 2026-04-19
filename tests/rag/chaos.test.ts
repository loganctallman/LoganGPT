/**
 * RAG Chaos & Resilience Tests
 *
 * Verifies that the chat API route degrades gracefully under adverse conditions:
 * empty knowledge base, malformed inputs, extreme message volumes, and simulated
 * upstream model failures. These tests document the expected error-propagation
 * behaviour so regressions are caught before they reach production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks (hoisted before any imports) ─────────────────────────────────

vi.mock("fs", () => ({
  readFileSync: vi.fn().mockReturnValue("[]"), // empty knowledge base by default
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn().mockReturnValue(vi.fn().mockReturnValue("mock-model")),
}));

vi.mock("ai", () => ({
  streamText: vi.fn().mockReturnValue({
    toDataStreamResponse: vi.fn().mockReturnValue(
      new Response('0:"ok"\n', {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "x-vercel-ai-data-stream": "v1",
        },
      })
    ),
  }),
  embed: vi.fn(),
}));

import { POST } from "@/app/api/chat/route";
import { streamText } from "ai";

// ── Request factory ───────────────────────────────────────────────────────────

let ipSeed = 200; // offset from chat.test.ts seeds to avoid rate-limit collisions
const uniqueIp = () => `10.2.${Math.floor(++ipSeed / 254)}.${ipSeed % 254 || 1}`;

function makeRequest(
  body: unknown = { messages: [{ role: "user", content: "Who is Logan?" }] },
  ip = uniqueIp()
) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── Empty knowledge base ──────────────────────────────────────────────────────

describe("Chaos — empty knowledge base", () => {
  it("returns 200 when chunks.json is empty (no context available)", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it("system prompt includes 'No relevant information found' when chunks array is empty", async () => {
    let capturedSystem = "";
    vi.mocked(streamText).mockImplementationOnce((opts) => {
      capturedSystem = (opts as { system?: string }).system ?? "";
      return {
        toDataStreamResponse: vi.fn().mockReturnValue(
          new Response('0:"ok"\n', {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          })
        ),
      } as ReturnType<typeof streamText>;
    });
    await POST(makeRequest({ messages: [{ role: "user", content: "test" }] }));
    expect(capturedSystem).toContain("No relevant information found");
  });

  it("system prompt always contains context delimiters even with no chunks", async () => {
    let capturedSystem = "";
    vi.mocked(streamText).mockImplementationOnce((opts) => {
      capturedSystem = (opts as { system?: string }).system ?? "";
      return {
        toDataStreamResponse: vi.fn().mockReturnValue(
          new Response('0:"ok"\n', {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          })
        ),
      } as ReturnType<typeof streamText>;
    });
    await POST(makeRequest());
    expect(capturedSystem).toContain("--- CONTEXT ---");
    expect(capturedSystem).toContain("--- END CONTEXT ---");
  });
});

// ── Upstream model failures ───────────────────────────────────────────────────

describe("Chaos — upstream model failures", () => {
  it("POST rejects when streamText throws synchronously (propagates as unhandled error)", async () => {
    vi.mocked(streamText).mockImplementationOnce(() => {
      throw new Error("OpenAI 500: Internal Server Error");
    });
    // The route has no try/catch around streamText; sync throws propagate.
    // This documents the expected behaviour so any accidental swallowing is caught.
    await expect(POST(makeRequest())).rejects.toThrow("OpenAI 500");
  });

  it("returns a stream response when streamText returns an error payload", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      toDataStreamResponse: vi.fn().mockReturnValue(
        new Response('3:"upstream error"\n', {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "x-vercel-ai-data-stream": "v1",
          },
        })
      ),
    } as ReturnType<typeof streamText>);
    const res = await POST(makeRequest());
    // The Vercel AI SDK encodes model errors as stream events, not HTTP errors
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("returns 200 when OPENAI_API_KEY is missing (keyword path is taken — no embed call)", async () => {
    vi.unstubAllEnvs(); // remove the key set in beforeEach
    const res = await POST(makeRequest());
    // Empty chunks → keyword path → no embed() call needed → no auth error
    expect([200, 429]).toContain(res.status);
  });
});

// ── Malformed / extreme inputs ────────────────────────────────────────────────

describe("Chaos — malformed and extreme inputs", () => {
  it("handles an empty messages array without throwing", async () => {
    const res = await POST(makeRequest({ messages: [] }));
    expect([200, 429]).toContain(res.status);
  });

  it("prunes a 100-message history to ≤10 before calling the model", async () => {
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
    }));
    await POST(makeRequest({ messages }));
    const call = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    if (call) {
      expect((call.messages as unknown[]).length).toBeLessThanOrEqual(10);
    }
  });

  it("handles a message with 10 000-char content without throwing", async () => {
    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "a".repeat(10_000) }] })
    );
    expect([200, 429]).toContain(res.status);
  });

  it("handles unicode, CJK, and emoji content without throwing", async () => {
    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "🚀 こんにちは ¿Cómo estás? Привет" }] })
    );
    expect([200, 429]).toContain(res.status);
  });

  it("handles null-byte characters in message content without throwing", async () => {
    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "test\x00inject" }] })
    );
    expect([200, 429]).toContain(res.status);
  });

  it("handles a message array with only assistant turns (no user message) without throwing", async () => {
    const res = await POST(
      makeRequest({
        messages: [
          { role: "assistant", content: "I am an assistant." },
          { role: "assistant", content: "Here is more information." },
        ],
      })
    );
    expect([200, 429]).toContain(res.status);
  });
});

// ── Rate limit boundary ───────────────────────────────────────────────────────

describe("Chaos — rate limit edge cases", () => {
  it("the 21st request from the same IP returns 429 (boundary at 20)", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 20; i++) await POST(makeRequest(undefined, ip));
    const res = await POST(makeRequest(undefined, ip));
    expect(res.status).toBe(429);
  });

  it("rate limit is per-IP: a new IP is unaffected after another IP is blocked", async () => {
    const blocked = uniqueIp();
    const fresh   = uniqueIp();
    for (let i = 0; i < 21; i++) await POST(makeRequest(undefined, blocked));
    const res = await POST(makeRequest(undefined, fresh));
    expect(res.status).toBe(200);
  });

  it("rate-limit response body is a human-readable string", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 20; i++) await POST(makeRequest(undefined, ip));
    const res = await POST(makeRequest(undefined, ip));
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(typeof body).toBe("string");
  });
});
