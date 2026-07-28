import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CredentialStore } from "./credential-store.js";

describe("CredentialStore", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-cred-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.NVIDIA_API_KEY;
  });

  it("prioritizes NVIDIA_API_KEY environment variable if present", () => {
    process.env.NVIDIA_API_KEY = "nvapi-env-key-123456789";
    const store = new CredentialStore({ storageDir: tempDir });
    const cred = store.getApiKeyInfo();

    expect(cred.apiKey).toBe("nvapi-env-key-123456789");
    expect(cred.source).toBe("environment");
  });

  it("saves and retrieves API key from safe storage", () => {
    const store = new CredentialStore({ storageDir: tempDir });
    const key = "nvapi-storage-key-987654321";

    store.setApiKey(key);
    const cred = store.getApiKeyInfo();

    expect(cred.apiKey).toBe(key);
    expect(cred.source).not.toBe("environment");
  });

  it("clears API key on logout", () => {
    const store = new CredentialStore({ storageDir: tempDir });
    store.setApiKey("nvapi-to-be-deleted-12345");
    expect(store.getApiKeyInfo().apiKey).toBeTruthy();

    store.deleteApiKey();
    expect(store.getApiKeyInfo().apiKey).toBeNull();
  });
});
