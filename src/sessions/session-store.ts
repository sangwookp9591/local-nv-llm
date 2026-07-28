import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { ChatMessage } from "../providers/provider.js";

export interface SessionData {
  id: string;
  projectPath: string;
  provider: string;
  modelId: string;
  mode: "chat" | "agent";
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  compactSummary?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SessionStoreOptions {
  baseDir?: string;
}

export class SessionStore {
  private baseDir: string;

  constructor(options?: SessionStoreOptions) {
    if (options?.baseDir) {
      this.baseDir = options.baseDir;
    } else {
      const configHome =
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
      this.baseDir = path.join(configHome, "nv", "sessions");
    }
  }

  private getProjectDir(projectPath: string): string {
    const hash = crypto.createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
    const dir = path.join(this.baseDir, hash);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  public createSession(
    projectPath: string,
    modelId: string,
    mode: "chat" | "agent" = "chat"
  ): SessionData {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const session: SessionData = {
      id,
      projectPath,
      provider: "nvidia",
      modelId,
      mode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    return session;
  }

  public saveSession(session: SessionData): void {
    session.updatedAt = new Date().toISOString();
    const dir = this.getProjectDir(session.projectPath);
    const filePath = path.join(dir, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
  }

  public getSession(projectPath: string, sessionId: string): SessionData | null {
    const dir = this.getProjectDir(projectPath);
    const filePath = path.join(dir, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  }

  public listSessions(projectPath: string): SessionData[] {
    const dir = this.getProjectDir(projectPath);
    if (!fs.existsSync(dir)) return [];
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      const result: SessionData[] = [];
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), "utf-8");
          result.push(JSON.parse(raw));
        } catch {
          // ignore bad files
        }
      }
      return result.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    } catch {
      return [];
    }
  }

  public getLatestSession(projectPath: string): SessionData | null {
    const sessions = this.listSessions(projectPath);
    return sessions.length > 0 ? sessions[0] : null;
  }

  public deleteSession(projectPath: string, sessionId: string): boolean {
    const dir = this.getProjectDir(projectPath);
    const filePath = path.join(dir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
