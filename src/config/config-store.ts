import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Config, ConfigSchema, DEFAULT_CONFIG } from "./schema.js";

export interface ConfigStoreOptions {
  customUserConfigDir?: string;
}

export class ConfigStore {
  private userConfigDir: string;

  constructor(options?: ConfigStoreOptions) {
    if (options?.customUserConfigDir) {
      this.userConfigDir = options.customUserConfigDir;
    } else {
      const configHome =
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
      this.userConfigDir = path.join(configHome, "nv");
    }
  }

  public getUserConfigPath(): string {
    return path.join(this.userConfigDir, "config.json");
  }

  public getProjectConfigPath(cwd: string): string {
    return path.join(cwd, ".nv", "config.json");
  }

  public loadConfig(cwd: string = process.cwd(), cliOverrides: Partial<Config> = {}): Config {
    let mergedRaw: Record<string, unknown> = { ...DEFAULT_CONFIG };

    // 1. User config
    const userPath = this.getUserConfigPath();
    if (fs.existsSync(userPath)) {
      try {
        const content = fs.readFileSync(userPath, "utf-8");
        const parsed = JSON.parse(content);
        mergedRaw = { ...mergedRaw, ...parsed };
      } catch {
        // ignore invalid json
      }
    }

    // 2. Project config
    const projectPath = this.getProjectConfigPath(cwd);
    if (fs.existsSync(projectPath)) {
      try {
        const content = fs.readFileSync(projectPath, "utf-8");
        const parsed = JSON.parse(content);
        mergedRaw = { ...mergedRaw, ...parsed };
      } catch {
        // ignore invalid json
      }
    }

    // 3. CLI Overrides
    for (const [key, value] of Object.entries(cliOverrides)) {
      if (value !== undefined) {
        mergedRaw[key] = value;
      }
    }

    return ConfigSchema.parse(mergedRaw);
  }

  public saveUserConfig(updates: Partial<Config>): void {
    const userPath = this.getUserConfigPath();
    fs.mkdirSync(path.dirname(userPath), { recursive: true });

    let current: Record<string, unknown> = {};
    if (fs.existsSync(userPath)) {
      try {
        current = JSON.parse(fs.readFileSync(userPath, "utf-8"));
      } catch {
        current = {};
      }
    }

    const updated = { ...current, ...updates };
    fs.writeFileSync(userPath, JSON.stringify(updated, null, 2), "utf-8");
  }

  public saveProjectConfig(cwd: string, updates: Partial<Config>): void {
    const projectPath = this.getProjectConfigPath(cwd);
    fs.mkdirSync(path.dirname(projectPath), { recursive: true });

    let current: Record<string, unknown> = {};
    if (fs.existsSync(projectPath)) {
      try {
        current = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
      } catch {
        current = {};
      }
    }

    const updated = { ...current, ...updates };
    fs.writeFileSync(projectPath, JSON.stringify(updated, null, 2), "utf-8");
  }
}
