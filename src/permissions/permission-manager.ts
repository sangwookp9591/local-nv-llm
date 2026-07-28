import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type PermissionMode = "read" | "write" | "execute";
export type PermissionScope = "once" | "goal" | "session" | "always";
export type RiskLevel = "low" | "medium" | "high";
export type PermissionStatus = "pending" | "approved" | "denied" | "revoked";

export interface PermissionRequest {
  id: string;
  requestedPath: string;
  normalizedPath: string;
  modes: PermissionMode[];
  reason: string;
  riskLevel: RiskLevel;
  status: PermissionStatus;
  scope?: PermissionScope;
  requestedAt: string;
}

export interface PermissionGrant {
  path: string;
  modes: PermissionMode[];
  scope: PermissionScope;
  grantedAt: string;
}

export interface PermissionManagerOptions {
  storageDir?: string;
  allowedRoots?: string[];
}

const HIGH_RISK_PATTERNS = [
  /^\/$/,
  /^\/etc(\/.*)?$/,
  /^\/bin(\/.*)?$/,
  /^\/sbin(\/.*)?$/,
  /^\/usr(\/.*)?$/,
  /^\/var(\/.*)?$/,
  /^\/System(\/.*)?$/,
  /^\/Library(\/.*)?$/,
  /\/\.ssh(\/.*)?$/,
  /\/\.aws(\/.*)?$/,
  /\/\.gnupg(\/.*)?$/,
];

export class PermissionManager {
  private requests = new Map<string, PermissionRequest>();
  private grants = new Map<string, PermissionGrant>();
  private allowedRoots: string[];

  constructor(options?: PermissionManagerOptions) {
    this.allowedRoots = options?.allowedRoots ?? [process.cwd()];
  }

  public getRiskLevel(targetPath: string): RiskLevel {
    const normalized = path.resolve(targetPath);
    for (const pattern of HIGH_RISK_PATTERNS) {
      if (pattern.test(normalized)) {
        return "high";
      }
    }
    return "low";
  }

  public checkPermission(targetPath: string, mode: PermissionMode): boolean {
    const normalized = path.resolve(targetPath);

    // 1. Check default allowed roots
    for (const root of this.allowedRoots) {
      if (normalized.startsWith(path.resolve(root))) {
        return true;
      }
    }

    // 2. Check explicitly granted permissions
    for (const grant of this.grants.values()) {
      if (normalized.startsWith(grant.path) && grant.modes.includes(mode)) {
        return true;
      }
    }

    return false;
  }

  public createRequest(
    targetPath: string,
    modes: PermissionMode[],
    reason: string,
    riskLevel?: RiskLevel
  ): PermissionRequest {
    const normalized = path.resolve(targetPath);
    const id = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const req: PermissionRequest = {
      id,
      requestedPath: targetPath,
      normalizedPath: normalized,
      modes,
      reason,
      riskLevel: riskLevel ?? this.getRiskLevel(targetPath),
      status: "pending",
      requestedAt: new Date().toISOString(),
    };

    this.requests.set(id, req);
    return req;
  }

  public approveRequest(id: string, scope: PermissionScope = "session"): boolean {
    const req = this.requests.get(id);
    if (!req) return false;

    req.status = "approved";
    req.scope = scope;

    this.grants.set(req.normalizedPath, {
      path: req.normalizedPath,
      modes: req.modes,
      scope,
      grantedAt: new Date().toISOString(),
    });

    return true;
  }

  public denyRequest(id: string): boolean {
    const req = this.requests.get(id);
    if (!req) return false;
    req.status = "denied";
    return true;
  }

  public revokePath(targetPath: string): boolean {
    const normalized = path.resolve(targetPath);
    return this.grants.delete(normalized);
  }

  public clearGoalPermissions(): void {
    for (const [pathKey, grant] of this.grants.entries()) {
      if (grant.scope === "goal" || grant.scope === "once") {
        this.grants.delete(pathKey);
      }
    }
  }

  public clearSessionPermissions(): void {
    for (const [pathKey, grant] of this.grants.entries()) {
      if (grant.scope !== "always") {
        this.grants.delete(pathKey);
      }
    }
  }

  public listGrants(): PermissionGrant[] {
    return Array.from(this.grants.values());
  }

  public listRequests(): PermissionRequest[] {
    return Array.from(this.requests.values());
  }
}
