import { describe, it, expect } from "vitest";
import { ContextManager } from "./context-manager.js";
import { SessionData } from "./session-store.js";

describe("ContextManager", () => {
  const createMockSession = (): SessionData => ({
    id: "test-session",
    projectPath: "/test/path",
    provider: "nvidia",
    modelId: "nvidia/nemotron-3-super-120b-a12b",
    mode: "chat",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  });

  it("adds and retrieves messages", () => {
    const session = createMockSession();
    const manager = new ContextManager(session);

    manager.addMessage({ role: "user", content: "Hello" });
    manager.addMessage({ role: "assistant", content: "World" });

    expect(manager.getMessages().length).toBe(2);
  });

  it("compacts context and includes summary in effective messages", () => {
    const session = createMockSession();
    const manager = new ContextManager(session);

    for (let i = 0; i < 10; i++) {
      manager.addMessage({ role: "user", content: `Msg ${i}` });
    }

    manager.compact("Previous 10 messages summary");
    const effective = manager.getEffectiveMessages("System prompt text");

    expect(effective[0].role).toBe("system");
    expect(effective[0].content).toBe("System prompt text");
    expect(effective[1].content).toContain("Previous 10 messages summary");
    expect(effective.length).toBe(8); // System prompt + Summary prompt + recent 6 messages
  });

  it("clears messages cleanly", () => {
    const session = createMockSession();
    const manager = new ContextManager(session);
    manager.addMessage({ role: "user", content: "To clear" });

    manager.clearMessages();
    expect(manager.getMessages().length).toBe(0);
  });
});
