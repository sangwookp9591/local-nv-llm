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
import { TerminalRepl } from "./terminal/repl.js";
import { PermissionManager } from "./permissions/permission-manager.js";
import { ProjectDiscovery } from "./project/project-discovery.js";
import { GoalRuntime } from "./goal/goal-runtime.js";
import { AgentOrchestrator } from "./orchestration/orchestrator.js";

const program = new Command();
const credStore = new CredentialStore();
const configStore = new ConfigStore();
const provider = new NvidiaProvider();
const sessionStore = new SessionStore();
const patchManager = new PatchManager();
const permManager = new PermissionManager();
const projDiscovery = new ProjectDiscovery();
const goalRuntime = new GoalRuntime();
const orchestrator = new AgentOrchestrator();

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
        provider,
        mode,
        cwd,
      });
      console.log(output);
    } catch (err: unknown) {
      console.error(chalk.red(`오류: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
    return;
  }

  // Interactive Mode header & REPL start
  console.log(chalk.cyan.bold(`\nNV Terminal AI (${mode.toUpperCase()} MODE)`));
  console.log(chalk.dim(`Model: ${config.defaultModel} | Directory: ${cwd}\n`));
  console.log(chalk.yellow("대화형 셸 준비 완료. (/help 명령어로 사용 가능 도움말 확인)\n"));

  const repl = new TerminalRepl({
    provider,
    apiKey: activeApiKey,
    sessionStore,
    patchManager,
    cwd,
    modelId: config.defaultModel,
    mode,
    planMode: options.plan,
  });

  await repl.start();
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

// Subcommands
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

program
  .command("chat")
  .description("Run NV in Chat mode (General conversation & Q&A)")
  .option("-p, --prompt <text>", "Run non-interactive prompt in chat mode")
  .option("-m, --model <model-id>", "NVIDIA model ID to use")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    await runCliSession({ ...options, mode: "chat" });
  });

program
  .command("permissions")
  .description("Manage path permissions and grants")
  .action(() => {
    const grants = permManager.listGrants();
    console.log(chalk.bold.cyan("\n[승인된 경로 권한 목록]"));
    if (grants.length === 0) {
      console.log(chalk.dim("추가로 승인된 경로 권한이 없습니다. (현재 프로젝트 루트만 기본 허용)"));
    } else {
      grants.forEach((g) => console.log(`- ${g.path} (${g.modes.join(",")}) [${g.scope}]`));
    }
    console.log();
  });

program
  .command("project")
  .description("Detect project root or list sub-project candidates")
  .action(() => {
    const root = projDiscovery.detectProjectRoot();
    console.log(chalk.bold.cyan(`\n감지된 프로젝트 루트: ${root || process.cwd()}`));
    const candidates = projDiscovery.findCandidates();
    if (candidates.length > 0) {
      console.log(chalk.dim("하위 프로젝트 후보:"));
      candidates.forEach((c) => console.log(`  - ${c.name} (${c.path}) [${c.marker}]`));
    }
    console.log();
  });

program
  .command("goal")
  .description("Manage autonomous engineering goals")
  .argument("[objective...]", "Goal objective text")
  .action(async (objectiveParts: string[]) => {
    const objective = objectiveParts.join(" ");
    if (!objective) {
      const active = goalRuntime.getActiveGoal();
      if (active) {
        console.log(chalk.bold.cyan(`\n[현재 활성 Goal 상태]`));
        console.log(`Goal ID: ${active.id}`);
        console.log(`Objective: ${active.objective}`);
        console.log(`Status: ${active.status.toUpperCase()}`);
        console.log(`Step: ${active.currentStep}/${active.maxSteps}\n`);
      } else {
        console.log(chalk.dim("활성화된 Goal이 없습니다. 'nv goal <목표>'로 실행하세요."));
      }
      return;
    }

    const goal = goalRuntime.createGoal(objective, 30);
    console.log(chalk.bold.green(`\n✓ Goal이 생성되었습니다!`));
    console.log(`ID: ${goal.id}`);
    console.log(`목표: ${goal.objective}\n`);
    await runCliSession({ mode: "agent" });
  });

program
  .command("orchestration")
  .description("Manage Multi-Agent Orchestration status")
  .action(() => {
    console.log(
      chalk.bold.cyan(`\nMulti-Agent Orchestration Status: ${orchestrator.isEnabled() ? "ON" : "OFF"}\n`)
    );
  });

const limitsCmd = program.command("limits").description("Check or configure Rate Limit settings");

limitsCmd
  .command("status")
  .description("Show current NVIDIA Rate Limit status")
  .action(() => {
    const scheduler = provider.getScheduler();
    const mgr = scheduler.getDomainManager();
    const cfg = mgr.getConfig();
    const metrics = scheduler.getMetrics();

    console.log(chalk.bold.cyan("\nNVIDIA Rate Limit Configuration & Status\n"));
    console.log(`Mode: ${chalk.bold(cfg.mode.toUpperCase())}`);
    console.log(`Configured Fallback RPM: ${cfg.fallbackRpm}`);
    console.log(`Configured Maximum RPM: ${cfg.maxRpm}`);
    console.log(`Max Concurrency: ${cfg.maxConcurrency}`);
    console.log(`429 Count: ${metrics.rateLimited429Count}`);
    console.log(`503 Count: ${metrics.serverError503Count}`);
    console.log(`Queue Length: ${scheduler.getQueueLength()}\n`);
  });

limitsCmd
  .command("reset")
  .description("Reset adaptive rate limit states")
  .action(() => {
    const scheduler = provider.getScheduler();
    scheduler.resetMetrics();
    console.log(chalk.green("✓ Rate limit metrics and adaptive states reset."));
  });

program
  .command("queue")
  .description("Show current pending request queue")
  .action(() => {
    const scheduler = provider.getScheduler();
    console.log(chalk.cyan(`\nPending Request Queue: ${scheduler.getQueueLength()} items\n`));
  });

program
  .command("usage")
  .description("Show API call usage metrics")
  .action(() => {
    const scheduler = provider.getScheduler();
    const metrics = scheduler.getMetrics();
    console.log(chalk.bold.cyan("\n[API Request Usage Metrics]"));
    console.log(`Total Requests: ${metrics.totalRequests}`);
    console.log(`Successful: ${metrics.successfulRequests}`);
    console.log(`Retried: ${metrics.retriedRequests}`);
    console.log(`HTTP 429: ${metrics.rateLimited429Count}`);
    console.log(`HTTP 503: ${metrics.serverError503Count}`);
    console.log(`Queued Time: ${(metrics.totalQueuedMs / 1000).toFixed(1)}s`);
    console.log(`API Exec Time: ${(metrics.totalExecutionMs / 1000).toFixed(1)}s\n`);
  });

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
  .option("--rate-limit", "Include rate limit status check")
  .action(async (options) => {
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

    if (options.rateLimit) {
      const scheduler = provider.getScheduler();
      const cfg = scheduler.getDomainManager().getConfig();
      console.log(chalk.bold.cyan("\n[Rate Limit Scheduler Summary]"));
      console.log(`Mode: ${cfg.mode} | Fallback RPM: ${cfg.fallbackRpm} | Max Concurrency: ${cfg.maxConcurrency}`);
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
