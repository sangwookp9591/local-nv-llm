import { describe, it, expect, vi } from "vitest";
import { AgentLoop } from "./agent-loop.js";
import { ToolRegistry } from "./tool-registry.js";
import { LlmProvider, ChatRequest } from "../providers/provider.js";

describe("AgentLoop", () => {
  it("runs multi-step tool execution loop until final answer is provided", async () => {
    let callCount = 0;

    const mockProvider: LlmProvider = {
      validateCredential: async () => true,
      listModels: async () => [],
      supportsTools: async () => true,
      chat: async function* (apiKey: string, request: ChatRequest) {
        callCount++;
        if (callCount === 1) {
          yield {
            type: "tool_call",
            toolCall: {
              index: 0,
              id: "call_1",
              name: "list_directory",
              argumentsDelta: '{"path":"."}',
            },
          };
        } else {
          yield { type: "content", content: "Final analysis complete." };
        }
      },
    };

    const toolRegistry = new ToolRegistry();
    const agentLoop = new AgentLoop({
      provider: mockProvider,
      apiKey: "nvapi-test",
      toolRegistry,
      maxSteps: 5,
    });

    const result = await agentLoop.run({
      modelId: "nvidia/nemotron-3-super-120b-a12b",
      messages: [{ role: "user", content: "List files" }],
      sessionId: "session-test",
    });

    expect(callCount).toBe(2);
    expect(result.finalAnswer).toBe("Final analysis complete.");
    expect(result.executedSteps.length).toBe(1);
    expect(result.executedSteps[0].toolName).toBe("list_directory");
  });
});
