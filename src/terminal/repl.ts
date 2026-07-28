import readline from "node:readline";
import chalk from "chalk";
import { LlmProvider, ChatMessage } from "../providers/provider.js";
import { SessionData, SessionStore } from "../sessions/session-store.js";
import { ContextManager } from "../sessions/context-manager.js";
import { parseSlashCommand, KNOWN_SLASH_COMMANDS } from "./slash-commands.js";
import { ToolRegistry } from "../agent/tool-registry.js";
import { PatchManager } from "../agent/patch-manager.js";
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

    // Existing session or create new
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

      // Check slash commands
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

      // Process normal prompt
      await this.handleUserPrompt(trimmed);
      this.options.sessionStore.saveSession(this.session);
      rl.prompt();
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
        console.log(chalk.bold("\n[현재 세션 상태]"));
        console.log(`Provider: NVIDIA Build`);
        console.log(`Model: ${this.session.modelId}`);
        console.log(`Mode: ${this.session.mode.toUpperCase()}`);
        console.log(`Directory: ${this.options.cwd}`);
        console.log(`Session ID: ${this.session.id}`);
        console.log(`Context Messages: ${this.session.messages.length}`);
        console.log(`API Key: ${maskApiKey(this.options.apiKey)}\n`);
        return false;

      case "model":
        if (slash.args) {
          this.session.modelId = slash.args.trim();
          console.log(chalk.green(`✓ 모델이 변경되었습니다: ${this.session.modelId}`));
        } else {
          console.log(`현재 설정된 모델: ${chalk.bold(this.session.modelId)}`);
        }
        return false;

      case "models":
        console.log(chalk.cyan("사용 가능한 모델 목록을 조회하는 중..."));
        try {
          const models = await this.options.provider.listModels(this.options.apiKey);
          for (const m of models) {
            console.log(`- ${chalk.bold(m.id)} (${m.name})`);
          }
        } catch {
          console.log(chalk.red("모델 목록 조회가 원활하지 않습니다."));
        }
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
    const userMsg: ChatMessage = { role: "user", content: prompt };
    this.contextManager.addMessage(userMsg);

    const systemPrompt =
      this.session.mode === "agent"
        ? "You are NV, an expert terminal AI coding agent. You can read, write files, and inspect the project when needed."
        : "You are NV, an expert terminal AI assistant.";

    const messages = this.contextManager.getEffectiveMessages(systemPrompt);
    const tools = this.session.mode === "agent" ? this.toolRegistry.getToolDefinitions() : undefined;

    console.log(chalk.blue.bold("\nNV:"));

    let fullAssistantContent = "";
    const pendingToolCalls: Array<{ id: string; name: string; argsStr: string }> = [];

    const request = {
      model: this.session.modelId,
      messages,
      tools,
      stream: true,
    };

    try {
      for await (const chunk of this.options.provider.chat(this.options.apiKey, request)) {
        if (chunk.type === "reasoning" && chunk.reasoning) {
          process.stdout.write(chalk.magenta.dim(chunk.reasoning));
        } else if (chunk.type === "content" && chunk.content) {
          fullAssistantContent += chunk.content;
          process.stdout.write(redactSensitiveText(chunk.content, [this.options.apiKey]));
        } else if (chunk.type === "tool_call" && chunk.toolCall) {
          const tc = chunk.toolCall;
          if (tc.name) {
            pendingToolCalls.push({
              id: tc.id || `call_${Date.now()}`,
              name: tc.name,
              argsStr: tc.argumentsDelta || "",
            });
          } else if (pendingToolCalls.length > 0 && tc.argumentsDelta) {
            pendingToolCalls[pendingToolCalls.length - 1].argsStr += tc.argumentsDelta;
          }
        } else if (chunk.type === "error" && chunk.error) {
          console.log(chalk.red(`\n오류: ${chunk.error}`));
        }
      }
      console.log("\n");

      if (fullAssistantContent) {
        this.contextManager.addMessage({
          role: "assistant",
          content: fullAssistantContent,
        });
      }

      // Handle tool calls if agent mode
      if (pendingToolCalls.length > 0 && this.session.mode === "agent") {
        for (const toolCall of pendingToolCalls) {
          console.log(chalk.yellow(`🛠️ Tool 실행 요청: ${toolCall.name}`));
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(toolCall.argsStr);
          } catch {
            parsedArgs = {};
          }

          const res = await this.toolRegistry.executeTool(
            toolCall.name,
            parsedArgs,
            this.session.id
          );

          if (res.success) {
            console.log(chalk.green(`✓ Tool 결과:\n${res.output}`));
            this.contextManager.addMessage({
              role: "tool",
              content: res.output || "Success",
              tool_call_id: toolCall.id,
            });
          } else {
            console.log(chalk.red(`✗ Tool 실행 실패: ${res.error}`));
            this.contextManager.addMessage({
              role: "tool",
              content: `Error: ${res.error}`,
              tool_call_id: toolCall.id,
            });
          }
        }
      }
    } catch (err: unknown) {
      console.log(chalk.red(`\n오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}\n`));
    }
  }
}
