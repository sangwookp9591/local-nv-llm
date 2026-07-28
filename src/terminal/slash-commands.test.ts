import { describe, it, expect } from "vitest";
import { parseSlashCommand } from "./slash-commands.js";

describe("Slash Commands Parser", () => {
  it("parses valid slash commands correctly", () => {
    const res1 = parseSlashCommand("/model nvidia/nemotron-3-super");
    expect(res1).toEqual({ command: "model", args: "nvidia/nemotron-3-super" });

    const res2 = parseSlashCommand("/compact");
    expect(res2).toEqual({ command: "compact", args: "" });

    const res3 = parseSlashCommand("  /help");
    expect(res3).toEqual({ command: "help", args: "" });
  });

  it("returns null for non-slash inputs", () => {
    expect(parseSlashCommand("Hello world")).toBeNull();
    expect(parseSlashCommand("Just a normal question")).toBeNull();
  });
});
