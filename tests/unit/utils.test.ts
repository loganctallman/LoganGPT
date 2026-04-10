import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "@/lib/utils";

describe("formatRelativeTime", () => {
  it('returns "just now" for a timestamp less than 5 seconds ago', () => {
    expect(formatRelativeTime(new Date())).toBe("just now");
    expect(formatRelativeTime(new Date(Date.now() - 4_000))).toBe("just now");
  });

  it('returns "<n>s ago" for timestamps 5–59 seconds ago', () => {
    expect(formatRelativeTime(new Date(Date.now() - 5_000))).toBe("5s ago");
    expect(formatRelativeTime(new Date(Date.now() - 30_000))).toBe("30s ago");
    expect(formatRelativeTime(new Date(Date.now() - 59_000))).toBe("59s ago");
  });

  it('returns "<n>m ago" for timestamps 60–3599 seconds ago', () => {
    expect(formatRelativeTime(new Date(Date.now() - 60_000))).toBe("1m ago");
    expect(formatRelativeTime(new Date(Date.now() - 90_000))).toBe("1m ago");
    expect(formatRelativeTime(new Date(Date.now() - 3_599_000))).toBe("59m ago");
  });

  it("returns a locale time string for timestamps 1 hour or older", () => {
    const old = new Date(Date.now() - 3_600_000);
    const result = formatRelativeTime(old);
    // Locale format varies by environment but always contains HH:MM
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});
