import { describe, it, expect } from "vitest";
import { parseSseStream } from "./stream.js";
import { Readable } from "node:stream";

describe("SSE Stream Parser", () => {
  it("parses text content chunks and done event", async () => {
    const rawChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world!"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    async function* generateStream() {
      for (const chunk of rawChunks) {
        yield new TextEncoder().encode(chunk);
      }
    }

    const events = [];
    for await (const event of parseSseStream(generateStream())) {
      events.push(event);
    }

    expect(events.length).toBe(3);
    expect(events[0]).toEqual({ type: "content", content: "Hello" });
    expect(events[1]).toEqual({ type: "content", content: " world!" });
    expect(events[2]).toEqual({ type: "done" });
  });

  it("parses reasoning content chunk for reasoning models", async () => {
    const rawChunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"Thinking deeply..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Here is the answer"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    async function* generateStream() {
      for (const chunk of rawChunks) {
        yield new TextEncoder().encode(chunk);
      }
    }

    const events = [];
    for await (const event of parseSseStream(generateStream())) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "reasoning", reasoning: "Thinking deeply..." });
    expect(events[1]).toEqual({ type: "content", content: "Here is the answer" });
  });

  it("parses tool call deltas correctly", async () => {
    const rawChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"path\\": \\"foo.txt\\"}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    async function* generateStream() {
      for (const chunk of rawChunks) {
        yield new TextEncoder().encode(chunk);
      }
    }

    const events = [];
    for await (const event of parseSseStream(generateStream())) {
      events.push(event);
    }

    expect(events[0]).toEqual({
      type: "tool_call",
      toolCall: {
        index: 0,
        id: "call_1",
        name: "read_file",
        argumentsDelta: '{"path": "foo.txt"}',
      },
    });
  });
});
