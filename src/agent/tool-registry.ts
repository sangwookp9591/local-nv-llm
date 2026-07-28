import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { ToolDefinition } from "../providers/provider.js";
import { isPathAllowed, isCommandDangerous } from "./permissions.js";
import { PatchManager } from "./patch-manager.js";

const execAsync = promisify(exec);

export interface ToolExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
}

export class ToolRegistry {
  private projectRoot: string;
  private patchManager: PatchManager;

  constructor(projectRoot: string = process.cwd(), patchManager?: PatchManager) {
    this.projectRoot = path.resolve(projectRoot);
    this.patchManager = patchManager ?? new PatchManager();
  }

  public getToolDefinitions(): ToolDefinition[] {
    return [
      {
        type: "function",
        function: {
          name: "list_directory",
          description: "List files and directories within a given directory relative to the project root.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative directory path (default '.')" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read the full text content of a file.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative file path" },
            },
            required: ["path"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "create_file",
          description: "Create or overwrite a file with the specified content.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative file path" },
              content: { type: "string", description: "File text content" },
            },
            required: ["path", "content"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "move_file",
          description: "Move or rename a file or directory.",
          parameters: {
            type: "object",
            properties: {
              fromPath: { type: "string", description: "Source relative path" },
              toPath: { type: "string", description: "Destination relative path" },
            },
            required: ["fromPath", "toPath"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "delete_file",
          description: "Delete a file from the workspace.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative file path to delete" },
            },
            required: ["path"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "run_command",
          description: "Execute a shell command inside the project directory.",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string", description: "Shell command string" },
            },
            required: ["command"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "git_status",
          description: "Get current git repository status.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
      {
        type: "function",
        function: {
          name: "git_diff",
          description: "Get current git diff.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
    ];
  }

  public async executeTool(
    name: string,
    rawArgs: Record<string, unknown>,
    sessionId: string = "default"
  ): Promise<ToolExecutionResult> {
    try {
      switch (name) {
        case "list_directory": {
          const relPath = String(rawArgs.path || ".");
          const fullPath = path.resolve(this.projectRoot, relPath);
          if (!isPathAllowed(this.projectRoot, fullPath)) {
            return { success: false, error: "접근이 허용되지 않은 경로입니다." };
          }
          if (!fs.existsSync(fullPath)) {
            return { success: false, error: "디렉터리가 존재하지 않습니다." };
          }
          const items = fs.readdirSync(fullPath, { withFileTypes: true });
          const formatted = items
            .map((item) => `${item.isDirectory() ? "[DIR]" : "[FILE]"} ${item.name}`)
            .join("\n");
          return { success: true, output: formatted || "(empty directory)" };
        }

        case "read_file": {
          const relPath = String(rawArgs.path || "");
          if (!relPath) return { success: false, error: "path 파라미터가 필요합니다." };
          const fullPath = path.resolve(this.projectRoot, relPath);
          if (!isPathAllowed(this.projectRoot, fullPath)) {
            return { success: false, error: "접근이 허용되지 않은 경로입니다." };
          }
          if (!fs.existsSync(fullPath)) {
            return { success: false, error: "파일이 존재하지 않습니다." };
          }
          const content = fs.readFileSync(fullPath, "utf-8");
          return { success: true, output: content };
        }

        case "create_file": {
          const relPath = String(rawArgs.path || "");
          const content = String(rawArgs.content ?? "");
          if (!relPath) return { success: false, error: "path 파라미터가 필요합니다." };
          const fullPath = path.resolve(this.projectRoot, relPath);
          if (!isPathAllowed(this.projectRoot, fullPath)) {
            return { success: false, error: "접근이 허용되지 않은 경로입니다." };
          }

          const existedBefore = fs.existsSync(fullPath);
          const originalContent = existedBefore ? fs.readFileSync(fullPath, "utf-8") : undefined;

          // Record snapshot for undo
          this.patchManager.recordSnapshot({
            sessionId,
            path: fullPath,
            existedBefore,
            originalContent,
            modifiedContent: content,
          });

          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content, "utf-8");
          return { success: true, output: `✓ 파일이 작성되었습니다: ${relPath}` };
        }

        case "move_file": {
          const fromRel = String(rawArgs.fromPath || "");
          const toRel = String(rawArgs.toPath || "");
          const fullFrom = path.resolve(this.projectRoot, fromRel);
          const fullTo = path.resolve(this.projectRoot, toRel);

          if (!isPathAllowed(this.projectRoot, fullFrom) || !isPathAllowed(this.projectRoot, fullTo)) {
            return { success: false, error: "접근이 허용되지 않은 경로입니다." };
          }
          if (!fs.existsSync(fullFrom)) {
            return { success: false, error: "원본 파일이 존재하지 않습니다." };
          }

          fs.mkdirSync(path.dirname(fullTo), { recursive: true });
          fs.renameSync(fullFrom, fullTo);
          return { success: true, output: `✓ 파일 이동 완료: ${fromRel} -> ${toRel}` };
        }

        case "delete_file": {
          const relPath = String(rawArgs.path || "");
          const fullPath = path.resolve(this.projectRoot, relPath);
          if (!isPathAllowed(this.projectRoot, fullPath)) {
            return { success: false, error: "접근이 허용되지 않은 경로입니다." };
          }
          if (!fs.existsSync(fullPath)) {
            return { success: false, error: "삭제할 파일이 존재하지 않습니다." };
          }

          const originalContent = fs.readFileSync(fullPath, "utf-8");
          this.patchManager.recordSnapshot({
            sessionId,
            path: fullPath,
            existedBefore: true,
            originalContent,
          });

          fs.unlinkSync(fullPath);
          return { success: true, output: `✓ 파일 삭제 완료: ${relPath}` };
        }

        case "run_command": {
          const command = String(rawArgs.command || "");
          if (!command) return { success: false, error: "command 파라미터가 필요합니다." };

          if (isCommandDangerous(command)) {
            return { success: false, error: `위험한 명령어 실행 차단: ${command}` };
          }

          const { stdout, stderr } = await execAsync(command, {
            cwd: this.projectRoot,
            timeout: 30000, // 30s timeout
          });
          const output = [stdout, stderr].filter(Boolean).join("\n").trim();
          return { success: true, output: output || "(명령어 실행 성공, 출력 없음)" };
        }

        case "git_status": {
          const { stdout } = await execAsync("git status --short", { cwd: this.projectRoot });
          return { success: true, output: stdout.trim() || "(clean working tree)" };
        }

        case "git_diff": {
          const { stdout } = await execAsync("git diff", { cwd: this.projectRoot });
          return { success: true, output: stdout.trim() || "(no changes)" };
        }

        default:
          return { success: false, error: `알 수 없는 도구명: ${name}` };
      }
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
      return { success: false, error: msg };
    }
  }
}
