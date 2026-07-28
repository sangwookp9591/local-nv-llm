import { describe, it, expect, beforeEach } from "vitest";
import { CircuitBreaker } from "./circuit-breaker.js";

describe("CircuitBreaker Duplicate Failure Prevention", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(2); // Trip after 2 failures
  });

  it("generates deterministic fingerprints for tool calls", () => {
    const fp1 = breaker.createFingerprint("read_file", { path: "src/cli.ts" }, "/app");
    const fp2 = breaker.createFingerprint("read_file", { path: "src/cli.ts" }, "/app");
    const fp3 = breaker.createFingerprint("read_file", { path: "src/other.ts" }, "/app");

    expect(fp1.hash).toBe(fp2.hash);
    expect(fp1.hash).not.toBe(fp3.hash);
  });

  it("blocks duplicate actions after threshold failures", () => {
    const fp = breaker.createFingerprint("list_directory", { path: "/invalid" }, "/app");

    expect(breaker.shouldBlock(fp.hash)).toBe(false);

    breaker.recordFailure(fp.hash, "PATH_NOT_FOUND");
    expect(breaker.shouldBlock(fp.hash)).toBe(false);

    breaker.recordFailure(fp.hash, "PATH_NOT_FOUND");
    // 2nd failure trips circuit breaker
    expect(breaker.shouldBlock(fp.hash)).toBe(true);
    expect(breaker.getRecord(fp.hash)?.errorType).toBe("PATH_NOT_FOUND");
  });

  it("resets circuit breaker on successful execution", () => {
    const fp = breaker.createFingerprint("read_file", { path: "src/index.ts" }, "/app");
    breaker.recordFailure(fp.hash, "TRANSIENT_ERROR");
    breaker.recordFailure(fp.hash, "TRANSIENT_ERROR");
    expect(breaker.shouldBlock(fp.hash)).toBe(true);

    breaker.recordSuccess(fp.hash);
    expect(breaker.shouldBlock(fp.hash)).toBe(false);
  });
});
