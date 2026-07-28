import { describe, it, expect, beforeEach } from "vitest";
import { RuntimeEventBus } from "./event-bus.js";
import { RuntimeStateStore } from "./state-store.js";
import { TerminalStatusBar } from "./status-bar.js";

describe("TerminalStatusBar Renderer", () => {
  let eventBus: RuntimeEventBus;
  let stateStore: RuntimeStateStore;
  let statusBar: TerminalStatusBar;

  beforeEach(() => {
    eventBus = new RuntimeEventBus();
    stateStore = new RuntimeStateStore(eventBus);
    statusBar = new TerminalStatusBar(stateStore);
  });

  it("renders single-line normal mode bar", () => {
    eventBus.emit("GOAL_STATUS_CHANGED", {
      goalId: "g-1",
      objective: "Test Goal",
      status: "RUNNING",
      completedTasks: 5,
      totalTasks: 10,
    });

    const barText = statusBar.renderBarText("normal", 100);
    expect(barText).toContain("GOAL RUNNING");
    expect(barText).toContain("5/10");
    expect(barText).toContain("NV");
  });

  it("renders compact mode for narrow terminals", () => {
    eventBus.emit("GOAL_STATUS_CHANGED", {
      status: "RUNNING",
      completedTasks: 2,
      totalTasks: 4,
    });

    const compactText = statusBar.renderBarText("compact", 50);
    expect(compactText).toContain("RUN 2/4");
  });

  it("renders expanded multiline panel with active agent details", () => {
    eventBus.emit("AGENT_STATUS_CHANGED", {
      agentId: "implementer-01",
      role: "Implementer",
      model: "nvidia/qwen3-coder",
      status: "calling_tool",
      taskTitle: "Implement API Service",
      activeTool: "patch_file",
    });

    const expandedText = statusBar.renderExpandedPanel();
    expect(expandedText).toContain("Active Agents");
    expect(expandedText).toContain("implementer-01");
    expect(expandedText).toContain("nvidia/qwen3-coder");
  });
});
