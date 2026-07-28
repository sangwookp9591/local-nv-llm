import { describe, it, expect, beforeEach } from "vitest";
import { TokenBucket } from "./token-bucket.js";

describe("TokenBucket", () => {
  it("consumes tokens immediately when capacity is available", () => {
    const bucket = new TokenBucket(30, 30); // 30 capacity, 30 rpm
    const waitMs = bucket.tryConsume();
    expect(waitMs).toBe(0);
    expect(bucket.getTokens()).toBeCloseTo(29);
  });

  it("returns wait time when tokens are exhausted", () => {
    const bucket = new TokenBucket(2, 60); // 2 tokens capacity, 60 RPM (1 token per second)
    expect(bucket.tryConsume()).toBe(0); // 1 token left
    expect(bucket.tryConsume()).toBe(0); // 0 token left

    const waitMs = bucket.tryConsume();
    expect(waitMs).toBeGreaterThan(0);
    expect(waitMs).toBeLessThanOrEqual(1000);
  });

  it("refills tokens over elapsed time up to capacity", () => {
    let mockTime = 1000000;
    const bucket = new TokenBucket(10, 60, () => mockTime); // 60 RPM = 1 token/sec

    // Consume all 10 tokens
    for (let i = 0; i < 10; i++) {
      bucket.tryConsume();
    }
    expect(bucket.getTokens()).toBeCloseTo(0);

    // Advance mock time by 5 seconds (should refill 5 tokens)
    mockTime += 5000;
    expect(bucket.getTokens()).toBeCloseTo(5);

    // Advance mock time by 20 seconds (should cap at capacity 10)
    mockTime += 20000;
    expect(bucket.getTokens()).toBeCloseTo(10);
  });
});
