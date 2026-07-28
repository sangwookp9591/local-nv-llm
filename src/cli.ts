import { Command } from "commander";
import chalk from "chalk";
import readline from "node:readline";
import { CredentialStore } from "./auth/credential-store.js";
import { ConfigStore } from "./config/config-store.js";
import { NvidiaProvider } from "./providers/nvidia/client.js";
import { runDoctorCheck } from "./commands/doctor.js";
import { runNonInteractivePrompt } from "./commands/non-interactive.js";
import { maskApiKey } from "./auth/redaction.js";
import { SessionStore } from "./sessions/session-store.js";
import { PatchManager } from "./agent/patch-manager.js";

const program = new Command();
const credStore = new CredentialStore();
const configStore = new ConfigStore();
const provider = new NvidiaProvider();
const sessionStore = new SessionStore();
const patchManager = new PatchManager();

async function ensureAuthenticated(): Promise<string> {
  const cred = credStore.getApiKeyInfo();
  if (cred.apiKey) return cred.apiKey;

  console.log(chalk.cyan.bold("\nNV — NVIDIA Terminal AI\n"));
  console.log(chalk.yellow("NVIDIA API Key가 설정되어 있지 않습니다."));
  console.log(chalk.dim("API Key는 https://build.nvidia.com 에서 발급받을 수 있습니다.\n"));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const keyInput = await new Promise<string>((resolve) => {
    rl.question(chalk.bold("API Key를 입력하세요: "), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!keyInput) {
    console.log(chalk.red("API Key가 입력되지 않았습니다. 종료합니다."));
    process.exit(1);
  }

  console.log(chalk.cyan("✓ NVIDIA API Key 유효성을 검증하는 중..."));
  try {
    const isValid = await provider.validateCredential(keyInput);
    if (!isValid) {
      console.log(chalk.red("✗ 유효하지 않은 NVIDIA API Key입니다. 키를 확인해 주세요."));
      process.exit(1);
    }
    credStore.setApiKey(keyInput);
    console.log(chalk.green("✓ NVIDIA API Key 확인 완료 및 자격 증명 저장소에 저장되었습니다.\n"));
    return keyInput;
  } catch (err: unknown) {
    console.log(chalk.red(`✗ 인증 검증 중 오류 발생: ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }
}

async function runCliSession(options: {
  prompt?: string;
  model?: string;
  json?: boolean;
  mode?: "chat" | "agent";
  plan?: boolean;
}) {
  const cwd = process.cwd();
  const config = configStore.loadConfig(
    cwd,
    options.model ? { defaultModel: options.model } : {}
  );
  const activeApiKey = await ensureAuthenticated();
  const mode = options.mode ?? "chat";

  // Non-interactive execution (-p)
  if (options.prompt) {
    try {
      const finalPrompt = options.plan
        ? `[PLAN MODE]: 다음 요청에 대해 파일 조작 없이 탐색 및 구체적 변경 계획을 수립해줘.\n${options.prompt}`
        : options.prompt;

      const output = await runNonInteractivePrompt({
        prompt: finalPrompt,
        apiKey: activeApiKey,
        modelId: config.defaultModel,
        json: options.json,
      });
      console.log(output);
    } catch (err: unknown) {
      console.error(chalk.red(`오류: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
    return;
  }

  // Interactive Mode header
  console.log(chalk.cyan.bold(`\nNV Terminal AI (${mode.toUpperCase()} MODE)`));
  console.log(chalk.dim(`Model: ${config.defaultModel} | Directory: ${cwd}\n`));
  console.log(chalk.yellow("대화형 셸 준비 완료. (/help 명령어로 사용 가능 도움말 확인)\n"));
}

program
  .name("nv")
  .description("NVIDIA Build Terminal AI Agent")
  .version("1.0.0")
  .option("-p, --prompt <text>", "Run non-interactive prompt")
  .option("-m, --model <model-id>", "NVIDIA model ID to use")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    await runCliSession({ ...options, mode: "chat" });
  });

// nv agent subcommand
program
  .command("agent")
  .description("Run NV in Agent mode (Tool Calling, File edits, Patch tracking)")
  .option("-p, --prompt <text>", "Run non-interactive prompt in agent mode")
  .option("-m, --model <model-id>", "NVIDIA model ID to use")
  .option("--json", "Output response in JSON format")
  .option("--plan", "Run in Read-only Plan mode")
  .action(async (options) => {
    await runCliSession({ ...options, mode: "agent" });
  });

// nv chat subcommand
program
  .command("chat")
  .description("Run NV in Chat mode (General conversation & Q&A)")
  .option("-p, --prompt <text>", "Run non-interactive prompt in chat mode")
  .option("-m, --model <model-id>", "NVIDIA model ID to use")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    await runCliSession({ ...options, mode: "chat" });
  });

// Subcommands
const authCmd = program.command("auth").description("Manage NVIDIA authentication");

authCmd
  .command("login")
  .description("Authenticate and save NVIDIA API Key")
  .action(async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const keyInput = await new Promise<string>((resolve) => {
      rl.question(chalk.bold("NVIDIA API Key를 입력하세요: "), (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });

    if (!keyInput) {
      console.log(chalk.red("API Key가 입력되지 않았습니다."));
      return;
    }

    console.log(chalk.cyan("✓ API Key 검증 중..."));
    try {
      const isValid = await provider.validateCredential(keyInput);
      if (!isValid) {
        console.log(chalk.red("✗ API Key 검증 실패: 유효하지 않은 Key입니다."));
        return;
      }
      credStore.setApiKey(keyInput);
      console.log(chalk.green("✓ API Key가 안전하게 저장되었습니다."));
    } catch (err: unknown) {
      console.log(chalk.red(`✗ 오류 발생: ${err instanceof Error ? err.message : String(err)}`));
    }
  });

authCmd
  .command("logout")
  .description("Remove saved API key credential")
  .action(() => {
    credStore.deleteApiKey();
    console.log(chalk.green("✓ 저장된 API Key가 삭제되었습니다."));
  });

authCmd
  .command("status")
  .description("Check authentication status")
  .action(async () => {
    const cred = credStore.getApiKeyInfo();
    console.log(chalk.bold("\nProvider: NVIDIA Build"));
    if (cred.apiKey) {
      console.log(`Authentication: ${chalk.green("Connected")}`);
      console.log(`Credential source: ${cred.source}`);
      console.log(`API Key: ${maskApiKey(cred.apiKey)}\n`);
    } else {
      console.log(`Authentication: ${chalk.red("Disconnected")}`);
      console.log(chalk.dim("Execute 'nv auth login' to connect.\n"));
    }
  });

program
  .command("doctor")
  .description("Run environment and API diagnostic checks")
  .action(async () => {
    console.log(chalk.bold.cyan("\nNV Doctor Diagnostic Tool\n"));
    const report = await runDoctorCheck();

    for (const item of report.items) {
      if (item.status === "ok") {
        console.log(` ${chalk.green("✓")} ${item.label}`);
      } else if (item.status === "warn") {
        console.log(` ${chalk.yellow("!")} ${item.label}`);
      } else {
        console.log(` ${chalk.red("✗")} ${item.label}`);
      }
      if (item.message) {
        console.log(`   ${chalk.dim(item.message)}`);
      }
    }
    console.log();
  });

program
  .command("models")
  .description("List available NVIDIA models")
  .action(async () => {
    const cred = credStore.getApiKeyInfo();
    if (!cred.apiKey) {
      console.log(chalk.red("API Key가 설정되어 있지 않습니다. 'nv auth login'을 먼저 실행해 주세요."));
      return;
    }
    console.log(chalk.cyan("사용 가능한 모델 목록을 조회하는 중...\n"));
    const models = await provider.listModels(cred.apiKey);
    for (const m of models) {
      const caps = [
        m.coding ? "Coding" : null,
        m.reasoning ? "Reasoning" : null,
        m.toolCalling ? "ToolUse" : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`${chalk.bold(m.id)} ${chalk.dim(`(${caps || "Chat"})`)}`);
    }
    console.log();
  });

program
  .command("sessions")
  .description("List saved sessions for current project")
  .action(() => {
    const cwd = process.cwd();
    const sessions = sessionStore.listSessions(cwd);
    if (sessions.length === 0) {
      console.log(chalk.dim("저장된 세션이 없습니다."));
      return;
    }
    console.log(chalk.bold("\n최근 세션 목록:"));
    for (const s of sessions) {
      console.log(`- ${chalk.cyan(s.id)} (${s.modelId}) - ${s.updatedAt}`);
    }
    console.log();
  });

program
  .command("resume [sessionId]")
  .description("Resume a previous conversation session")
  .action((sessionId?: string) => {
    const cwd = process.cwd();
    const session = sessionId
      ? sessionStore.getSession(cwd, sessionId)
      : sessionStore.getLatestSession(cwd);

    if (!session) {
      console.log(chalk.red(`세션을 찾을 수 없습니다: ${sessionId || "latest"}`));
      return;
    }
    console.log(chalk.green(`✓ 세션 복원 성공: ${session.id} (${session.modelId})`));
  });

program.parse(process.argv);
