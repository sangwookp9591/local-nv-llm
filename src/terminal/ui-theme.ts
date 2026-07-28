import chalk from "chalk";

export interface HeaderBannerOptions {
  version: string;
  model: string;
  mode: string;
  cwd: string;
}

export function formatHeaderBanner(opts: HeaderBannerOptions): string {
  const shortModel = opts.model.split("/").pop() || opts.model;
  const lines = [
    chalk.cyan.bold("✦ NV Terminal AI") + chalk.dim(` (v${opts.version})`),
    chalk.dim("─────────────────────────────────────────────────────────────"),
    `${chalk.bold("Model:")} ${chalk.green(shortModel)}  │  ${chalk.bold("Mode:")} ${chalk.yellow(opts.mode.toUpperCase())}  │  ${chalk.bold("Dir:")} ${chalk.dim(opts.cwd)}`,
    chalk.dim("─────────────────────────────────────────────────────────────"),
    chalk.dim("Type ") + chalk.cyan("/help") + chalk.dim(" for commands, ") + chalk.cyan("/goal") + chalk.dim(" for autonomous tasks, ") + chalk.cyan("Ctrl+C") + chalk.dim(" to exit."),
  ];

  return lines.join("\n");
}

export function formatToolBox(
  toolName: string,
  args: Record<string, unknown>,
  status: "running" | "success" | "error",
  durationText?: string,
  outputSnippet?: string
): string {
  const argStr = JSON.stringify(args);
  const formattedArg = Object.keys(args).length > 0 ? chalk.dim(` (${argStr.slice(0, 80)})`) : "";

  if (status === "running") {
    return chalk.cyan(`╭─ ⚙ Executing tool: `) + chalk.bold(toolName) + formattedArg;
  }

  if (status === "success") {
    const dur = durationText ? chalk.dim(` in ${durationText}`) : "";
    let res = chalk.green(`╰─ ✓ Tool `) + chalk.bold(toolName) + formattedArg + chalk.green(` succeeded`) + dur;
    if (outputSnippet) {
      res += `\n   ${chalk.dim(outputSnippet.slice(0, 120))}`;
    }
    return res;
  }

  return chalk.red(`╰─ ✗ Tool `) + chalk.bold(toolName) + formattedArg + chalk.red(` failed: ${outputSnippet || ""}`);
}

export function formatDiffSnippet(diffText: string): string {
  const lines = diffText.split("\n");
  const formatted = lines.map((line) => {
    if (line.startsWith("+")) return chalk.green(line);
    if (line.startsWith("-")) return chalk.red(line);
    if (line.startsWith("@")) return chalk.cyan(line);
    return chalk.dim(line);
  });
  return formatted.join("\n");
}
