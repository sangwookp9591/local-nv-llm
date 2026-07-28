import { describe, it, expect } from "vitest";
import { getExponentialBackoffMs, applyJitter } from "./backoff.js";

describe("Exponential Backoff & Jitter", () => {
  it("calculates exponential backoff correctly", () => {
    expect(getExponentialBackoffMs(1)).toBe(2000);
    expect(getExponentialBackoffMs(2)).toBe(4000);
    expect(getExponentialBackoffMs(3)).toBe(8000);
    expect(getExponentialBackoffMs(4)).toBe(16000);
    expect(getExponentialBackoffMs(5)).toBe(32000);
    expect(getExponentialBackoffMs(6)).toBe(60000); // capped at max 60s
  });

  it("applies jitter ratio within expected range", () => {
    const baseMs = 10000;
    for (let i = 0; i < 50; i++) {
      const jittered = applyJitter(baseMs, 0.2);
      expect(jittered).toBeGreaterThanOrEqual(8000);
      expect(jittered).toBeLessThanOrEqual(12000);
    }
  });
});
