import { describe, it, expect } from "vitest";
import { maskApiKey, redactSensitiveText } from "./redaction.js";

describe("Redaction", () => {
  it("masks API key correctly keeping start and end characters", () => {
    const key = "nvapi-1234567890abcdef12348F2A";
    const masked = maskApiKey(key);
    expect(masked).toBe("nvapi-****8F2A");
    expect(masked).not.toContain("1234567890abcdef");
  });

  it("handles short API keys gracefully", () => {
    expect(maskApiKey("short")).toBe("****");
  });

  it("redacts API keys embedded in arbitrary text and error messages", () => {
    const text = "Error: Invalid API key nvapi-abcdef1234567890qwerty for request";
    const apiKey = "nvapi-abcdef1234567890qwerty";
    const redacted = redactSensitiveText(text, [apiKey]);
    expect(redacted).not.toContain(apiKey);
    expect(redacted).toContain("nvapi-****erty");
  });
});
