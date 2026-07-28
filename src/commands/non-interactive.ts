import { LlmProvider, ChatRequest } from "../providers/provider.js";
import { NvidiaProvider } from "../providers/nvidia/client.js";
import { redactSensitiveText } from "../auth/redaction.js";
import { buildSystemPrompt, RuntimeContext } from "../prompts/system-prompt.js";
import { StreamThinkFilter } from "../providers/nvidia/stream-filter.js";

export interface NonInteractiveOptions {
  prompt: string;
  apiKey: string;
  modelId: string;
  json?: boolean;
  provider?: LlmProvider;
  mode?: "chat" | "agent";
  cwd?: string;
}

export async function runNonInteractivePrompt(
  options: NonInteractiveOptions
): Promise<string> {
  const provider = options.provider ?? new NvidiaProvider();
  const cwd = options.cwd ?? process.cwd();
  const mode = options.mode ?? "chat";

  const runtimeContext: RuntimeContext = {
    applicationName: "NV Terminal AI",
    provider: "NVIDIA",
    modelId: options.modelId,
    mode,
    workingDirectory: cwd,
    sessionId: `non-interactive-${Date.now()}`,
    tools: ["list_directory", "read_file", "create_file", "run_command"],
    toolCallingSupported: true,
  };

  const systemPrompt = buildSystemPrompt(runtimeContext);

  const request: ChatRequest = {
    model: options.modelId,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: options.prompt,
      },
    ],
    stream: true,
  };

  let fullResponse = "";
  const thinkFilter = new StreamThinkFilter();

  for await (const chunk of provider.chat(options.apiKey, request)) {
    if (chunk.type === "content" && chunk.content) {
      const filtered = thinkFilter.process(chunk.content);
      fullResponse += filtered;
    } else if (chunk.type === "error" && chunk.error) {
      throw new Error(chunk.error);
    }
  }

  // Redact API key if present in response
  fullResponse = redactSensitiveText(fullResponse, [options.apiKey]);

  if (options.json) {
    return JSON.stringify(
      {
        model: options.modelId,
        prompt: options.prompt,
        response: fullResponse,
      },
      null,
      2
    );
  }

  return fullResponse;
}
