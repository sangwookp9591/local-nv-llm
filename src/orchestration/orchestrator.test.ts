import { describe, it, expect, beforeEach } from "vitest";
import { AgentOrchestrator } from "./orchestrator.js";

describe("AgentOrchestrator & Task DAG & File Lease", () => {
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
  });

  it("manages file leases preventing concurrent writes to the same file", () => {
    const file = "src/services/api.ts";
    const acquired = orchestrator.acquireFileLease(file, "agent-implementer", "task-1");
    expect(acquired).toBe(true);

    // Second agent attempts to write to the same file
    const secondAcquired = orchestrator.acquireFileLease(file, "agent-reviewer", "task-2");
    expect(secondAcquired).toBe(false);

    // Release lease
    orchestrator.releaseFileLease(file, "agent-implementer");
    const reAcquired = orchestrator.acquireFileLease(file, "agent-reviewer", "task-2");
    expect(reAcquired).toBe(true);
  });

  it("creates and resolves Task DAG dependencies", () => {
    const t1 = orchestrator.createTask("task-1", "goal-1", "Explore Repo", "explorer", []);
    const t2 = orchestrator.createTask("task-2", "goal-1", "Implement Code", "implementer", ["task-1"]);

    expect(t1.status).toBe("ready");
    expect(t2.status).toBe("pending"); // Waiting for task-1

    orchestrator.completeTask("task-1", {
      summary: "Repo explored",
      findings: ["Structure okay"],
      filesInspected: ["src/index.ts"],
      filesChanged: [],
      commandsExecuted: [],
      unresolvedQuestions: [],
      risks: [],
      recommendedNextActions: ["Implement"],
    });

    expect(orchestrator.getTask("task-1")?.status).toBe("completed");
    expect(orchestrator.getTask("task-2")?.status).toBe("ready"); // Dependency resolved!
  });
});
