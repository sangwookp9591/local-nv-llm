import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type GoalStatus =
  | "created"
  | "planning"
  | "waiting_permission"
  | "executing"
  | "verifying"
  | "blocked"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

export interface Goal {
  id: string;
  objective: string;
  constraints: string[];
  acceptanceCriteria: string[];
  status: GoalStatus;
  currentStep: number;
  maxSteps: number;
  createdAt: string;
  updatedAt: string;
  history: Array<{ timestamp: string; step: number; note: string }>;
}

export interface GoalRuntimeOptions {
  storageDir?: string;
}

export class GoalRuntime {
  private storageDir: string;
  private goalsFile: string;
  private goals = new Map<string, Goal>();

  constructor(options?: GoalRuntimeOptions) {
    if (options?.storageDir) {
      this.storageDir = options.storageDir;
    } else {
      const configHome =
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
      this.storageDir = path.join(configHome, "nv", "goals");
    }
    this.goalsFile = path.join(this.storageDir, "goals.json");
    this.loadGoals();
  }

  private loadGoals(): void {
    if (!fs.existsSync(this.goalsFile)) return;
    try {
      const raw = fs.readFileSync(this.goalsFile, "utf-8");
      const list = JSON.parse(raw) as Goal[];
      for (const g of list) {
        this.goals.set(g.id, g);
      }
    } catch {
      // ignore
    }
  }

  private saveGoals(): void {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      fs.writeFileSync(
        this.goalsFile,
        JSON.stringify(Array.from(this.goals.values()), null, 2),
        "utf-8"
      );
    } catch {
      // ignore
    }
  }

  public createGoal(
    objective: string,
    maxSteps = 30,
    constraints: string[] = [],
    acceptanceCriteria: string[] = []
  ): Goal {
    const id = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const goal: Goal = {
      id,
      objective,
      constraints,
      acceptanceCriteria,
      status: "created",
      currentStep: 0,
      maxSteps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [
        {
          timestamp: new Date().toISOString(),
          step: 0,
          note: `Goal created: ${objective}`,
        },
      ],
    };

    this.goals.set(id, goal);
    this.saveGoals();
    return goal;
  }

  public getGoal(id: string): Goal | undefined {
    return this.goals.get(id);
  }

  public getActiveGoal(): Goal | undefined {
    const activeList = Array.from(this.goals.values()).filter(
      (g) =>
        g.status === "created" ||
        g.status === "planning" ||
        g.status === "executing" ||
        g.status === "waiting_permission"
    );
    return activeList.length > 0 ? activeList[activeList.length - 1] : undefined;
  }

  public transitionGoal(id: string, newStatus: GoalStatus, note?: string): boolean {
    const goal = this.goals.get(id);
    if (!goal) return false;

    goal.status = newStatus;
    goal.updatedAt = new Date().toISOString();
    if (note) {
      goal.history.push({
        timestamp: new Date().toISOString(),
        step: goal.currentStep,
        note,
      });
    }

    this.saveGoals();
    return true;
  }

  public incrementStep(id: string, note?: string): boolean {
    const goal = this.goals.get(id);
    if (!goal) return false;

    goal.currentStep++;
    goal.updatedAt = new Date().toISOString();
    if (note) {
      goal.history.push({
        timestamp: new Date().toISOString(),
        step: goal.currentStep,
        note,
      });
    }

    this.saveGoals();
    return true;
  }

  public pauseGoal(id: string): boolean {
    return this.transitionGoal(id, "blocked", "Goal paused by user");
  }

  public resumeGoal(id: string): boolean {
    return this.transitionGoal(id, "executing", "Goal resumed by user");
  }

  public cancelGoal(id: string): boolean {
    return this.transitionGoal(id, "cancelled", "Goal cancelled by user");
  }

  public listGoals(): Goal[] {
    return Array.from(this.goals.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
}
