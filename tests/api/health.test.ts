import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";

// Hoist before any imports so the route module picks up the mock on load
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

import { GET } from "@/app/api/health/route";

describe("/api/health GET", () => {
  beforeEach(() => {
    // Healthy defaults: key present, file readable
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    vi.mocked(readFileSync).mockReturnValue("[]");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it('returns 200 { status: "ok" } when API key and chunks.json are present', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 500 when OPENAI_API_KEY is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/api key/i);
  });

  it("returns 500 when chunks.json cannot be read", async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/knowledge base/i);
  });
});
