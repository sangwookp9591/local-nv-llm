import { describe, it, expect } from "vitest";
import { normalizeModelCapability, BUNDLED_MODELS } from "./capabilities.js";

describe("Model Capabilities", () => {
  it("includes bundled models with default capabilities", () => {
    expect(BUNDLED_MODELS.length).toBeGreaterThan(0);
    const nemotron = BUNDLED_MODELS.find((m) =>
      m.id.includes("nemotron-3-super")
    );
    expect(nemotron).toBeDefined();
    expect(nemotron?.chat).toBe(true);
  });

  it("normalizes model capability from API raw response", () => {
    const rawApiItem = {
      id: "nvidia/nemotron-3-super-120b-a12b",
      created: 1700000000,
      object: "model",
      owned_by: "nvidia",
    };

    const cap = normalizeModelCapability(rawApiItem);
    expect(cap.id).toBe("nvidia/nemotron-3-super-120b-a12b");
    expect(cap.provider).toBe("nvidia");
    expect(cap.streaming).toBe(true);
  });
});
