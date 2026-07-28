import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { GoalRuntime } from "./goal-runtime.js";

describe("GoalRuntime State Machine & Loop", () => {
  let tempDir: string;
  let runtime: GoalRuntime;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-goal-test-"));
    runtime = new GoalRuntime({ storageDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates, updates and tracks goals with steps and status transition", () => {
    const goal = runtime.createGoal("Refactor API layer and test", 10);
    expect(goal.status).toBe("created");
    expect(goal.currentStep).toBe(0);

    runtime.transitionGoal(goal.id, "planning");
    expect(runtime.getGoal(goal.id)?.status).toBe("planning");

    runtime.incrementStep(goal.id);
    expect(runtime.getGoal(goal.id)?.currentStep).toBe(1);

    runtime.transitionGoal(goal.id, "completed");
    expect(runtime.getGoal(goal.id)?.status).toBe("completed");
  });

  it("handles goal pause, resume and cancellation", () => {
    const goal = runtime.createGoal("Background task", 20);
    runtime.transitionGoal(goal.id, "executing");

    runtime.pauseGoal(goal.id);
    expect(runtime.getGoal(goal.id)?.status).toBe("blocked");

    runtime.resumeGoal(goal.id);
    expect(runtime.getGoal(goal.id)?.status).toBe("executing");

    runtime.cancelGoal(goal.id);
    expect(runtime.getGoal(goal.id)?.status).toBe("cancelled");
  });
});
