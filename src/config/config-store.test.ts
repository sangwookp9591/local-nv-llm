import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "./config-store.js";
import { DEFAULT_CONFIG } from "./schema.js";

describe("ConfigStore", () => {
  let tempDir: string;
  let userConfigDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-config-test-"));
    userConfigDir = path.join(tempDir, "user-config");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(userConfigDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns default config when no config files exist", () => {
    const store = new ConfigStore({ customUserConfigDir: userConfigDir });
    const config = store.loadConfig(projectDir);
    expect(config.defaultModel).toBe(DEFAULT_CONFIG.defaultModel);
    expect(config.temperature).toBe(0.2);
  });

  it("merges user config and project config with correct priority", () => {
    const store = new ConfigStore({ customUserConfigDir: userConfigDir });

    // Save user config
    store.saveUserConfig({
      defaultModel: "user/custom-model",
      temperature: 0.5,
    });

    // Save project config
    store.saveProjectConfig(projectDir, {
      temperature: 0.8,
    });

    // Load config with CLI options overriding project config
    const config = store.loadConfig(projectDir, {
      maxTokens: 2048,
    });

    expect(config.defaultModel).toBe("user/custom-model"); // from user config
    expect(config.temperature).toBe(0.8); // from project config
    expect(config.maxTokens).toBe(2048); // from CLI options
  });
});
