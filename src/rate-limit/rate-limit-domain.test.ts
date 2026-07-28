import { describe, it, expect } from "vitest";
import { getApiKeyFingerprint, RateLimitDomainManager } from "./rate-limit-domain.js";

describe("Rate Limit Domain Manager", () => {
  it("generates non-empty API key fingerprint without exposing full key", () => {
    const key = "nvapi-abcdef1234567890qwerty";
    const fingerprint = getApiKeyFingerprint(key);
    expect(fingerprint).toBeTruthy();
    expect(fingerprint.length).toBe(12);
    expect(key).not.toContain(fingerprint);
  });

  it("manages global and model domains and picks the effective conservative limit", () => {
    const manager = new RateLimitDomainManager();
    const apiKey = "nvapi-testkey12345";

    const domainInfo = manager.getEffectiveDomain(apiKey, "nvidia/nemotron-3-super-120b-a12b");
    expect(domainInfo.globalKey).toContain("nvidia:global:");
    expect(domainInfo.modelKey).toContain("nvidia/nemotron-3-super");
    expect(domainInfo.effectiveConcurrency).toBeGreaterThanOrEqual(1);
  });
});
