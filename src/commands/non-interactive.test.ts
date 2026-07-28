import { describe, it, expect, vi } from "vitest";
import { runNonInteractivePrompt } from "./non-interactive.js";

describe("Non-interactive Execution", () => {
  it("formats json output when json flag is true", async () => {
    const mockProvider = {
      chat: async function* () {
        yield { type: "content", content: "Analysis complete." };
        yield { type: "done" };
      },
    };

    const output = await runNonInteractivePrompt({
      prompt: "Analyze project",
      apiKey: "nvapi-testkey",
      modelId: "nvidia/nemotron-3-super-120b-a12b",
      json: true,
      provider: mockProvider as any,
    });

    const parsed = JSON.parse(output);
    expect(parsed.prompt).toBe("Analyze project");
    expect(parsed.response).toBe("Analysis complete.");
  });
});
