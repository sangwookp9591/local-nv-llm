import { describe, it, expect } from "vitest";
import { StreamThinkFilter } from "./stream-filter.js";

describe("StreamThinkFilter", () => {
  it("strips complete <think>...</think> blocks from stream chunks", () => {
    const filter = new StreamThinkFilter();
    const chunk1 = filter.process("<think>Let me analyze the request.</think>Here is the answer.");
    expect(chunk1).toBe("Here is the answer.");
  });

  it("handles <think> tags split across multiple stream chunks", () => {
    const filter = new StreamThinkFilter();
    
    const chunk1 = filter.process("Hello <thi");
    const chunk2 = filter.process("nk>Thinking about Korean input...</thi");
    const chunk3 = filter.process("nk>world!");

    expect(chunk1).toBe("Hello ");
    expect(chunk2).toBe("");
    expect(chunk3).toBe("world!");
  });

  it("preserves normal text and code blocks", () => {
    const filter = new StreamThinkFilter();
    const text = "```html\n<div><think>Not a tag</think></div>\n```";
    expect(filter.process(text)).toBe(text);
  });
});
