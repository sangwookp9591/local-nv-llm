import fs from "node:fs";
import path from "node:path";

export interface ProjectCandidate {
  name: string;
  path: string;
  marker: string;
}

export const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pnpm-workspace.yaml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "pom.xml",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "AGENTS.md",
  "CLAUDE.md",
];

export class ProjectDiscovery {
  private baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = path.resolve(baseDir);
  }

  public detectProjectRoot(startDir: string = this.baseDir): string | null {
    let current = path.resolve(startDir);
    while (current) {
      for (const marker of PROJECT_MARKERS) {
        if (fs.existsSync(path.join(current, marker))) {
          return current;
        }
      }
      const parent = path.dirname(current);
      if (parent === current) break; // Reached filesystem root
      current = parent;
    }
    return null;
  }

  public findCandidates(
    searchDir: string = this.baseDir,
    maxDepth = 4,
    maxDurationMs = 5000
  ): ProjectCandidate[] {
    const candidates: ProjectCandidate[] = [];
    const root = path.resolve(searchDir);
    const startTime = Date.now();

    const traverse = (dir: string, depth: number) => {
      if (depth > maxDepth || Date.now() - startTime > maxDurationMs) return;

      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith(".") && item.name !== ".git") continue;
          if (item.name === "node_modules" || item.name === "dist") continue;

          const fullPath = path.join(dir, item.name);
          if (PROJECT_MARKERS.includes(item.name)) {
            candidates.push({
              name: path.basename(dir),
              path: dir,
              marker: item.name,
            });
            // Stop recursing further down this project root
            return;
          }
        }

        for (const item of items) {
          if (item.isDirectory() && !item.name.startsWith(".") && item.name !== "node_modules") {
            traverse(path.join(dir, item.name), depth + 1);
          }
        }
      } catch {
        // ignore unreadable dirs
      }
    };

    traverse(root, 0);
    return candidates;
  }
}
