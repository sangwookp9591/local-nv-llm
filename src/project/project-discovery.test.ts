import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectDiscovery } from "./project-discovery.js";

describe("ProjectDiscovery", () => {
  let tempDir: string;
  let discovery: ProjectDiscovery;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-project-test-"));
    discovery = new ProjectDiscovery(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects project roots using markers like package.json or .git", () => {
    const subProj = path.join(tempDir, "sub-app");
    fs.mkdirSync(subProj, { recursive: true });
    fs.writeFileSync(path.join(subProj, "package.json"), "{}");

    const result = discovery.detectProjectRoot(subProj);
    expect(result).toBe(subProj);
  });

  it("finds candidate projects under given directory tree safely", () => {
    const proj1 = path.join(tempDir, "ZIVO_BACK");
    const proj2 = path.join(tempDir, "ZIVO_FRONT");
    fs.mkdirSync(proj1, { recursive: true });
    fs.mkdirSync(proj2, { recursive: true });
    fs.writeFileSync(path.join(proj1, "build.gradle"), "// gradle");
    fs.writeFileSync(path.join(proj2, "package.json"), "{}");

    const candidates = discovery.findCandidates(tempDir);
    expect(candidates.length).toBe(2);
    expect(candidates.map((c) => c.name)).toContain("ZIVO_BACK");
    expect(candidates.map((c) => c.name)).toContain("ZIVO_FRONT");
  });
});
