import { LlmProvider, ChatRequest } from "../providers/provider.js";
import { NvidiaProvider } from "../providers/nvidia/client.js";
import { redactSensitiveText } from "../auth/redaction.js";

export interface NonInteractiveOptions {
  prompt: string;
  apiKey: string;
  modelId: string;
  json?: boolean;
  provider?: LlmProvider;
}

export async function runNonInteractivePrompt(
  options: NonInteractiveOptions
): Promise<string> {
  const provider = options.provider ?? new NvidiaProvider();
  const request: ChatRequest = {
    model: options.modelId,
    messages: [
      {
        role: "system",
        content:
          "You are NV, an expert terminal AI coding assistant. Provide clear, accurate, concise answers.",
      },
      {
        role: "user",
        content: options.prompt,
      },
    ],
    stream: true,
  };

  let fullResponse = "";
  let reasoning = "";

  for await (const chunk of provider.chat(options.apiKey, request)) {
    if (chunk.type === "content" && chunk.content) {
      fullResponse += chunk.content;
    } else if (chunk.type === "reasoning" && chunk.reasoning) {
      reasoning += chunk.reasoning;
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
        reasoning: reasoning || undefined,
        response: fullResponse,
      },
      null,
      2
    );
  }

  return fullResponse;
}
