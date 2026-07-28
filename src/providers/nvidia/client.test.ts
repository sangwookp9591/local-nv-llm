import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NvidiaProvider } from "./client.js";

describe("NvidiaProvider", () => {
  let provider: NvidiaProvider;

  beforeEach(() => {
    provider = new NvidiaProvider();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates valid API key via API check", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "nvidia/nemotron-3-super-120b-a12b" }] }),
    });

    const isValid = await provider.validateCredential("nvapi-validkey12345");
    expect(isValid).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://integrate.api.nvidia.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer nvapi-validkey12345",
        }),
      })
    );
  });

  it("returns false for 401 unauthorized API key", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: { message: "Invalid API Key" } }),
    });

    const isValid = await provider.validateCredential("nvapi-invalidkey");
    expect(isValid).toBe(false);
  });

  it("falls back to bundled catalog when model list API fails", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network Error")
    );

    const models = await provider.listModels("nvapi-validkey");
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].provider).toBe("nvidia");
  });
});
