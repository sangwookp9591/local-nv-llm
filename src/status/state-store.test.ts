import { describe, it, expect, beforeEach } from "vitest";
import { RuntimeEventBus } from "./event-bus.js";
import { RuntimeStateStore } from "./state-store.js";

describe("RuntimeStateStore SSoT", () => {
  let eventBus: RuntimeEventBus;
  let store: RuntimeStateStore;

  beforeEach(() => {
    eventBus = new RuntimeEventBus();
    store = new RuntimeStateStore(eventBus);
  });

  it("updates view state from emitted runtime events", () => {
    expect(store.getState().goalStatus).toBe("IDLE");

    eventBus.emit("GOAL_STATUS_CHANGED", {
      goalId: "g-100",
      objective: "Build Upload Service",
      status: "RUNNING",
      completedTasks: 3,
      totalTasks: 10,
    });

    const state = store.getState();
    expect(state.goalId).toBe("g-100");
    expect(state.goalObjective).toBe("Build Upload Service");
    expect(state.goalStatus).toBe("RUNNING");
    expect(state.completedTasks).toBe(3);
    expect(state.totalTasks).toBe(10);
    expect(state.progressPercent).toBe(30);
  });

  it("tracks rate limit metrics and agent updates", () => {
    eventBus.emit("MODEL_RATE_LIMIT_UPDATED", {
      modelId: "nvidia/nemotron-3-super-120b-a12b",
      rpmUsed: 25,
      rpmLimit: 40,
      tpmUsed: 80000,
      tpmLimit: 120000,
      level: "warning",
    });

    const state = store.getState();
    expect(state.rpmUsed).toBe(25);
    expect(state.rpmLimit).toBe(40);
    expect(state.rateLimitLevel).toBe("warning");
  });
});
