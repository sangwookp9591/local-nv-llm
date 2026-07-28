import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolRegistry } from "./tool-registry.js";

describe("ToolRegistry Extended Tools", () => {
  let tempDir: string;
  let registry: ToolRegistry;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-tool-ext-test-"));
    registry = new ToolRegistry(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("moves and deletes files safely", async () => {
    const fromPath = path.join(tempDir, "orig.txt");
    fs.writeFileSync(fromPath, "move text");

    const moveRes = await registry.executeTool(
      "move_file",
      { fromPath: "orig.txt", toPath: "moved.txt" },
      "session-1"
    );
    expect(moveRes.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "moved.txt"))).toBe(true);

    const deleteRes = await registry.executeTool(
      "delete_file",
      { path: "moved.txt" },
      "session-1"
    );
    expect(deleteRes.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "moved.txt"))).toBe(false);
  });

  it("returns error for unknown tool execution", async () => {
    const res = await registry.executeTool("invalid_tool", {}, "session-1");
    expect(res.success).toBe(false);
    expect(res.error).toContain("알 수 없는 도구명");
  });
});
