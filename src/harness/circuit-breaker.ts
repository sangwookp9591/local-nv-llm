import crypto from "node:crypto";
import { ActionFingerprint, FailureRecord, ToolErrorType } from "./types.js";

export class CircuitBreaker {
  private failureThreshold: number;
  private records = new Map<string, FailureRecord>();

  constructor(failureThreshold = 2) {
    this.failureThreshold = failureThreshold;
  }

  public createFingerprint(
    toolName: string,
    args: Record<string, unknown>,
    cwd: string
  ): ActionFingerprint {
    const normalizedArgs = JSON.stringify(args, Object.keys(args).sort());
    const raw = `${toolName}:${normalizedArgs}:${cwd}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);

    return {
      toolName,
      normalizedArgs,
      workingDirectory: cwd,
      hash,
    };
  }

  public shouldBlock(hash: string): boolean {
    const record = this.records.get(hash);
    if (!record) return false;
    return record.isOpen;
  }

  public recordFailure(hash: string, errorType: ToolErrorType): void {
    let record = this.records.get(hash);
    if (!record) {
      record = {
        fingerprint: hash,
        errorType,
        attempts: 0,
        lastFailedAt: Date.now(),
        isOpen: false,
      };
      this.records.set(hash, record);
    }

    record.attempts++;
    record.lastFailedAt = Date.now();
    record.errorType = errorType;

    if (record.attempts >= this.failureThreshold) {
      record.isOpen = true;
    }
  }

  public recordSuccess(hash: string): void {
    this.records.delete(hash);
  }

  public getRecord(hash: string): FailureRecord | undefined {
    return this.records.get(hash);
  }

  public resetAll(): void {
    this.records.clear();
  }
}
