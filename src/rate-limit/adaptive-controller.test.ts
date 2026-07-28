import { describe, it, expect, beforeEach } from "vitest";
import { AdaptiveController } from "./adaptive-controller.js";

describe("AdaptiveController AIMD & Cascade Dampening", () => {
  let controller: AdaptiveController;

  beforeEach(() => {
    controller = new AdaptiveController({
      initialConcurrency: 2,
      maxConcurrency: 4,
      reduceFactor: 0.75,
      additiveIncrease: 1,
      successWindow: 5, // shortened for test
      defaultCooldownMs: 2000,
    });
  });

  it("reduces concurrency by 25% on 429 error (min 1)", () => {
    expect(controller.getConcurrency()).toBe(2);
    controller.record429();
    expect(controller.getConcurrency()).toBe(1); // 2 * 0.75 = 1.5 -> Math.floor = 1
  });

  it("applies Cascade Dampening on multiple concurrent 429 bursts", () => {
    controller.setConcurrency(4);
    expect(controller.getConcurrency()).toBe(4);

    // 1st 429 reduces 4 * 0.75 = 3
    controller.record429();
    expect(controller.getConcurrency()).toBe(3);

    // 2nd and 3rd 429 in the same cascade burst should NOT reduce concurrency further
    controller.record429();
    controller.record429();
    expect(controller.getConcurrency()).toBe(3);
    expect(controller.get429Count()).toBe(3);

    // Successful response clears cascade
    controller.recordSuccess();

    // Next 429 will reduce concurrency again
    controller.record429();
    expect(controller.getConcurrency()).toBe(2); // 3 * 0.75 = 2.25 -> Math.floor = 2
  });

  it("increases concurrency after successWindow consecutive successes", () => {
    controller.setConcurrency(1);

    for (let i = 0; i < 4; i++) {
      controller.recordSuccess();
      expect(controller.getConcurrency()).toBe(1);
    }

    // 5th success increases concurrency
    controller.recordSuccess();
    expect(controller.getConcurrency()).toBe(2);
  });
});
