import { describe, it, expect, vi } from "vitest";
import { RuntimeEventBus } from "./event-bus.js";

describe("RuntimeEventBus", () => {
  it("emits and subscribes to events", () => {
    const bus = new RuntimeEventBus();
    const listener = vi.fn();

    bus.subscribe("GOAL_UPDATED", listener);
    bus.emit("GOAL_UPDATED", { goalId: "g-1", status: "executing" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].payload).toEqual({
      goalId: "g-1",
      status: "executing",
    });
  });
});
