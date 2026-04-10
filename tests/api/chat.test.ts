import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

// fs: make module-level chunk loading return an empty array
vi.mock("fs", () => ({
  readFileSync: vi.fn().mockReturnValue("[]"),
}));

// ai: stub streamText so no real OpenAI call is made
vi.mock("ai", () => ({
  streamText: vi.fn().mockReturnValue({
    toDataStreamResponse: vi.fn().mockReturnValue(
      new Response('0:"hello"\n', {
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

// @ai-sdk/openai: stub createOpenAI so no real client is instantiated
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn().mockReturnValue(vi.fn().mockReturnValue("mock-model")),
}));

import { POST } from "@/app/api/chat/route";
import { RATE_LIMIT } from "@/lib/rate-limit";

// ── Helpers ───────────────────────────────────────────────────────────────────

function chatRequest(ip: string, messages = [{ role: "user", content: "Who is Logan?" }]) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      "content-type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });
}

// Unique IP per test block to avoid cross-test rate-limit state bleeding
let ipSeed = 0;
const uniqueIp = () => `10.0.${Math.floor(++ipSeed / 254)}.${ipSeed % 254 || 1}`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/api/chat POST", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── Response schema ─────────────────────────────────────────────────────────

  describe("response schema", () => {
    it("returns 200 for a valid request", async () => {
      const res = await POST(chatRequest(uniqueIp()));
      expect(res.status).toBe(200);
    });

    it("sets Content-Type to text/event-stream", async () => {
      const res = await POST(chatRequest(uniqueIp()));
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    });

    it("includes the x-vercel-ai-data-stream header", async () => {
      const res = await POST(chatRequest(uniqueIp()));
      expect(res.headers.get("x-vercel-ai-data-stream")).toBe("v1");
    });

    it("accepts a multi-turn messages array", async () => {
      const messages = [
        { role: "user",      content: "Who is Logan?" },
        { role: "assistant", content: "Logan is a QA Engineer." },
        { role: "user",      content: "Where does he work?" },
      ];
      const res = await POST(chatRequest(uniqueIp(), messages));
      expect(res.status).toBe(200);
    });

    it("prunes to the last 10 messages before calling the model", async () => {
      const { streamText } = await import("ai");
      const messages = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `message ${i}`,
      }));
      await POST(chatRequest(uniqueIp(), messages));
      const call = vi.mocked(streamText).mock.calls.at(-1)![0];
      expect((call.messages as unknown[]).length).toBeLessThanOrEqual(10);
    });
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it(`allows the first ${RATE_LIMIT} requests from the same IP`, async () => {
      const ip = uniqueIp();
      for (let i = 0; i < RATE_LIMIT; i++) {
        const res = await POST(chatRequest(ip));
        expect(res.status).toBe(200);
      }
    });

    it(`returns 429 on request ${RATE_LIMIT + 1} from the same IP`, async () => {
      const ip = uniqueIp();
      for (let i = 0; i < RATE_LIMIT; i++) await POST(chatRequest(ip));
      const res = await POST(chatRequest(ip));
      expect(res.status).toBe(429);
    });

    it('rate-limit response body contains "Too many requests"', async () => {
      const ip = uniqueIp();
      for (let i = 0; i < RATE_LIMIT; i++) await POST(chatRequest(ip));
      const res = await POST(chatRequest(ip));
      expect(await res.text()).toMatch(/too many requests/i);
    });

    it("a different IP is not affected by another IP being rate-limited", async () => {
      const blockedIp = uniqueIp();
      const cleanIp   = uniqueIp();
      for (let i = 0; i < RATE_LIMIT; i++) await POST(chatRequest(blockedIp));
      // blockedIp is now limited; cleanIp should still get through
      const res = await POST(chatRequest(cleanIp));
      expect(res.status).toBe(200);
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("uses the x-real-ip header as a fallback when x-forwarded-for is absent", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "x-real-ip": "172.16.0.1", "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
      });
      const res = await POST(req);
      // Should process normally, not crash on IP extraction
      expect(res.status).toBe(200);
    });

    it('falls back to IP "unknown" when no IP header is present', async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
      });
      // Should not throw — "unknown" is a valid map key
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });
});
