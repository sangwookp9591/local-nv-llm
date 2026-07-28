import { describe, it, expect } from "vitest";
import { normalizeNvidiaError, NvidiaApiError } from "./errors.js";

describe("Nvidia Errors Normalization", () => {
  it("normalizes 401 Unauthorized errors", () => {
    const err = normalizeNvidiaError({ message: "401 Unauthorized", status: 401 });
    expect(err).toBeInstanceOf(NvidiaApiError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toContain("인증에 실패했습니다");
  });

  it("normalizes 429 Rate Limit errors", () => {
    const err = normalizeNvidiaError({ message: "429 Rate limit exceeded", status: 429 });
    expect(err.statusCode).toBe(429);
    expect(err.message).toContain("Rate Limit");
  });

  it("normalizes 404 Not Found errors", () => {
    const err = normalizeNvidiaError({ message: "404 Model not found", status: 404 });
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("모델을 찾을 수 없거나");
  });

  it("preserves existing NvidiaApiError instances", () => {
    const existing = new NvidiaApiError("Custom error", 500, "CUSTOM");
    const normalized = normalizeNvidiaError(existing);
    expect(normalized).toBe(existing);
  });
});
