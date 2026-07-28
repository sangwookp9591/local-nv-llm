import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  LlmProvider,
  ChatRequest,
  ChatEventChunk,
  ModelCapability,
} from "../provider.js";
import { parseSseStream } from "./stream.js";
import { BUNDLED_MODELS, normalizeModelCapability } from "./capabilities.js";
import { normalizeNvidiaError } from "./errors.js";
import { RequestScheduler } from "../../rate-limit/request-scheduler.js";

export class NvidiaProvider implements LlmProvider {
  private baseUrl = "https://integrate.api.nvidia.com/v1";
  private cacheFilePath: string;
  private scheduler: RequestScheduler;

  constructor(scheduler?: RequestScheduler) {
    const configHome =
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    const cacheDir = path.join(configHome, "nv");
    this.cacheFilePath = path.join(cacheDir, "models-cache.json");
    this.scheduler = scheduler ?? new RequestScheduler();
  }

  public getScheduler(): RequestScheduler {
    return this.scheduler;
  }

  public async validateCredential(apiKey: string): Promise<boolean> {
    if (!apiKey || typeof apiKey !== "string") return false;
    const trimmed = apiKey.trim();
    if (!trimmed.startsWith("nvapi-") && trimmed.length < 10) {
      return false;
    }

    try {
      return await this.scheduler.schedule({
        provider: "nvidia",
        modelId: "validation",
        apiKey: trimmed,
        requestType: "validateCredential",
        priority: "maintenance",
        execute: async () => {
          const response = await fetch(`${this.baseUrl}/models`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${trimmed}`,
              Accept: "application/json",
            },
          });
          if (response.status === 401 || response.status === 403) {
            return false;
          }
          return response.ok;
        },
      });
    } catch (err) {
      throw normalizeNvidiaError(err);
    }
  }

  public async listModels(apiKey: string): Promise<ModelCapability[]> {
    const trimmed = apiKey.trim();

    try {
      const models = await this.scheduler.schedule({
        provider: "nvidia",
        modelId: "catalog",
        apiKey: trimmed,
        requestType: "listModels",
        priority: "interactive",
        execute: async () => {
          const response = await fetch(`${this.baseUrl}/models`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${trimmed}`,
              Accept: "application/json",
            },
          });

          if (response.ok) {
            const body = (await response.json()) as { data?: Record<string, unknown>[] };
            if (Array.isArray(body.data) && body.data.length > 0) {
              const items = body.data.map(normalizeModelCapability);
              this.saveModelCache(items);
              return items;
            }
          }
          throw new Error("Failed to fetch models");
        },
      });
      return models;
    } catch {
      // Fallback 1: Cached models
      const cached = this.loadModelCache();
      if (cached && cached.length > 0) {
        return cached;
      }
      // Fallback 2: Bundled models
      return BUNDLED_MODELS;
    }
  }

  private saveModelCache(models: ModelCapability[]): void {
    try {
      fs.mkdirSync(path.dirname(this.cacheFilePath), { recursive: true });
      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify({ fetchedAt: new Date().toISOString(), models }, null, 2),
        "utf-8"
      );
    } catch {
      // ignore
    }
  }

  private loadModelCache(): ModelCapability[] | null {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.models)) {
          return parsed.models;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  public async *chat(
    apiKey: string,
    request: ChatRequest
  ): AsyncIterable<ChatEventChunk> {
    const trimmed = apiKey.trim();
    const payload: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      stream: request.stream ?? true,
    };

    if (request.temperature !== undefined) payload.temperature = request.temperature;
    if (request.max_tokens !== undefined) payload.max_tokens = request.max_tokens;
    if (request.top_p !== undefined) payload.top_p = request.top_p;
    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools;
      if (request.tool_choice) payload.tool_choice = request.tool_choice;
    }

    try {
      const responseStream = await this.scheduler.schedule({
        provider: "nvidia",
        modelId: request.model,
        apiKey: trimmed,
        requestType: "chat",
        priority: "interactive",
        execute: async (signal) => {
          const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${trimmed}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify(payload),
            signal: request.signal || signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = `NVIDIA API Error (${response.status}): ${response.statusText}`;
            try {
              const errObj = JSON.parse(errorText);
              if (errObj.error?.message) {
                errorMsg = errObj.error.message;
              }
            } catch {
              // ignore
            }
            const errObj = new Error(errorMsg);
            (errObj as any).statusCode = response.status;
            (errObj as any).headers = response.headers;
            throw normalizeNvidiaError(errObj);
          }

          if (!response.body) {
            throw new Error("API 응답 바디가 비어 있습니다.");
          }

          return response.body as unknown as AsyncIterable<Uint8Array>;
        },
      });

      yield* parseSseStream(responseStream);
    } catch (err) {
      const norm = normalizeNvidiaError(err);
      yield { type: "error", error: norm.message };
    }
  }

  public async supportsTools(apiKey: string, modelId: string): Promise<boolean> {
    const models = await this.listModels(apiKey);
    const found = models.find((m) => m.id.toLowerCase() === modelId.toLowerCase());
    if (found) {
      return found.toolCalling;
    }
    const normalized = normalizeModelCapability({ id: modelId });
    return normalized.toolCalling;
  }
}
