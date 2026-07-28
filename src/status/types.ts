export type StatusBarMode = "compact" | "normal" | "expanded" | "off";

export interface RuntimeEvent<T = unknown> {
  id: string;
  type: string;
  goalId?: string;
  taskId?: string;
  agentId?: string;
  timestamp: string;
  payload: T;
}

export type RateLimitLevel = "normal" | "warning" | "critical" | "exhausted";

export interface ModelRuntimeState {
  modelId: string;
  requestsUsed?: number;
  requestsLimit?: number;
  tokensUsed?: number;
  tokensLimit?: number;
  concurrentRequests: number;
  concurrencyLimit?: number;
  queuedRequests: number;
  resetAt?: string;
  level: RateLimitLevel;
  lastUpdatedAt: string;
}

export interface AgentRuntimeView {
  agentId: string;
  role: string;
  model: string;
  status: string;
  taskTitle?: string;
  activeTool?: string;
  activeFile?: string;
  progressPercent?: number;
  waitingReason?: string;
}

export interface RuntimeViewState {
  goalId?: string;
  goalObjective?: string;
  goalStatus: string;
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;

  activeModel: string;
  fallbackModel?: string;

  runningAgents: number;
  totalAgents: number;
  agentViews: AgentRuntimeView[];

  rpmUsed?: number;
  rpmLimit?: number;
  tpmUsed?: number;
  tpmLimit?: number;
  concurrencyUsed: number;
  concurrencyLimit: number;
  queueLength: number;
  rateLimitLevel: RateLimitLevel;

  totalTokens: number;
  contextPercent: number;
  contextStatus: "normal" | "warning" | "compacting" | "critical";

  activeTool?: string;
  activeFile?: string;

  waitingPermission: boolean;
  warningCount: number;
  errorCount: number;
  elapsedMs: number;
}
