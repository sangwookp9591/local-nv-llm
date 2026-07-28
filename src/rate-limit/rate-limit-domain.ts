import crypto from "node:crypto";
import { AdaptiveController } from "./adaptive-controller.js";
import { TokenBucket } from "./token-bucket.js";
import { NvidiaRateLimitConfig, DEFAULT_NVIDIA_RATE_LIMIT_CONFIG } from "./types.js";

export function getApiKeyFingerprint(apiKey: string): string {
  if (!apiKey) return "unknown";
  return crypto.createHash("sha256").update(apiKey.trim()).digest("hex").slice(0, 12);
}

export interface DomainState {
  tokenBucket: TokenBucket;
  controller: AdaptiveController;
}

export class RateLimitDomainManager {
  private config: NvidiaRateLimitConfig;
  private domains = new Map<string, DomainState>();

  constructor(config = DEFAULT_NVIDIA_RATE_LIMIT_CONFIG) {
    this.config = config;
  }

  public updateConfig(config: Partial<NvidiaRateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): NvidiaRateLimitConfig {
    return this.config;
  }

  private getOrCreateDomain(key: string): DomainState {
    let domain = this.domains.get(key);
    if (!domain) {
      domain = {
        tokenBucket: new TokenBucket(this.config.maxRpm, this.config.fallbackRpm),
        controller: new AdaptiveController({
          initialConcurrency: this.config.initialConcurrency,
          maxConcurrency: this.config.maxConcurrency,
          reduceFactor: this.config.reduceFactor,
          additiveIncrease: this.config.additiveIncrease,
          successWindow: this.config.successWindow,
          defaultCooldownMs: this.config.defaultCooldownMs,
        }),
      };
      this.domains.set(key, domain);
    }
    return domain;
  }

  public getEffectiveDomain(apiKey: string, modelId: string) {
    const fingerprint = getApiKeyFingerprint(apiKey);
    const globalKey = `nvidia:global:${fingerprint}`;
    const modelKey = `nvidia:model:${fingerprint}:${modelId}`;

    const globalDomain = this.getOrCreateDomain(globalKey);
    const modelDomain = this.getOrCreateDomain(modelKey);

    const effectiveConcurrency = Math.min(
      globalDomain.controller.getConcurrency(),
      modelDomain.controller.getConcurrency()
    );

    return {
      globalKey,
      modelKey,
      globalDomain,
      modelDomain,
      effectiveConcurrency,
    };
  }

  public resetAll(): void {
    for (const domain of this.domains.values()) {
      domain.controller.reset();
    }
  }
}
