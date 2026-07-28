import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PermissionManager } from "./permission-manager.js";

describe("PermissionManager", () => {
  let tempDir: string;
  let manager: PermissionManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-perm-test-"));
    manager = new PermissionManager({ storageDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("classifies risk levels for normal vs sensitive system paths", () => {
    expect(manager.getRiskLevel("/Users/user/project/src")).toBe("low");
    expect(manager.getRiskLevel("/etc/passwd")).toBe("high");
    expect(manager.getRiskLevel(path.join(os.homedir(), ".ssh/id_rsa"))).toBe("high");
  });

  it("handles permission requests and approvals with session & goal scope", () => {
    const targetPath = path.join(tempDir, "external-project");

    // Initially not allowed for external path outside initial root
    expect(manager.checkPermission(targetPath, "read")).toBe(false);

    // Create permission request
    const req = manager.createRequest(targetPath, ["read"], "Project analysis", "low");
    expect(req.status).toBe("pending");

    // Approve with session scope
    manager.approveRequest(req.id, "session");
    expect(manager.checkPermission(targetPath, "read")).toBe(true);

    // Revoke permission
    manager.revokePath(targetPath);
    expect(manager.checkPermission(targetPath, "read")).toBe(false);
  });
});
