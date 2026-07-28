export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  signal?: AbortSignal;
}

export interface ChatEventChunk {
  type: "content" | "reasoning" | "tool_call" | "usage" | "done" | "error";
  content?: string;
  reasoning?: string;
  toolCall?: {
    index: number;
    id?: string;
    name?: string;
    argumentsDelta?: string;
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
}

export interface ModelCapability {
  id: string;
  name: string;
  provider: "nvidia";
  chat: boolean;
  coding: boolean;
  reasoning: boolean;
  toolCalling: boolean;
  vision: boolean;
  streaming: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface LlmProvider {
  validateCredential(apiKey: string): Promise<boolean>;
  listModels(apiKey: string): Promise<ModelCapability[]>;
  chat(apiKey: string, request: ChatRequest): AsyncIterable<ChatEventChunk>;
  supportsTools(apiKey: string, modelId: string): Promise<boolean>;
}
