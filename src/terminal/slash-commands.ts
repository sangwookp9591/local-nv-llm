export interface SlashCommand {
  command: string;
  args: string;
}

export const KNOWN_SLASH_COMMANDS = [
  "help",
  "model",
  "models",
  "config",
  "status",
  "clear",
  "new",
  "history",
  "resume",
  "save",
  "export",
  "retry",
  "stop",
  "context",
  "compact",
  "agent",
  "chat",
  "plan",
  "diff",
  "undo",
  "shell",
  "exit",
  "limits",
  "rate",
  "queue",
  "usage",
  "retries",
  "continue",
];

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.slice(1).trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(" ");

  return { command: cmd, args };
}
