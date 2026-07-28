import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PatchManager } from "./patch-manager.js";

describe("PatchManager", () => {
  let tempDir: string;
  let patchManager: PatchManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-patch-test-"));
    patchManager = new PatchManager({ storageDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("records file modifications and successfully undoes them", () => {
    const targetFile = path.join(tempDir, "test.txt");
    fs.writeFileSync(targetFile, "Original Content", "utf-8");

    // Record change before modification
    patchManager.recordSnapshot({
      sessionId: "session-1",
      path: targetFile,
      existedBefore: true,
      originalContent: "Original Content",
      modifiedContent: "New Content",
    });

    // Apply modification
    fs.writeFileSync(targetFile, "New Content", "utf-8");
    expect(fs.readFileSync(targetFile, "utf-8")).toBe("New Content");

    // Perform Undo
    const undoneFiles = patchManager.undoLastChange("session-1");
    expect(undoneFiles).toContain(targetFile);
    expect(fs.readFileSync(targetFile, "utf-8")).toBe("Original Content");
  });

  it("handles undo for newly created files by deleting them", () => {
    const targetFile = path.join(tempDir, "new-file.txt");

    patchManager.recordSnapshot({
      sessionId: "session-1",
      path: targetFile,
      existedBefore: false,
      modifiedContent: "Created file",
    });

    fs.writeFileSync(targetFile, "Created file", "utf-8");
    expect(fs.existsSync(targetFile)).toBe(true);

    patchManager.undoLastChange("session-1");
    expect(fs.existsSync(targetFile)).toBe(false);
  });
});
