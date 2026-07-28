import { RuntimeEventBus } from "./event-bus.js";
import { RuntimeViewState, AgentRuntimeView } from "./types.js";

export class RuntimeStateStore {
  private eventBus: RuntimeEventBus;
  private startTime: number = Date.now();

  private state: RuntimeViewState = {
    goalStatus: "IDLE",
    completedTasks: 0,
    totalTasks: 0,
    progressPercent: 0,
    activeModel: "nvidia/nemotron-3-super-120b-a12b",
    runningAgents: 0,
    totalAgents: 0,
    agentViews: [],
    concurrencyUsed: 0,
    concurrencyLimit: 2,
    queueLength: 0,
    rateLimitLevel: "normal",
    totalTokens: 0,
    contextPercent: 0,
    contextStatus: "normal",
    waitingPermission: false,
    warningCount: 0,
    errorCount: 0,
    elapsedMs: 0,
  };

  constructor(eventBus: RuntimeEventBus) {
    this.eventBus = eventBus;
    this.setupListeners();
  }

  private setupListeners(): void {
    this.eventBus.subscribe("GOAL_STATUS_CHANGED", (evt) => {
      const p = evt.payload as any;
      if (p.goalId) this.state.goalId = p.goalId;
      if (p.objective) this.state.goalObjective = p.objective;
      if (p.status) this.state.goalStatus = p.status;
      if (typeof p.completedTasks === "number") this.state.completedTasks = p.completedTasks;
      if (typeof p.totalTasks === "number") this.state.totalTasks = p.totalTasks;

      if (this.state.totalTasks > 0) {
        this.state.progressPercent = Math.round(
          (this.state.completedTasks / this.state.totalTasks) * 100
        );
      }
    });

    this.eventBus.subscribe("MODEL_RATE_LIMIT_UPDATED", (evt) => {
      const p = evt.payload as any;
      if (p.modelId) this.state.activeModel = p.modelId;
      if (p.fallbackModel) this.state.fallbackModel = p.fallbackModel;
      if (typeof p.rpmUsed === "number") this.state.rpmUsed = p.rpmUsed;
      if (typeof p.rpmLimit === "number") this.state.rpmLimit = p.rpmLimit;
      if (typeof p.tpmUsed === "number") this.state.tpmUsed = p.tpmUsed;
      if (typeof p.tpmLimit === "number") this.state.tpmLimit = p.tpmLimit;
      if (p.level) this.state.rateLimitLevel = p.level;
    });

    this.eventBus.subscribe("AGENT_STATUS_CHANGED", (evt) => {
      const p = evt.payload as AgentRuntimeView;
      const index = this.state.agentViews.findIndex((a) => a.agentId === p.agentId);
      if (index >= 0) {
        this.state.agentViews[index] = { ...this.state.agentViews[index], ...p };
      } else {
        this.state.agentViews.push(p);
      }

      this.state.runningAgents = this.state.agentViews.filter(
        (a) => a.status === "running" || a.status === "calling_tool"
      ).length;
      this.state.totalAgents = this.state.agentViews.length;
    });

    this.eventBus.subscribe("TOOL_STARTED", (evt) => {
      const p = evt.payload as any;
      this.state.activeTool = p.toolName;
      if (p.filePath) this.state.activeFile = p.filePath;
    });

    this.eventBus.subscribe("PERMISSION_REQUESTED", () => {
      this.state.waitingPermission = true;
    });

    this.eventBus.subscribe("PERMISSION_RESOLVED", () => {
      this.state.waitingPermission = false;
    });
  }

  public getState(): RuntimeViewState {
    this.state.elapsedMs = Date.now() - this.startTime;
    return { ...this.state };
  }
}
