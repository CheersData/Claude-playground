/**
 * Tests: lib/llm.ts (parseJSON + callLLM + callLLMFull)
 *
 * Copre:
 * - parseJSON: 3-stage fallback (direct parse, strip code fences, regex extraction)
 * - parseJSON: error on unparseable input
 * - callLLM: returns text from callLLMFull
 * - callLLMFull: fallback chain (tries enabled providers in order)
 * - callLLMFull: skips disabled providers
 * - callLLMFull: specific model bypasses chain
 * - callLLMFull: throws when all providers fail
 * - callLLMFull: config forwarding (systemPrompt, maxTokens, temperature, jsonOutput, callerName)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────────────────

const mockGenerate = vi.hoisted(() => vi.fn());
const mockIsProviderEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai-sdk/generate", () => ({
  generate: mockGenerate,
}));

vi.mock("@/lib/models", () => ({
  isProviderEnabled: mockIsProviderEnabled,
}));

// Import DOPO i mock
import { parseJSON, callLLM, callLLMFull } from "@/lib/llm";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeGenerateResult(text = '{"ok":true}', provider = "gemini", model = "gemini-2.5-flash") {
  return {
    text,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 200,
    provider,
    model,
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // By default all providers are enabled
  mockIsProviderEnabled.mockReturnValue(true);
  mockGenerate.mockResolvedValue(makeGenerateResult());
});

// ══════════════════════════════════════════════════════════════════════════════
// parseJSON
// ══════════════════════════════════════════════════════════════════════════════

describe("parseJSON", () => {
  describe("stage 1: direct parse", () => {
    it("parses valid JSON object directly", () => {
      const result = parseJSON<{ name: string }>('{"name":"test"}');
      expect(result).toEqual({ name: "test" });
    });

    it("parses valid JSON array directly", () => {
      const result = parseJSON<number[]>("[1, 2, 3]");
      expect(result).toEqual([1, 2, 3]);
    });

    it("parses JSON with whitespace", () => {
      const result = parseJSON<{ a: number }>('  { "a": 1 }  ');
      expect(result).toEqual({ a: 1 });
    });
  });

  describe("stage 2: strip code fences", () => {
    it("strips ```json fences", () => {
      const input = '```json\n{"key":"value"}\n```';
      const result = parseJSON<{ key: string }>(input);
      expect(result).toEqual({ key: "value" });
    });

    it("strips ``` fences without language tag", () => {
      const input = '```\n{"key":"value"}\n```';
      const result = parseJSON<{ key: string }>(input);
      expect(result).toEqual({ key: "value" });
    });

    it("strips code fences with extra whitespace", () => {
      const input = '```json\n\n{"a":1}\n\n```\n';
      const result = parseJSON<{ a: number }>(input);
      expect(result).toEqual({ a: 1 });
    });
  });

  describe("stage 3: regex extraction", () => {
    it("extracts JSON object from surrounding text", () => {
      const input = 'Here is the result: {"status":"ok"} hope that helps';
      const result = parseJSON<{ status: string }>(input);
      expect(result).toEqual({ status: "ok" });
    });

    it("extracts JSON array from surrounding text", () => {
      const input = "The items are: [1, 2, 3] and that's it";
      const result = parseJSON<number[]>(input);
      expect(result).toEqual([1, 2, 3]);
    });

    it("extracts nested JSON object from text", () => {
      const input = 'Analysis: {"risks":[{"level":"high"}]} done.';
      const result = parseJSON<{ risks: { level: string }[] }>(input);
      expect(result).toEqual({ risks: [{ level: "high" }] });
    });
  });

  describe("error cases", () => {
    it("throws on completely unparseable text", () => {
      expect(() => parseJSON("this is not json at all")).toThrow(
        "Impossibile parsare JSON"
      );
    });

    it("throws on empty string", () => {
      expect(() => parseJSON("")).toThrow("Impossibile parsare JSON");
    });

    it("includes first 200 chars in error message", () => {
      const longText = "x".repeat(300);
      expect(() => parseJSON(longText)).toThrow("primi 200 char");
    });

    it("throws on malformed JSON inside code fences", () => {
      const input = '```json\n{broken json}\n```';
      expect(() => parseJSON(input)).toThrow("Impossibile parsare JSON");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// callLLM
// ══════════════════════════════════════════════════════════════════════════════

describe("callLLM", () => {
  it("returns the text field from the generate result", async () => {
    mockGenerate.mockResolvedValue(makeGenerateResult('{"analysis":"done"}'));

    const result = await callLLM("test prompt");
    expect(result).toBe('{"analysis":"done"}');
  });

  it("forwards options to callLLMFull", async () => {
    mockGenerate.mockResolvedValue(makeGenerateResult("ok"));

    await callLLM("test", { systemPrompt: "sys", maxTokens: 100 });

    const config = mockGenerate.mock.calls[0][2];
    expect(config.systemPrompt).toBe("sys");
    expect(config.maxTokens).toBe(100);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// callLLMFull — fallback chain
// ══════════════════════════════════════════════════════════════════════════════

describe("callLLMFull — fallback chain", () => {
  it("uses first available provider (gemini) when all enabled", async () => {
    const result = await callLLMFull("test");

    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockGenerate.mock.calls[0][0]).toBe("gemini-2.5-flash");
    expect(result.provider).toBe("gemini");
  });

  it("falls back to next provider when first fails", async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error("gemini down"))
      .mockResolvedValueOnce(makeGenerateResult("ok", "groq", "llama4"));

    const result = await callLLMFull("test");

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(mockGenerate.mock.calls[0][0]).toBe("gemini-2.5-flash");
    expect(mockGenerate.mock.calls[1][0]).toBe("groq-llama4-scout");
    expect(result.provider).toBe("groq");
  });

  it("skips disabled providers", async () => {
    // Disable gemini and groq, only cerebras and mistral enabled
    mockIsProviderEnabled.mockImplementation((p: string) => {
      return p !== "gemini" && p !== "groq";
    });

    mockGenerate.mockResolvedValue(makeGenerateResult("ok", "cerebras", "qwen3"));

    await callLLMFull("test");

    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockGenerate.mock.calls[0][0]).toBe("cerebras-qwen3-235b");
  });

  it("throws when all providers fail", async () => {
    mockGenerate.mockRejectedValue(new Error("provider down"));

    await expect(callLLMFull("test", { callerName: "TEST" })).rejects.toThrow(
      "Tutti i provider gratuiti hanno fallito per TEST"
    );
  });

  it("throws when all providers are disabled", async () => {
    mockIsProviderEnabled.mockReturnValue(false);

    await expect(callLLMFull("test")).rejects.toThrow(
      "Tutti i provider gratuiti hanno fallito"
    );
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("collects error messages from all failed providers", async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error("gemini 429"))
      .mockRejectedValueOnce(new Error("groq timeout"))
      .mockRejectedValueOnce(new Error("cerebras down"))
      .mockRejectedValueOnce(new Error("mistral 503"));

    try {
      await callLLMFull("test");
      expect.fail("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("gemini-2.5-flash: gemini 429");
      expect(msg).toContain("groq-llama4-scout: groq timeout");
      expect(msg).toContain("cerebras-qwen3-235b: cerebras down");
      expect(msg).toContain("mistral-small-3: mistral 503");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// callLLMFull — specific model (bypass chain)
// ══════════════════════════════════════════════════════════════════════════════

describe("callLLMFull — specific model", () => {
  it("uses the specified model directly, bypassing chain", async () => {
    mockGenerate.mockResolvedValue(makeGenerateResult("ok", "mistral", "mistral-large"));

    const result = await callLLMFull("test", { model: "mistral-large-3" });

    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockGenerate.mock.calls[0][0]).toBe("mistral-large-3");
    expect(result.provider).toBe("mistral");
  });

  it("does not check isProviderEnabled when model is specified", async () => {
    mockGenerate.mockResolvedValue(makeGenerateResult("ok"));

    await callLLMFull("test", { model: "gemini-2.5-flash" });

    expect(mockIsProviderEnabled).not.toHaveBeenCalled();
  });

  it("propagates error when specified model fails (no fallback)", async () => {
    mockGenerate.mockRejectedValue(new Error("model unavailable"));

    await expect(
      callLLMFull("test", { model: "cerebras-qwen3-235b" })
    ).rejects.toThrow("model unavailable");

    expect(mockGenerate).toHaveBeenCalledOnce();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// callLLMFull — config forwarding
// ══════════════════════════════════════════════════════════════════════════════

describe("callLLMFull — config forwarding", () => {
  it("forwards systemPrompt to generate config", async () => {
    await callLLMFull("test", { systemPrompt: "Sei un assistente legale" });

    const config = mockGenerate.mock.calls[0][2];
    expect(config.systemPrompt).toBe("Sei un assistente legale");
  });

  it("forwards maxTokens with default 4096", async () => {
    await callLLMFull("test");

    const config = mockGenerate.mock.calls[0][2];
    expect(config.maxTokens).toBe(4096);
  });

  it("forwards custom maxTokens", async () => {
    await callLLMFull("test", { maxTokens: 1024 });

    const config = mockGenerate.mock.calls[0][2];
    expect(config.maxTokens).toBe(1024);
  });

  it("forwards temperature with default 0.2", async () => {
    await callLLMFull("test");

    const config = mockGenerate.mock.calls[0][2];
    expect(config.temperature).toBe(0.2);
  });

  it("forwards jsonOutput with default true", async () => {
    await callLLMFull("test");

    const config = mockGenerate.mock.calls[0][2];
    expect(config.jsonOutput).toBe(true);
  });

  it("forwards jsonOutput=false when specified", async () => {
    await callLLMFull("test", { jsonOutput: false });

    const config = mockGenerate.mock.calls[0][2];
    expect(config.jsonOutput).toBe(false);
  });

  it("forwards callerName as agentName with default SCRIPT", async () => {
    await callLLMFull("test");

    const config = mockGenerate.mock.calls[0][2];
    expect(config.agentName).toBe("SCRIPT");
  });

  it("forwards custom callerName as agentName", async () => {
    await callLLMFull("test", { callerName: "DAEMON" });

    const config = mockGenerate.mock.calls[0][2];
    expect(config.agentName).toBe("DAEMON");
  });

  it("passes prompt as second argument to generate", async () => {
    await callLLMFull("my analysis prompt");

    expect(mockGenerate.mock.calls[0][1]).toBe("my analysis prompt");
  });
});
