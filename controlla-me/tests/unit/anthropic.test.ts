import { describe, it, expect } from "vitest";
import { parseAgentJSON, extractTextContent } from "@/lib/anthropic";
import type Anthropic from "@anthropic-ai/sdk";

describe("parseAgentJSON", () => {
  it("parses valid JSON directly", () => {
    const result = parseAgentJSON<{ name: string }>('{"name": "test"}');
    expect(result).toEqual({ name: "test" });
  });

  it("parses valid JSON array", () => {
    const result = parseAgentJSON<number[]>("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("strips markdown code fences with json tag", () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = parseAgentJSON<{ key: string }>(input);
    expect(result).toEqual({ key: "value" });
  });

  it("strips markdown code fences without json tag", () => {
    const input = '```\n{"key": "value"}\n```';
    const result = parseAgentJSON<{ key: string }>(input);
    expect(result).toEqual({ key: "value" });
  });

  it("extracts JSON object from surrounding text", () => {
    const input = 'Here is the result:\n{"data": true}\nDone.';
    const result = parseAgentJSON<{ data: boolean }>(input);
    expect(result).toEqual({ data: true });
  });

  it("extracts JSON array from surrounding text", () => {
    const input = 'Results: [{"id": 1}] end';
    const result = parseAgentJSON<Array<{ id: number }>>(input);
    expect(result).toEqual([{ id: 1 }]);
  });

  it("throws with descriptive error on invalid input", () => {
    expect(() => parseAgentJSON("not json at all")).toThrow(
      "Risposta non JSON da Claude"
    );
  });

  it("handles nested JSON objects", () => {
    const input = '{"outer": {"inner": [1, 2]}}';
    const result = parseAgentJSON<{ outer: { inner: number[] } }>(input);
    expect(result.outer.inner).toEqual([1, 2]);
  });

  it("handles empty object", () => {
    const result = parseAgentJSON<Record<string, never>>("{}");
    expect(result).toEqual({});
  });

  it("handles JSON with unicode characters", () => {
    const input = '{"text": "Contratto di locazione — Art. 1571 c.c."}';
    const result = parseAgentJSON<{ text: string }>(input);
    expect(result.text).toContain("locazione");
  });

  it("handles whitespace around JSON", () => {
    const input = '   \n\n  {"ok": true}  \n\n  ';
    const result = parseAgentJSON<{ ok: boolean }>(input);
    expect(result).toEqual({ ok: true });
  });
});

describe("extractTextContent", () => {
  const makeMessage = (
    content: Anthropic.Messages.ContentBlock[]
  ): Anthropic.Messages.Message =>
    ({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "test",
      content,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }) as Anthropic.Messages.Message;

  it("extracts text from a single text block", () => {
    const msg = makeMessage([
      { type: "text", text: "Hello" } as Anthropic.Messages.TextBlock,
    ]);
    expect(extractTextContent(msg)).toBe("Hello");
  });

  it("concatenates multiple text blocks with newline", () => {
    const msg = makeMessage([
      { type: "text", text: "Line 1" } as Anthropic.Messages.TextBlock,
      { type: "text", text: "Line 2" } as Anthropic.Messages.TextBlock,
    ]);
    expect(extractTextContent(msg)).toBe("Line 1\nLine 2");
  });

  it("returns empty string when no text blocks present", () => {
    const msg = makeMessage([]);
    expect(extractTextContent(msg)).toBe("");
  });

  it("ignores tool_use blocks and only returns text", () => {
    const msg = makeMessage([
      { type: "text", text: "Result" } as Anthropic.Messages.TextBlock,
      {
        type: "tool_use",
        id: "tu_1",
        name: "web_search",
        input: {},
      } as Anthropic.Messages.ToolUseBlock,
    ]);
    expect(extractTextContent(msg)).toBe("Result");
  });
});
