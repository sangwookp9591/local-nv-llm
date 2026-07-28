import { describe, it, expect } from "vitest";
import { formatHeaderBanner, formatToolBox } from "./ui-theme.js";

describe("Claude & Gemini CLI UI Theme", () => {
  it("renders a stylized header banner", () => {
    const banner = formatHeaderBanner({
      version: "1.0.0",
      model: "nvidia/nemotron-3-super-120b-a12b",
      mode: "AGENT",
      cwd: "/projects/local-llm",
    });

    expect(banner).toContain("NV Terminal AI");
    expect(banner).toContain("nemotron-3-super-120b");
    expect(banner).toContain("AGENT");
  });

  it("renders Claude Code style tool execution box", () => {
    const toolBox = formatToolBox("read_file", { path: "src/cli.ts" }, "success", "15ms");
    expect(toolBox).toContain("read_file");
    expect(toolBox).toContain("src/cli.ts");
  });
});
