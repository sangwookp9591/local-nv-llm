import { describe, it, expect } from "vitest";
import { parseRetryAfter, parseRateLimitHeaders } from "./retry-after.js";

describe("Retry-After & Rate Limit Headers Parser", () => {
  const mockNow = 1774672200000; // Fixed timestamp

  it("parses integer seconds correctly", () => {
    expect(parseRetryAfter("5", mockNow)).toBe(5000);
    expect(parseRetryAfter("2.5", mockNow)).toBe(2500);
    expect(parseRetryAfter("0", mockNow)).toBe(0);
  });

  it("parses HTTP Date string correctly", () => {
    // 10 seconds after mockNow
    const httpDateStr = new Date(mockNow + 10000).toUTCString();
    expect(parseRetryAfter(httpDateStr, mockNow)).toBe(10000);
  });

  it("returns 0 for past HTTP Date string", () => {
    const pastDateStr = new Date(mockNow - 10000).toUTCString();
    expect(parseRetryAfter(pastDateStr, mockNow)).toBe(0);
  });

  it("returns null for invalid or null inputs", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("invalid-string", mockNow)).toBeNull();
  });

  it("parses standard and custom rate limit response headers", () => {
    const headers = {
      "retry-after": "4",
      "x-ratelimit-limit": "30",
      "x-ratelimit-remaining": "5",
      "x-ratelimit-reset": "1774672210000",
    };

    const parsed = parseRateLimitHeaders(headers);
    expect(parsed.retryAfterMs).toBe(4000);
    expect(parsed.limit).toBe(30);
    expect(parsed.remaining).toBe(5);
    expect(parsed.resetAt).toBe(1774672210000);
  });
});
