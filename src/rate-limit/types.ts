export type RateLimitMode = "auto" | "fixed" | "disabled";

export type RequestPriority =
  | "interactive"
  | "agent"
  | "background"
  | "maintenance";

export interface NvidiaRateLimitConfig {
  mode: RateLimitMode;
  fallbackRpm: number;
  maxRpm: number;
  initialConcurrency: number;
  maxConcurrency: number;

  reduceFactor: number;
  additiveIncrease: number;
  successWindow: number;
  defaultCooldownMs: number;
  ceilingOvershoot: number;

  maxRetries: number;
  maxQueueSize: number;
  queueTimeoutMs: number;

  enableJitter: boolean;
}

export const DEFAULT_NVIDIA_RATE_LIMIT_CONFIG: NvidiaRateLimitConfig = {
  mode: "auto",
  fallbackRpm: 30,
  maxRpm: 36,
  initialConcurrency: 1,
  maxConcurrency: 2,

  reduceFactor: 0.75,
  additiveIncrease: 1,
  successWindow: 25,
  defaultCooldownMs: 2_000,
  ceilingOvershoot: 0.1,

  maxRetries: 5,
  maxQueueSize: 100,
  queueTimeoutMs: 5 * 60_000,

  enableJitter: true,
};

export interface ScheduledRequestOptions<T> {
  provider: "nvidia";
  modelId: string;
  apiKey: string;
  requestType: string;
  priority: RequestPriority;
  execute: (signal?: AbortSignal) => Promise<T>;
  signal?: AbortSignal;
}

export interface RateLimitMetrics {
  totalRequests: number;
  successfulRequests: number;
  retriedRequests: number;
  rateLimited429Count: number;
  serverError503Count: number;
  totalQueuedMs: number;
  totalExecutionMs: number;
}
