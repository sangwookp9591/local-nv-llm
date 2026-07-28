import { ChatEventChunk } from "../provider.js";

export async function* parseSseStream(
  stream: AsyncIterable<Uint8Array>
): AsyncGenerator<ChatEventChunk> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last incomplete line in buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue; // Comment line or empty

      if (trimmed.startsWith("data:")) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") {
          yield { type: "done" };
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          if (!delta) continue;

          // Reasoning content (e.g. DeepSeek-R1 / Nemotron reasoning)
          if (delta.reasoning_content || delta.reasoning) {
            yield {
              type: "reasoning",
              reasoning: delta.reasoning_content || delta.reasoning,
            };
          }

          // Text content
          if (delta.content) {
            yield {
              type: "content",
              content: delta.content,
            };
          }

          // Tool calls
          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              yield {
                type: "tool_call",
                toolCall: {
                  index: tc.index ?? 0,
                  id: tc.id,
                  name: tc.function?.name,
                  argumentsDelta: tc.function?.arguments,
                },
              };
            }
          }

          // Usage information (if provided in stream)
          if (parsed.usage) {
            yield {
              type: "usage",
              usage: {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0,
              },
            };
          }
        } catch {
          // ignore JSON parse error in individual chunk
        }
      }
    }
  }

  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data:")) {
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === "[DONE]") {
        yield { type: "done" };
      }
    }
  }
}
