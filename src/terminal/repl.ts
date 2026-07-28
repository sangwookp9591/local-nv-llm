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

  constructor(options: ReplOptions) {
    this.options = options;
    this.toolRegistry = new ToolRegistry(options.cwd, options.patchManager);

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
        rl.prompt();
        continue;
      }

      // 2. Natural language Local Intent check
      const localIntent = detectLocalIntent(trimmed);
      if (localIntent) {
        await this.handleLocalIntent(localIntent);
        rl.prompt();
        continue;
      }

      // 3. LLM Agent Runtime execution
      await this.handleUserPrompt(trimmed);
      this.options.sessionStore.saveSession(this.session);
      rl.prompt();
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
        console.log(`API Key: ${maskApiKey(this.options.apiKey)}\n`);
        break;
      }
    }
  }

  private async handleSlashCommand(slash: { command: string; args: string }): Promise<boolean> {
    switch (slash.command) {
      case "exit":
        console.log(chalk.yellow("NV CLI를 종료합니다. 세션이 저장되었습니다."));
        return true;

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

      case "status":
        await this.handleLocalIntent("CURRENT_STATUS");
        return false;

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
        onToolStart: (name) => {
          console.log(chalk.yellow(`\n◆ ${name} 실행 중...`));
        },
        onToolEnd: (name, output, success) => {
          if (success) {
            console.log(chalk.green(`✓ ${name} 성공`));
          } else {
            console.log(chalk.red(`✗ ${name} 실패: ${output}`));
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
