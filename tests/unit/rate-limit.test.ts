import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, RATE_LIMIT, RATE_WINDOW } from "@/lib/rate-limit";

// Each test gets a fresh store so module-level state never bleeds between cases
function freshStore() {
  return new Map<string, { count: number; resetAt: number }>();
}

describe("checkRateLimit", () => {
  it("allows the first request from a new IP", () => {
    expect(checkRateLimit("1.1.1.1", Date.now(), freshStore())).toBe(true);
  });

  it(`allows up to ${RATE_LIMIT} requests within the window`, () => {
    const store = freshStore();
    const now = Date.now();
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect(checkRateLimit("2.2.2.2", now, store)).toBe(true);
    }
  });

  it(`blocks the ${RATE_LIMIT + 1}th request within the same window`, () => {
    const store = freshStore();
    const now = Date.now();
    for (let i = 0; i < RATE_LIMIT; i++) checkRateLimit("3.3.3.3", now, store);
    expect(checkRateLimit("3.3.3.3", now, store)).toBe(false);
  });

  it("resets the counter after the window expires", () => {
    const store = freshStore();
    const now = Date.now();
    for (let i = 0; i < RATE_LIMIT; i++) checkRateLimit("4.4.4.4", now, store);
    expect(checkRateLimit("4.4.4.4", now, store)).toBe(false);

    // One millisecond past the window end — counter resets
    expect(checkRateLimit("4.4.4.4", now + RATE_WINDOW + 1, store)).toBe(true);
  });

  it("tracks different IPs independently", () => {
    const store = freshStore();
    const now = Date.now();
    for (let i = 0; i < RATE_LIMIT; i++) checkRateLimit("5.5.5.5", now, store);
    expect(checkRateLimit("5.5.5.5", now, store)).toBe(false);
    // A different IP is unaffected
    expect(checkRateLimit("6.6.6.6", now, store)).toBe(true);
  });

  it("increments the counter on each allowed request", () => {
    const store = freshStore();
    const now = Date.now();
    checkRateLimit("7.7.7.7", now, store);
    checkRateLimit("7.7.7.7", now, store);
    checkRateLimit("7.7.7.7", now, store);
    expect(store.get("7.7.7.7")?.count).toBe(3);
  });
});
