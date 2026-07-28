import {
  ScheduledRequestOptions,
  RateLimitMetrics,
  RequestPriority,
  NvidiaRateLimitConfig,
  DEFAULT_NVIDIA_RATE_LIMIT_CONFIG,
} from "./types.js";
import { RateLimitDomainManager } from "./rate-limit-domain.js";
import { parseRateLimitHeaders } from "./retry-after.js";
import { getExponentialBackoffMs, applyJitter } from "./backoff.js";

interface QueueItem<T> {
  id: string;
  options: ScheduledRequestOptions<T>;
  queuedAt: number;
  attempt: number;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export class RequestScheduler {
  private domainManager: RateLimitDomainManager;
  private queue: QueueItem<any>[] = [];
  private inFlight = 0;

  private metrics: RateLimitMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    retriedRequests: 0,
    rateLimited429Count: 0,
    serverError503Count: 0,
    totalQueuedMs: 0,
    totalExecutionMs: 0,
  };

  constructor(config = DEFAULT_NVIDIA_RATE_LIMIT_CONFIG) {
    this.domainManager = new RateLimitDomainManager(config);
  }

  public updateConfig(config: Partial<NvidiaRateLimitConfig>): void {
    this.domainManager.updateConfig(config);
  }

  public getDomainManager(): RateLimitDomainManager {
    return this.domainManager;
  }

  public getMetrics(): RateLimitMetrics {
    return { ...this.metrics };
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      retriedRequests: 0,
      rateLimited429Count: 0,
      serverError503Count: 0,
      totalQueuedMs: 0,
      totalExecutionMs: 0,
    };
    this.domainManager.resetAll();
  }

  public schedule<T>(options: ScheduledRequestOptions<T>): Promise<T> {
    const config = this.domainManager.getConfig();

    if (this.queue.length >= config.maxQueueSize) {
      return Promise.reject(new Error(`Rate Limit Request Queue Full (${config.maxQueueSize})`));
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        options,
        queuedAt: Date.now(),
        attempt: 0,
        resolve,
        reject,
      };

      this.queue.push(item);
      this.sortQueue();
      this.processNext();
    });
  }

  private sortQueue(): void {
    const priorityWeight: Record<RequestPriority, number> = {
      interactive: 4,
      agent: 3,
      background: 2,
      maintenance: 1,
    };

    this.queue.sort((a, b) => {
      const weightA = priorityWeight[a.options.priority] || 1;
      const weightB = priorityWeight[b.options.priority] || 1;
      if (weightA !== weightB) return weightB - weightA;
      return a.queuedAt - b.queuedAt; // FIFO for same priority
    });
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) return;

    const item = this.queue[0];
    const domainInfo = this.domainManager.getEffectiveDomain(
      item.options.apiKey,
      item.options.modelId
    );

    if (this.inFlight >= domainInfo.effectiveConcurrency) {
      return;
    }

    // Check token bucket rate limit
    const waitMs = domainInfo.globalDomain.tokenBucket.tryConsume(1);
    if (waitMs > 0) {
      setTimeout(() => this.processNext(), waitMs);
      return;
    }

    // Pop from queue and execute
    this.queue.shift();
    this.inFlight++;

    const queuedDuration = Date.now() - item.queuedAt;
    this.metrics.totalQueuedMs += queuedDuration;
    this.metrics.totalRequests++;
    item.attempt++;

    const execStart = Date.now();

    try {
      const result = await item.options.execute(item.options.signal);
      this.inFlight--;
      this.metrics.totalExecutionMs += Date.now() - execStart;
      this.metrics.successfulRequests++;

      // Inform domain manager of success
      domainInfo.globalDomain.controller.recordSuccess();
      domainInfo.modelDomain.controller.recordSuccess();

      item.resolve(result);
      this.processNext();
    } catch (err: any) {
      this.inFlight--;
      this.metrics.totalExecutionMs += Date.now() - execStart;

      const statusCode = err?.statusCode || (String(err).includes("429") ? 429 : undefined);

      // 1. 429 Too Many Requests Handling
      if (statusCode === 429 || String(err).includes("429")) {
        this.metrics.rateLimited429Count++;
        domainInfo.globalDomain.controller.record429();
        domainInfo.modelDomain.controller.record429();

        const config = this.domainManager.getConfig();

        if (item.attempt <= config.maxRetries) {
          this.metrics.retriedRequests++;
          const headers = err?.headers || {};
          const parsedHeaders = parseRateLimitHeaders(headers);

          let delayMs = parsedHeaders.retryAfterMs ?? getExponentialBackoffMs(item.attempt);
          if (config.enableJitter) {
            delayMs = applyJitter(delayMs);
          }

          setTimeout(() => {
            this.queue.push(item);
            this.sortQueue();
            this.processNext();
          }, delayMs);

          return;
        }
      }

      // 2. 503 / 504 Service Unavailable Handling (Transport Retry)
      if (statusCode === 503 || statusCode === 504) {
        this.metrics.serverError503Count++;
        const config = this.domainManager.getConfig();

        if (item.attempt <= 3) {
          this.metrics.retriedRequests++;
          const delayMs = getExponentialBackoffMs(item.attempt);
          setTimeout(() => {
            this.queue.push(item);
            this.sortQueue();
            this.processNext();
          }, delayMs);
          return;
        }
      }

      // Non-retryable errors (401, 403, 400, 422) or max retries exceeded
      item.reject(err);
      this.processNext();
    }
  }
}
