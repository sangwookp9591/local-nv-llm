import { LlmProvider, ChatMessage, ChatRequest } from "../providers/provider.js";
import { ToolRegistry } from "./tool-registry.js";
import { StreamThinkFilter } from "../providers/nvidia/stream-filter.js";

export interface AgentLoopOptions {
  provider: LlmProvider;
  apiKey: string;
  toolRegistry: ToolRegistry;
  maxSteps?: number;
}

export interface ExecutedStep {
  step: number;
  toolName: string;
  args: Record<string, unknown>;
  output: string;
  success: boolean;
}

export interface AgentLoopResult {
  finalAnswer: string;
  messages: ChatMessage[];
  executedSteps: ExecutedStep[];
}

export class AgentLoop {
  private options: AgentLoopOptions;
  private maxSteps: number;

  constructor(options: AgentLoopOptions) {
    this.options = options;
    this.maxSteps = options.maxSteps ?? 10;
  }

  public async run(params: {
    modelId: string;
    messages: ChatMessage[];
    sessionId: string;
    onChunk?: (text: string) => void;
    onToolStart?: (name: string, args: Record<string, unknown>) => void;
    onToolEnd?: (name: string, output: string, success: boolean) => void;
  }): Promise<AgentLoopResult> {
    const messages = [...params.messages];
    const executedSteps: ExecutedStep[] = [];
    let step = 0;
    let finalAnswer = "";

    const thinkFilter = new StreamThinkFilter();

    while (step < this.maxSteps) {
      step++;
      const request: ChatRequest = {
        model: params.modelId,
        messages,
        tools: this.options.toolRegistry.getToolDefinitions(),
        stream: true,
      };

      let currentContent = "";
      const currentToolCalls: Array<{ id: string; name: string; argsStr: string }> = [];

      for await (const chunk of this.options.provider.chat(this.options.apiKey, request)) {
        if (chunk.type === "content" && chunk.content) {
          const filtered = thinkFilter.process(chunk.content);
          if (filtered) {
            currentContent += filtered;
            params.onChunk?.(filtered);
          }
        } else if (chunk.type === "tool_call" && chunk.toolCall) {
          const tc = chunk.toolCall;
          if (tc.name) {
            currentToolCalls.push({
              id: tc.id || `call_${Date.now()}_${currentToolCalls.length}`,
              name: tc.name,
              argsStr: tc.argumentsDelta || "",
            });
          } else if (currentToolCalls.length > 0 && tc.argumentsDelta) {
            currentToolCalls[currentToolCalls.length - 1].argsStr += tc.argumentsDelta;
          }
        }
      }

      if (currentContent) {
        finalAnswer += currentContent;
        messages.push({ role: "assistant", content: currentContent });
      }

      // If no tool calls were requested, the loop has completed the final answer
      if (currentToolCalls.length === 0) {
        break;
      }

      // Execute tool calls
      for (const tc of currentToolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.argsStr);
        } catch {
          parsedArgs = {};
        }

        params.onToolStart?.(tc.name, parsedArgs);

        const res = await this.options.toolRegistry.executeTool(
          tc.name,
          parsedArgs,
          params.sessionId
        );

        const outputText = res.output || res.error || "Done";
        params.onToolEnd?.(tc.name, outputText, res.success);

        executedSteps.push({
          step,
          toolName: tc.name,
          args: parsedArgs,
          output: outputText,
          success: res.success,
        });

        messages.push({
          role: "tool",
          content: outputText,
          tool_call_id: tc.id,
        });
      }
    }

    return {
      finalAnswer,
      messages,
      executedSteps,
    };
  }
}
