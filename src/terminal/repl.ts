import readline from "node:readline";
import chalk from "chalk";
import { LlmProvider } from "../providers/provider.js";
import { SessionData, SessionStore } from "../sessions/session-store.js";
import { ContextManager } from "../sessions/context-manager.js";
import { parseSlashCommand, KNOWN_SLASH_COMMANDS } from "./slash-commands.js";
import { detectLocalIntent } from "../cli/local-intent-router.js";
import { buildSystemPrompt, RuntimeContext } from "../prompts/system-prompt.js";
import { ToolRegistry } from "../agent/tool-registry.js";
import { PatchManager } from "../agent/patch-manager.js";
import { AgentLoop } from "../agent/agent-loop.js";
import { maskApiKey, redactSensitiveText } from "../auth/redaction.js";
import { NvidiaProvider } from "../providers/nvidia/client.js";
import { CircuitBreaker } from "../harness/circuit-breaker.js";
import { PermissionManager } from "../permissions/permission-manager.js";
import { ProjectDiscovery } from "../project/project-discovery.js";
import { GoalRuntime } from "../goal/goal-runtime.js";
import { AgentOrchestrator } from "../orchestration/orchestrator.js";
import { RuntimeEventBus } from "../status/event-bus.js";
import { RuntimeStateStore } from "../status/state-store.js";
import { TerminalStatusBar } from "../status/status-bar.js";

export interface ReplOptions {
  provider: LlmProvider;
  apiKey: string;
  sessionStore: SessionStore;
  patchManager: PatchManager;
  cwd: string;
  modelId: string;
  mode: "chat" | "agent";
  planMode?: boolean;
}

export class TerminalRepl {
  private options: ReplOptions;
  private contextManager: ContextManager;
  private session: SessionData;
  private toolRegistry: ToolRegistry;
  private circuitBreaker: CircuitBreaker;
  private permissionManager: PermissionManager;
  private projectDiscovery: ProjectDiscovery;
  private goalRuntime: GoalRuntime;
  private orchestrator: AgentOrchestrator;
  private eventBus: RuntimeEventBus;
  private stateStore: RuntimeStateStore;
  private statusBar: TerminalStatusBar;
  private verbose = false;

  constructor(options: ReplOptions) {
    this.options = options;
    this.toolRegistry = new ToolRegistry(options.cwd, options.patchManager);
    this.circuitBreaker = new CircuitBreaker(2);
    this.permissionManager = new PermissionManager({ allowedRoots: [options.cwd] });
    this.projectDiscovery = new ProjectDiscovery(options.cwd);
    this.goalRuntime = new GoalRuntime();
    this.orchestrator = new AgentOrchestrator();

    this.eventBus = new RuntimeEventBus();
    this.stateStore = new RuntimeStateStore(this.eventBus);
    this.statusBar = new TerminalStatusBar(this.stateStore);

    const existing = options.sessionStore.getLatestSession(options.cwd);
    if (existing) {
      this.session = existing;
      this.session.modelId = options.modelId;
      this.session.mode = options.mode;
    } else {
      this.session = options.sessionStore.createSession(
        options.cwd,
        options.modelId,
        options.mode
      );
    }
    this.contextManager = new ContextManager(this.session);
  }

  public async start(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan("› "),
    });

    console.log(
      chalk.dim(
        `대화 세션이 시작되었습니다. (/help 명령어 목록, /exit 또는 Ctrl+C 종료)\n`
      )
    );

    this.renderStatusBar();
    rl.prompt();

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        rl.prompt();
        continue;
      }

      // 1. Slash command check
      const slash = parseSlashCommand(trimmed);
      if (slash) {
        const shouldExit = await this.handleSlashCommand(slash);
        if (shouldExit) {
          rl.close();
          break;
        }
        this.renderStatusBar();
        rl.prompt();
        continue;
      }

      // 2. Natural language Local Intent check
      const localIntent = detectLocalIntent(trimmed);
      if (localIntent) {
        await this.handleLocalIntent(localIntent);
        this.renderStatusBar();
        rl.prompt();
        continue;
      }

      // 3. LLM Agent Runtime execution
      await this.handleUserPrompt(trimmed);
      this.options.sessionStore.saveSession(this.session);
      this.renderStatusBar();
      rl.prompt();
    }
  }

  private renderStatusBar(): void {
    const barText = this.statusBar.renderBarText();
    if (barText) {
      console.log(`\n${barText}\n`);
    }
  }

  private async handleLocalIntent(intent: string): Promise<void> {
    switch (intent) {
      case "LIST_MODELS": {
        console.log(chalk.bold.cyan("\n사용 가능한 NVIDIA 모델 목록\n"));
        console.log(`현재 선택된 모델: ● ${chalk.green(this.session.modelId)}\n`);
        try {
          const models = await this.options.provider.listModels(this.options.apiKey);
          models.forEach((m, idx) => {
            const caps = [
              m.coding ? "Coding" : null,
              m.reasoning ? "Reasoning" : null,
              m.toolCalling ? "Tool Calling" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            console.log(`  ${idx + 1}. ${chalk.bold(m.id)}`);
            console.log(`     ${chalk.dim(caps || "Chat")}`);
          });
          console.log(
            chalk.dim(`\n총 ${models.length}개 모델 (/model <id> 로 변경할 수 있습니다.)\n`)
          );
        } catch {
          console.log(chalk.red("모델 목록 조회에 실패했습니다."));
        }
        break;
      }

      case "CURRENT_MODEL": {
        console.log(chalk.bold(`\n현재 선택된 모델: ${chalk.green(this.session.modelId)}`));
        console.log(`- Provider: NVIDIA API`);
        console.log(`- Mode: ${this.session.mode.toUpperCase()}`);
        console.log(`- Working directory: ${this.options.cwd}\n`);
        break;
      }

      case "CURRENT_STATUS": {
        console.log(chalk.bold("\n[현재 세션 상태]"));
        console.log(`Provider: NVIDIA Build`);
        console.log(`Model: ${this.session.modelId}`);
        console.log(`Mode: ${this.session.mode.toUpperCase()}`);
        console.log(`Directory: ${this.options.cwd}`);
        console.log(`Session ID: ${this.session.id}`);
        console.log(`Orchestration: ${this.orchestrator.isEnabled() ? "ON" : "OFF"}`);
        console.log(`API Key: ${maskApiKey(this.options.apiKey)}\n`);
        break;
      }
    }
  }

  private async handleSlashCommand(slash: { command: string; args: string }): Promise<boolean> {
    const nvidiaProvider = this.options.provider as NvidiaProvider;
    const scheduler = nvidiaProvider.getScheduler?.();

    switch (slash.command) {
      case "exit":
        console.log(chalk.yellow("NV CLI를 종료합니다. 세션이 저장되었습니다."));
        return true;

      case "status": {
        const sub = slash.args.trim();
        if (sub === "compact" || sub === "normal" || sub === "expanded" || sub === "off") {
          this.statusBar.setMode(sub);
          console.log(chalk.green(`✓ Status Bar 모드가 '${sub}'(으)로 변경되었습니다.`));
          if (sub === "expanded") {
            console.log(`\n${this.statusBar.renderExpandedPanel()}\n`);
          }
        } else if (sub === "expanded") {
          console.log(`\n${this.statusBar.renderExpandedPanel()}\n`);
        } else {
          await this.handleLocalIntent("CURRENT_STATUS");
        }
        return false;
      }

      case "verbose": {
        if (slash.args === "on") {
          this.verbose = true;
          console.log(chalk.green("✓ Verbose 로그 모드가 활성화되었습니다."));
        } else if (slash.args === "off") {
          this.verbose = false;
          console.log(chalk.yellow("✓ Verbose 로그 모드가 비활성화되었습니다."));
        } else {
          console.log(`현재 Verbose 모드: ${this.verbose ? "ON" : "OFF"}`);
        }
        return false;
      }

      case "permissions": {
        const parts = slash.args.trim().split(/\s+/);
        const sub = parts[0];
        if (sub === "list" || !sub) {
          const grants = this.permissionManager.listGrants();
          console.log(chalk.bold.cyan("\n[현재 승인된 접근 권한 목록]"));
          if (grants.length === 0) {
            console.log(chalk.dim("추가로 승인된 경로 권한이 없습니다. (현재 프로젝트 루트만 허용)"));
          } else {
            grants.forEach((g) => {
              console.log(`- ${g.path} (${g.modes.join(",")}) [Scope: ${g.scope}]`);
            });
          }
          console.log();
        } else if (sub === "clear-session") {
          this.permissionManager.clearSessionPermissions();
          console.log(chalk.green("✓ 세션 범위 권한이 정원 초기화되었습니다."));
        }
        return false;
      }

      case "project": {
        const sub = slash.args.trim();
        if (sub === "detect" || !sub) {
          const root = this.projectDiscovery.detectProjectRoot();
          console.log(chalk.bold.cyan(`\n감지된 프로젝트 루트: ${root || this.options.cwd}`));
          const candidates = this.projectDiscovery.findCandidates();
          if (candidates.length > 0) {
            console.log(chalk.dim("하위 프로젝트 후보:"));
            candidates.forEach((c) => console.log(`  - ${c.name} (${c.path}) [${c.marker}]`));
          }
          console.log();
        }
        return false;
      }

      case "goal": {
        if (!slash.args || slash.args === "status") {
          const active = this.goalRuntime.getActiveGoal();
          if (active) {
            console.log(chalk.bold.cyan(`\n[현재 활성 Goal 상태]`));
            console.log(`Goal ID: ${active.id}`);
            console.log(`Objective: ${active.objective}`);
            console.log(`Status: ${active.status.toUpperCase()}`);
            console.log(`Step: ${active.currentStep}/${active.maxSteps}\n`);
          } else {
            console.log(chalk.dim("활성화된 Goal이 없습니다. '/goal <목표>'로 새 목표를 시작하세요."));
          }
        } else if (slash.args.startsWith("cancel")) {
          const active = this.goalRuntime.getActiveGoal();
          if (active) {
            this.goalRuntime.cancelGoal(active.id);
            this.eventBus.emit("GOAL_STATUS_CHANGED", { goalId: active.id, status: "CANCELLED" });
            console.log(chalk.yellow(`✓ Goal (${active.id}) 취소 완료.`));
          }
        } else {
          // Create new goal
          const newGoal = this.goalRuntime.createGoal(slash.args, 30);
          this.eventBus.emit("GOAL_STATUS_CHANGED", {
            goalId: newGoal.id,
            objective: newGoal.objective,
            status: "RUNNING",
            completedTasks: 0,
            totalTasks: 10,
          });
          console.log(chalk.bold.green(`\n✓ Goal이 생성되었습니다!`));
          console.log(`ID: ${newGoal.id}`);
          console.log(`목표: ${newGoal.objective}`);
          console.log(chalk.dim("Agent 모드로 자동 전환하여 자율 엔지니어링 루프를 구동합니다.\n"));
          this.session.mode = "agent";
        }
        return false;
      }

      case "orchestration": {
        const sub = slash.args.trim();
        if (sub === "on") {
          this.orchestrator.setEnabled(true);
          console.log(chalk.green("✓ Multi-Agent Orchestration이 활성화되었습니다."));
        } else if (sub === "off") {
          this.orchestrator.setEnabled(false);
          console.log(chalk.yellow("✓ Multi-Agent Orchestration이 비활성화되었습니다."));
        } else {
          console.log(
            chalk.bold.cyan(`\nOrchestration: ${this.orchestrator.isEnabled() ? "ON" : "OFF"}\n`)
          );
        }
        return false;
      }

      case "clear":
        console.clear();
        console.log(chalk.cyan.bold("\nNV Terminal AI"));
        console.log(
          chalk.dim(
            `Model: ${this.session.modelId} | Mode: ${this.session.mode.toUpperCase()} | Directory: ${this.options.cwd}\n`
          )
        );
        return false;

      case "help":
        console.log(chalk.bold("\n사용 가능한 Slash Commands:"));
        for (const cmd of KNOWN_SLASH_COMMANDS) {
          console.log(`  /${chalk.cyan(cmd)}`);
        }
        console.log();
        return false;

      case "limits":
      case "rate": {
        if (slash.args === "reset" && scheduler) {
          scheduler.resetMetrics();
          console.log(chalk.green("✓ Rate Limit 상태 및 Adaptive metrics가 초기화되었습니다."));
          return false;
        }

        if (scheduler) {
          const mgr = scheduler.getDomainManager();
          const cfg = mgr.getConfig();
          const domain = mgr.getEffectiveDomain(this.options.apiKey, this.session.modelId);
          const metrics = scheduler.getMetrics();

          console.log(chalk.bold.cyan("\nNVIDIA Rate Limit & Request Control Status\n"));
          console.log(`Mode: ${chalk.bold(cfg.mode.toUpperCase())}`);
          console.log(`Configured Fallback RPM: ${cfg.fallbackRpm}`);
          console.log(`Configured Maximum RPM: ${cfg.maxRpm}`);
          console.log(`Current Concurrency: ${domain.effectiveConcurrency} / ${cfg.maxConcurrency}`);
          console.log(`Observed Ceiling: ${domain.globalDomain.controller.getObservedCeiling() ?? "None"}`);
          console.log(`429 Responses: ${metrics.rateLimited429Count}`);
          console.log(`503 Responses: ${metrics.serverError503Count}`);
          console.log(`Current Queue Length: ${scheduler.getQueueLength()}\n`);
        }
        return false;
      }

      case "queue": {
        if (scheduler) {
          console.log(chalk.bold.cyan(`\n현재 요청 대기열 (Queue): ${scheduler.getQueueLength()}개 항목`));
        }
        return false;
      }

      case "usage": {
        if (scheduler) {
          const metrics = scheduler.getMetrics();
          console.log(chalk.bold.cyan("\n[세션 요청 사용량 메트릭]"));
          console.log(`Total Model Calls: ${metrics.totalRequests}`);
          console.log(`Successful: ${metrics.successfulRequests}`);
          console.log(`Retried: ${metrics.retriedRequests}`);
          console.log(`HTTP 429: ${metrics.rateLimited429Count}`);
          console.log(`HTTP 503: ${metrics.serverError503Count}`);
          console.log(`Total Queued Time: ${(metrics.totalQueuedMs / 1000).toFixed(1)}s`);
          console.log(`Total API Exec Time: ${(metrics.totalExecutionMs / 1000).toFixed(1)}s\n`);
        }
        return false;
      }

      case "model":
        if (slash.args) {
          this.session.modelId = slash.args.trim();
          console.log(chalk.green(`✓ 모델이 변경되었습니다: ${this.session.modelId}`));
        } else {
          await this.handleLocalIntent("CURRENT_MODEL");
        }
        return false;

      case "models":
        await this.handleLocalIntent("LIST_MODELS");
        return false;

      case "undo": {
        const undoneFiles = this.options.patchManager.undoLastChange(this.session.id);
        if (undoneFiles.length > 0) {
          console.log(chalk.green(`✓ 최근 변경 파일이 원복되었습니다:`));
          for (const f of undoneFiles) {
            console.log(`  - ${f}`);
          }
        } else {
          console.log(chalk.yellow("원복할 최근 파일 변경 기록이 없습니다."));
        }
        return false;
      }

      case "compact":
        if (this.session.messages.length > 0) {
          const summary = `이전 대화 맥락 (${this.session.messages.length}개 메시지) 요약 완료.`;
          this.contextManager.compact(summary);
          console.log(chalk.green(`✓ 대화 맥락이 요약되었습니다. (토큰 절약 적용)`));
        } else {
          console.log(chalk.dim("요약할 이전 대화 내역이 없습니다."));
        }
        return false;

      case "agent":
        this.session.mode = "agent";
        console.log(chalk.green("✓ Agent 모드로 전환되었습니다. (도구 및 파일 수정 지원)"));
        return false;

      case "chat":
        this.session.mode = "chat";
        console.log(chalk.green("✓ Chat 모드로 전환되었습니다. (대화 전용)"));
        return false;

      default:
        console.log(chalk.red(`알 수 없는 명령어: /${slash.command}. /help로 명령어를 확인하세요.`));
        return false;
    }
  }

  private async handleUserPrompt(prompt: string): Promise<void> {
    this.contextManager.addMessage({ role: "user", content: prompt });

    const runtimeContext: RuntimeContext = {
      applicationName: "NV Terminal AI",
      provider: "NVIDIA",
      modelId: this.session.modelId,
      mode: this.session.mode,
      workingDirectory: this.options.cwd,
      sessionId: this.session.id,
      tools: this.toolRegistry.getToolDefinitions().map((t) => t.function.name),
      toolCallingSupported: true,
    };

    const systemPrompt = buildSystemPrompt(runtimeContext);
    const messages = this.contextManager.getEffectiveMessages(systemPrompt);

    console.log(chalk.blue.bold("\nNV:"));

    const agentLoop = new AgentLoop({
      provider: this.options.provider,
      apiKey: this.options.apiKey,
      toolRegistry: this.toolRegistry,
      maxSteps: 10,
    });

    try {
      const result = await agentLoop.run({
        modelId: this.session.modelId,
        messages,
        sessionId: this.session.id,
        onChunk: (chunk) => {
          process.stdout.write(redactSensitiveText(chunk, [this.options.apiKey]));
        },
        onToolStart: (name, args) => {
          this.eventBus.emit("TOOL_STARTED", { toolName: name, filePath: (args as any)?.path });
          const fp = this.circuitBreaker.createFingerprint(name, args, this.options.cwd);
          if (this.circuitBreaker.shouldBlock(fp.hash)) {
            console.log(
              chalk.red(`\n⚠ [Circuit Breaker] ${name} 도구가 연속 반복 실패로 차단되었습니다.`)
            );
          } else if (this.verbose) {
            console.log(chalk.yellow(`\n◆ ${name} 실행 중... (${JSON.stringify(args)})`));
          }
        },
        onToolEnd: (name, output, success) => {
          const fp = this.circuitBreaker.createFingerprint(name, {}, this.options.cwd);
          if (success) {
            this.circuitBreaker.recordSuccess(fp.hash);
            if (this.verbose) console.log(chalk.green(`✓ ${name} 성공`));
          } else {
            this.circuitBreaker.recordFailure(fp.hash, "COMMAND_FAILED");
            if (this.verbose) console.log(chalk.red(`✗ ${name} 실패: ${output}`));
          }
        },
      });

      console.log("\n");
      // Update effective messages into session
      this.session.messages = result.messages.filter((m) => m.role !== "system");
    } catch (err: unknown) {
      console.log(chalk.red(`\n오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}\n`));
    }
  }
}
