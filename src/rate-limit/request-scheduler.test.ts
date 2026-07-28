import { describe, it, expect, vi, beforeEach } from "vitest";
import { RequestScheduler } from "./request-scheduler.js";

describe("RequestScheduler Centralized Queue & Retry Manager", () => {
  let scheduler: RequestScheduler;

  beforeEach(() => {
    scheduler = new RequestScheduler();
  });

  it("schedules and executes interactive requests successfully", async () => {
    const mockTask = vi.fn().mockResolvedValue("Success Output");

    const result = await scheduler.schedule({
      provider: "nvidia",
      modelId: "nvidia/nemotron-3-super-120b-a12b",
      apiKey: "nvapi-testkey12345",
      requestType: "chat",
      priority: "interactive",
      execute: mockTask,
    });

    expect(result).toBe("Success Output");
    expect(mockTask).toHaveBeenCalledTimes(1);

    const metrics = scheduler.getMetrics();
    expect(metrics.successfulRequests).toBe(1);
    expect(metrics.totalRequests).toBe(1);
  });

  it("handles 429 rate limit with automatic retry and metric tracking", async () => {
    let calls = 0;
    const mockTask = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        const error = new Error("429 Too Many Requests");
        (error as any).statusCode = 429;
        (error as any).headers = { "retry-after": "0.1" }; // 100ms
        throw error;
      }
      return "Retry Success";
    });

    const result = await scheduler.schedule({
      provider: "nvidia",
      modelId: "nvidia/nemotron-3-super-120b-a12b",
      apiKey: "nvapi-testkey12345",
      requestType: "chat",
      priority: "interactive",
      execute: mockTask,
    });

    expect(result).toBe("Retry Success");
    expect(calls).toBe(2);

    const metrics = scheduler.getMetrics();
    expect(metrics.rateLimited429Count).toBe(1);
    expect(metrics.retriedRequests).toBe(1);
    expect(metrics.successfulRequests).toBe(1);
  });

  it("does not retry 401 Unauthorized errors", async () => {
    const mockTask = vi.fn().mockImplementation(async () => {
      const error = new Error("401 Unauthorized");
      (error as any).statusCode = 401;
      throw error;
    });

    await expect(
      scheduler.schedule({
        provider: "nvidia",
        modelId: "nvidia/nemotron-3-super-120b-a12b",
        apiKey: "nvapi-invalidkey",
        requestType: "chat",
        priority: "interactive",
        execute: mockTask,
      })
    ).rejects.toThrow("401 Unauthorized");

    expect(mockTask).toHaveBeenCalledTimes(1);
  });
});
