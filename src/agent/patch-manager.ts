import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface FileChangeSnapshot {
  id: string;
  sessionId: string;
  path: string;
  existedBefore: boolean;
  originalContent?: string;
  modifiedContent?: string;
  timestamp: string;
}

export interface PatchManagerOptions {
  storageDir?: string;
}

export class PatchManager {
  private storageDir: string;
  private snapshotsFile: string;

  constructor(options?: PatchManagerOptions) {
    if (options?.storageDir) {
      this.storageDir = options.storageDir;
    } else {
      const configHome =
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
      this.storageDir = path.join(configHome, "nv", "patches");
    }
    this.snapshotsFile = path.join(this.storageDir, "snapshots.json");
  }

  private loadSnapshots(): FileChangeSnapshot[] {
    if (!fs.existsSync(this.snapshotsFile)) return [];
    try {
      const raw = fs.readFileSync(this.snapshotsFile, "utf-8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private saveSnapshots(snapshots: FileChangeSnapshot[]): void {
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.writeFileSync(
      this.snapshotsFile,
      JSON.stringify(snapshots, null, 2),
      "utf-8"
    );
  }

  public recordSnapshot(params: Omit<FileChangeSnapshot, "id" | "timestamp">): FileChangeSnapshot {
    const snapshots = this.loadSnapshots();
    const snapshot: FileChangeSnapshot = {
      ...params,
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    snapshots.push(snapshot);
    this.saveSnapshots(snapshots);
    return snapshot;
  }

  public getSnapshotsForSession(sessionId: string): FileChangeSnapshot[] {
    return this.loadSnapshots().filter((s) => s.sessionId === sessionId);
  }

  public undoLastChange(sessionId?: string): string[] {
    const all = this.loadSnapshots();
    if (all.length === 0) return [];

    let targetSnapshots: FileChangeSnapshot[] = [];
    if (sessionId) {
      targetSnapshots = all.filter((s) => s.sessionId === sessionId);
    } else {
      targetSnapshots = all;
    }

    if (targetSnapshots.length === 0) return [];

    // Find the latest batch timestamp or the latest snapshot
    const lastSnapshot = targetSnapshots[targetSnapshots.length - 1];
    const latestTimestamp = lastSnapshot.timestamp;
    
    // Group snapshots made in the same operation (within 5 seconds)
    const batchTime = new Date(latestTimestamp).getTime();
    const toUndo = targetSnapshots.filter(
      (s) => Math.abs(new Date(s.timestamp).getTime() - batchTime) <= 5000
    );

    const undonePaths: string[] = [];

    for (const snap of toUndo) {
      if (snap.existedBefore) {
        if (snap.originalContent !== undefined) {
          fs.mkdirSync(path.dirname(snap.path), { recursive: true });
          fs.writeFileSync(snap.path, snap.originalContent, "utf-8");
          undonePaths.push(snap.path);
        }
      } else {
        // Was created by agent -> delete file
        if (fs.existsSync(snap.path)) {
          fs.unlinkSync(snap.path);
          undonePaths.push(snap.path);
        }
      }
    }

    // Remove undone snapshots from list
    const remaining = all.filter((s) => !toUndo.some((u) => u.id === s.id));
    this.saveSnapshots(remaining);

    return undonePaths;
  }
}
