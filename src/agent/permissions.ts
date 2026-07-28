import path from "node:path";
import fs from "node:fs";

export function isPathAllowed(projectRoot: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedTarget = path.resolve(targetPath);

  // Path traversal check
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    return false;
  }

  // Symlink escape check if target exists
  if (fs.existsSync(resolvedTarget)) {
    try {
      const realTarget = fs.realpathSync(resolvedTarget);
      const realRoot = fs.existsSync(resolvedRoot)
        ? fs.realpathSync(resolvedRoot)
        : resolvedRoot;

      if (!realTarget.startsWith(realRoot)) {
        return false;
      }
    } catch {
      // If realpath resolution fails, deny access safely
      return false;
    }
  }

  return true;
}

const DANGEROUS_PATTERNS = [
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b/i,
  /\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b/i,
  /\bsudo\b/i,
  /\bchmod\s+-[a-zA-Z]*R\b/i,
  /\bchown\s+-[a-zA-Z]*R\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-zA-Z]*f\b/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bcurl\b.*\|\s*(sh|bash|zsh)\b/i,
  /\bwget\b.*\|\s*(sh|bash|zsh)\b/i,
  /\b(shutdown|reboot|poweroff)\b/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
];

export function isCommandDangerous(command: string): boolean {
  const trimmed = command.trim();
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  return false;
}
