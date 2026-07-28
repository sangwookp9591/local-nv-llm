import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SessionStore, SessionData } from "./session-store.js";

describe("SessionStore", () => {
  let tempDir: string;
  let store: SessionStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-session-test-"));
    store = new SessionStore({ baseDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates, saves and retrieves a session without storing API Key", () => {
    const session = store.createSession("/test/project", "nvidia/nemotron-3-super-120b-a12b");
    expect(session.id).toBeTruthy();
    expect(session.messages.length).toBe(0);

    session.messages.push({ role: "user", content: "Hello NV" });
    session.messages.push({ role: "assistant", content: "Hello! How can I help?" });

    store.saveSession(session);

    const loaded = store.getSession(session.projectPath, session.id);
    expect(loaded).toBeDefined();
    expect(loaded?.messages.length).toBe(2);
    expect(loaded?.modelId).toBe("nvidia/nemotron-3-super-120b-a12b");
    // Ensure API keys are not in session object
    expect((loaded as unknown as Record<string, unknown>).apiKey).toBeUndefined();
  });

  it("lists recent sessions for a project", () => {
    const s1 = store.createSession("/test/project", "model-1");
    store.saveSession(s1);

    const s2 = store.createSession("/test/project", "model-2");
    store.saveSession(s2);

    const list = store.listSessions("/test/project");
    expect(list.length).toBe(2);
  });
});
