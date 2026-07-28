export type AgentRole =
  | "orchestrator"
  | "planner"
  | "explorer"
  | "implementer"
  | "reviewer"
  | "tester"
  | "security_guard"
  | "synthesizer";

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "completed"
  | "failed";

export interface AgentTask {
  id: string;
  goalId: string;
  title: string;
  role: AgentRole;
  dependencies: string[];
  status: TaskStatus;
  handoff?: AgentHandoff;
}

export interface FileLease {
  path: string;
  ownerAgentId: string;
  taskId: string;
  acquiredAt: number;
}

export interface AgentHandoff {
  summary: string;
  findings: string[];
  filesInspected: string[];
  filesChanged: string[];
  commandsExecuted: string[];
  unresolvedQuestions: string[];
  risks: string[];
  recommendedNextActions: string[];
}

export class AgentOrchestrator {
  private enabled = false;
  private tasks = new Map<string, AgentTask>();
  private leases = new Map<string, FileLease>();

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public acquireFileLease(filePath: string, agentId: string, taskId: string): boolean {
    const normalized = filePath.trim();
    const existing = this.leases.get(normalized);
    if (existing && existing.ownerAgentId !== agentId) {
      return false; // Lease held by another agent
    }

    this.leases.set(normalized, {
      path: normalized,
      ownerAgentId: agentId,
      taskId,
      acquiredAt: Date.now(),
    });
    return true;
  }

  public releaseFileLease(filePath: string, agentId: string): boolean {
    const normalized = filePath.trim();
    const existing = this.leases.get(normalized);
    if (existing && existing.ownerAgentId === agentId) {
      this.leases.delete(normalized);
      return true;
    }
    return false;
  }

  public createTask(
    id: string,
    goalId: string,
    title: string,
    role: AgentRole,
    dependencies: string[] = []
  ): AgentTask {
    const initialStatus: TaskStatus = dependencies.length === 0 ? "ready" : "pending";
    const task: AgentTask = {
      id,
      goalId,
      title,
      role,
      dependencies,
      status: initialStatus,
    };
    this.tasks.set(id, task);
    return task;
  }

  public getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  public completeTask(id: string, handoff: AgentHandoff): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    task.status = "completed";
    task.handoff = handoff;

    // Check dependent tasks and set them to ready if all deps are completed
    for (const t of this.tasks.values()) {
      if (t.status === "pending") {
        const allDepsDone = t.dependencies.every(
          (depId) => this.tasks.get(depId)?.status === "completed"
        );
        if (allDepsDone) {
          t.status = "ready";
        }
      }
    }

    return true;
  }

  public listTasks(): AgentTask[] {
    return Array.from(this.tasks.values());
  }

  public clearAll(): void {
    this.tasks.clear();
    this.leases.clear();
  }
}
