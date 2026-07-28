import { ModelCapability } from "../provider.js";

export const BUNDLED_MODELS: ModelCapability[] = [
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    name: "NVIDIA Nemotron 3 Super 120B",
    provider: "nvidia",
    chat: true,
    coding: true,
    reasoning: true,
    toolCalling: true,
    vision: false,
    streaming: true,
    contextWindow: 131072,
    maxOutputTokens: 8192,
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b",
    name: "NVIDIA Nemotron 3 Nano 30B",
    provider: "nvidia",
    chat: true,
    coding: true,
    reasoning: false,
    toolCalling: true,
    vision: false,
    streaming: true,
    contextWindow: 32768,
    maxOutputTokens: 4096,
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    name: "Meta Llama 3.3 70B Instruct",
    provider: "nvidia",
    chat: true,
    coding: true,
    reasoning: false,
    toolCalling: true,
    vision: false,
    streaming: true,
    contextWindow: 128000,
    maxOutputTokens: 4096,
  },
  {
    id: "deepseek-ai/deepseek-r1",
    name: "DeepSeek R1 Reasoning",
    provider: "nvidia",
    chat: true,
    coding: true,
    reasoning: true,
    toolCalling: false,
    vision: false,
    streaming: true,
    contextWindow: 64000,
    maxOutputTokens: 8192,
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Moonshot Kimi K2.5",
    provider: "nvidia",
    chat: true,
    coding: true,
    reasoning: true,
    toolCalling: true,
    vision: true,
    streaming: true,
    contextWindow: 128000,
    maxOutputTokens: 4096,
  },
  {
    id: "z-ai/glm-4.7",
    name: "GLM 4.7",
    provider: "nvidia",
    chat: true,
    coding: true,
    reasoning: true,
    toolCalling: true,
    vision: false,
    streaming: true,
    contextWindow: 128000,
    maxOutputTokens: 4096,
  },
];

export function normalizeModelCapability(rawModel: Record<string, unknown>): ModelCapability {
  const id = String(rawModel.id || rawModel.name || "unknown");
  const lowerId = id.toLowerCase();

  // Find existing bundled match if available
  const existing = BUNDLED_MODELS.find((m) => m.id.toLowerCase() === lowerId);
  if (existing) {
    return existing;
  }

  const isCoding =
    lowerId.includes("coder") ||
    lowerId.includes("coding") ||
    lowerId.includes("nemotron") ||
    lowerId.includes("llama") ||
    lowerId.includes("deepseek") ||
    lowerId.includes("qwen") ||
    lowerId.includes("starcoder");

  const isReasoning =
    lowerId.includes("r1") ||
    lowerId.includes("reasoning") ||
    lowerId.includes("super") ||
    lowerId.includes("o1") ||
    lowerId.includes("thinking");

  const isVision =
    lowerId.includes("vision") ||
    lowerId.includes("vl") ||
    lowerId.includes("multimodal") ||
    lowerId.includes("kimi");

  const isToolCalling =
    !lowerId.includes("r1") &&
    (lowerId.includes("instruct") ||
      lowerId.includes("nemotron") ||
      lowerId.includes("llama") ||
      lowerId.includes("qwen") ||
      lowerId.includes("gpt") ||
      lowerId.includes("glm"));

  return {
    id,
    name: id,
    provider: "nvidia",
    chat: true,
    coding: isCoding,
    reasoning: isReasoning,
    toolCalling: isToolCalling,
    vision: isVision,
    streaming: true,
  };
}
