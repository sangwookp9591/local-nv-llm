import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolRegistry } from "./tool-registry.js";

describe("ToolRegistry", () => {
  let tempDir: string;
  let registry: ToolRegistry;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-tool-test-"));
    registry = new ToolRegistry(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("lists directory contents safely", async () => {
    fs.writeFileSync(path.join(tempDir, "file1.txt"), "hello");
    fs.mkdirSync(path.join(tempDir, "subDir"));

    const result = await registry.executeTool("list_directory", { path: "." }, "session-1");
    expect(result.success).toBe(true);
    expect(result.output).toContain("file1.txt");
    expect(result.output).toContain("subDir");
  });

  it("reads and creates files safely within project root", async () => {
    const createRes = await registry.executeTool(
      "create_file",
      { path: "hello.ts", content: "console.log('hi');" },
      "session-1"
    );
    expect(createRes.success).toBe(true);

    const readRes = await registry.executeTool("read_file", { path: "hello.ts" }, "session-1");
    expect(readRes.success).toBe(true);
    expect(readRes.output).toContain("console.log('hi');");
  });

  it("blocks path traversal tool calls", async () => {
    const res = await registry.executeTool("read_file", { path: "../secret.txt" }, "session-1");
    expect(res.success).toBe(false);
    expect(res.error).toContain("접근이 허용되지 않은 경로");
  });

  it("blocks dangerous commands in run_command tool", async () => {
    const res = await registry.executeTool("run_command", { command: "rm -rf /" }, "session-1");
    expect(res.success).toBe(false);
    expect(res.error).toContain("위험한 명령어");
  });
});
