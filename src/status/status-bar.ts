import chalk from "chalk";
import { RuntimeStateStore } from "./state-store.js";
import { StatusBarMode } from "./types.js";

export class TerminalStatusBar {
  private stateStore: RuntimeStateStore;
  private mode: StatusBarMode = "normal";

  constructor(stateStore: RuntimeStateStore) {
    this.stateStore = stateStore;
  }

  public setMode(mode: StatusBarMode): void {
    this.mode = mode;
  }

  public getMode(): StatusBarMode {
    return this.mode;
  }

  public renderBarText(overrideMode?: StatusBarMode, columns = process.stdout.columns || 100): string {
    const mode = overrideMode ?? this.mode;
    if (mode === "off") return "";

    const s = this.stateStore.getState();

    // Auto-compact for narrow terminals
    if (columns < 75 && mode === "normal") {
      return this.renderCompactBar(s);
    }

    if (mode === "compact") {
      return this.renderCompactBar(s);
    }

    return this.renderNormalBar(s);
  }

  private renderNormalBar(s: any): string {
    const goalText = s.totalTasks > 0 ? `${s.completedTasks}/${s.totalTasks}` : "0/0";
    const statusText = chalk.bold.green(`GOAL ${s.goalStatus} ${goalText}`);
    const modelText = chalk.cyan(`MODEL ${s.activeModel.split("/").pop()}`);
    const agentsText = chalk.yellow(`AGENTS ${s.runningAgents}/${s.totalAgents}`);
    const rpmText = `RPM ${s.rpmUsed ?? 0}/${s.rpmLimit ?? 40}`;
    const tpmText = `TPM ${Math.round((s.tpmUsed ?? 0) / 1000)}K/${Math.round((s.tpmLimit ?? 120000) / 1000)}K`;
    const warnText = s.warningCount > 0 ? chalk.red(`⚠ ${s.warningCount}`) : chalk.dim(`⚠ 0`);

    const elapsedSec = Math.floor(s.elapsedMs / 1000);
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const ss = String(elapsedSec % 60).padStart(2, "0");
    const timeText = chalk.dim(`${mm}:${ss}`);

    return ` NV │ ${statusText} │ ${modelText} │ ${agentsText} │ ${rpmText} │ ${tpmText} │ ${warnText} │ ${timeText}`;
  }

  private renderCompactBar(s: any): string {
    const goalText = s.totalTasks > 0 ? `${s.completedTasks}/${s.totalTasks}` : "0/0";
    const modelShort = s.activeModel.split("/").pop()?.slice(0, 10) || "MODEL";
    return ` RUN ${goalText} │ ${modelShort} │ A ${s.runningAgents}/${s.totalAgents} │ ⚠${s.warningCount}`;
  }

  public renderExpandedPanel(): string {
    const s = this.stateStore.getState();
    const lines: string[] = [];

    lines.push(chalk.bold.cyan("┌─ NV Runtime Control Surface ───────────────────────────────────────────┐"));
    lines.push(
      `│ Goal       ${(s.goalObjective || s.goalStatus).slice(0, 40).padEnd(40)} Progress ${s.completedTasks}/${s.totalTasks} (${s.progressPercent}%)`
    );
    lines.push(`│ Model      ${s.activeModel.padEnd(40)} Rate ${s.rateLimitLevel.toUpperCase()}`);
    lines.push(`│ Agents     ${s.runningAgents} running · ${s.totalAgents} total`);
    lines.push(chalk.bold.cyan("├─ Active Agents ───────────────────────────────────────────────────────────────┤"));

    if (s.agentViews.length === 0) {
      lines.push("│ (대기 중인 활성 에이전트가 없습니다)");
    } else {
      for (const a of s.agentViews) {
        lines.push(
          `│ ▶ ${a.agentId.padEnd(15)} ${(a.role || "").padEnd(12)} ${(a.model || "").slice(0, 20).padEnd(20)} ${a.status}`
        );
      }
    }

    lines.push(chalk.bold.cyan("└───────────────────────────────────────────────────────────────────────────────┘"));
    return lines.join("\n");
  }
}
