/**
 * Tests: lib/ai-sdk/agent-runner.ts (P1 — critical path)
 *
 * Comprehensive test suite covering:
 * - Normal execution: first model succeeds, returns parsed JSON
 * - Fallback chain behavior: first model fails, tries next; multiple failures
 * - All models in chain fail: error handling with descriptive messages
 * - Tier switching: different starting points in the chain for intern/associate/partner
 * - Agent disabled: runAgent itself doesn't check isAgentEnabled (orchestrator's job),
 *   but we verify it works correctly when the chain has different lengths
 * - Config passing: systemPrompt, maxTokens, temperature, jsonOutput, agentName
 * - Config overrides: caller can override defaults from AGENT_MODELS
 * - Provider availability: skip disabled providers, early termination when no fallback
 * - JSON parsing: success, cascading parse errors, last-in-chain parse error
 * - Cost logging: fire-and-forget, resilience to Supabase errors
 * - Error message content: chain info, model info in error messages
 * - All agent types: classifier, analyzer, investigator, advisor, corpus-agent,
 *   question-prep, leader, task-executor
 * - GenerateResult passthrough: all fields preserved in AgentRunResult
 * - Prompt passthrough: user prompt passed correctly to generate()
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelKey, AgentName } from "@/lib/models";
import type { GenerateResult } from "@/lib/ai-sdk/types";

// ── Mocks (hoisted — evaluated before imports) ──────────────────────────────

const mockGenerate = vi.hoisted(() => vi.fn());
const mockGetAgentChain = vi.hoisted(() => vi.fn());
const mockIsProviderEnabled = vi.hoisted(() => vi.fn());
const mockParseAgentJSON = vi.hoisted(() => vi.fn());
const mockLogAgentCost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai-sdk/generate", () => ({ generate: mockGenerate }));
vi.mock("@/lib/tiers", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tiers")>();
  return {
    ...original,
    getAgentChain: mockGetAgentChain,
    sessionTierStore: { getStore: vi.fn(() => undefined) },
  };
});
vi.mock("@/lib/models", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/models")>();
  return {
    ...original,
    isProviderEnabled: mockIsProviderEnabled,
  };
});
vi.mock("@/lib/anthropic", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/anthropic")>();
  return { ...original, parseAgentJSON: mockParseAgentJSON };
});
vi.mock("@/lib/company/cost-logger", () => ({
  logAgentCost: mockLogAgentCost,
}));

// Import after mocks are registered
import { runAgent } from "@/lib/ai-sdk/agent-runner";
import { AGENT_MODELS } from "@/lib/models";
import { AGENT_CHAINS, TIER_START } from "@/lib/tiers";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Default 3-model chain used for most tests. */
const defaultChain: ModelKey[] = [
  "claude-haiku-4.5",
  "gemini-2.5-flash",
  "mistral-small-3",
];

/**
 * Creates a mock GenerateResult.
 * @param text - Raw text output (default: valid JSON)
 * @param overrides - Partial overrides for other fields
 */
function makeGenerateResult(
  text: string = '{"ok":true}',
  overrides?: Partial<GenerateResult>
): GenerateResult {
  return {
    text,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 200,
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    ...overrides,
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAgentChain.mockReturnValue(defaultChain);
  mockIsProviderEnabled.mockReturnValue(true);
  mockParseAgentJSON.mockImplementation((text: string) => JSON.parse(text));
  mockLogAgentCost.mockResolvedValue(undefined);
});

// ── Test Suite ───────────────────────────────────────────────────────────────

describe("runAgent", () => {
  // ─── 1. Normal execution (first model succeeds) ─────────────────────────

  describe("normal execution (first model succeeds)", () => {
    it("calls generate with the first model in chain and returns parsed JSON", async () => {
      const expectedParsed = { risk: "alta", severity: 7 };
      mockGenerate.mockResolvedValue(
        makeGenerateResult(JSON.stringify(expectedParsed))
      );

      const result = await runAgent<typeof expectedParsed>(
        "classifier",
        "analizza questo contratto"
      );

      expect(result.parsed).toEqual(expectedParsed);
      expect(result.usedFallback).toBe(false);
      expect(result.usedModelKey).toBe(defaultChain[0]);
      expect(mockGenerate).toHaveBeenCalledOnce();
      expect(mockGenerate).toHaveBeenCalledWith(
        defaultChain[0],
        "analizza questo contratto",
        expect.any(Object)
      );
    });

    it("passes the user prompt to generate() unmodified", async () => {
      const longPrompt =
        "Analizza il seguente contratto di locazione 4+4 con clausola risolutiva espressa...";
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", longPrompt);

      expect(mockGenerate.mock.calls[0][1]).toBe(longPrompt);
    });

    it("calls parseAgentJSON with the raw text from generate", async () => {
      const rawJson = '{"complexField": [1, 2, {"nested": true}]}';
      mockGenerate.mockResolvedValue(makeGenerateResult(rawJson));

      await runAgent("classifier", "test");

      expect(mockParseAgentJSON).toHaveBeenCalledOnce();
      expect(mockParseAgentJSON).toHaveBeenCalledWith(rawJson);
    });
  });

  // ─── 2. Config merging from AGENT_MODELS ────────────────────────────────

  describe("config merging from AGENT_MODELS", () => {
    it("sets jsonOutput=true by default", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test");

      const config = mockGenerate.mock.calls[0][2];
      expect(config.jsonOutput).toBe(true);
    });

    it("sets agentName to UPPERCASE of the agent name", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test");
      expect(mockGenerate.mock.calls[0][2].agentName).toBe("CLASSIFIER");
    });

    it("handles hyphenated agent names in uppercase (TASK-EXECUTOR)", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("task-executor", "test");
      expect(mockGenerate.mock.calls[0][2].agentName).toBe("TASK-EXECUTOR");
    });

    it("handles hyphenated agent names (QUESTION-PREP)", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("question-prep", "test");
      expect(mockGenerate.mock.calls[0][2].agentName).toBe("QUESTION-PREP");
    });

    it("handles hyphenated agent names (CORPUS-AGENT)", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("corpus-agent", "test");
      expect(mockGenerate.mock.calls[0][2].agentName).toBe("CORPUS-AGENT");
    });
  });

  // ─── 3. Per-agent config from AGENT_MODELS ──────────────────────────────

  describe("per-agent config from AGENT_MODELS", () => {
    // Test every agent type to verify config is read correctly from AGENT_MODELS

    const allAgents: AgentName[] = [
      "leader",
      "question-prep",
      "classifier",
      "corpus-agent",
      "analyzer",
      "investigator",
      "advisor",
      "task-executor",
    ];

    for (const agentName of allAgents) {
      it(`${agentName}: uses maxTokens=${AGENT_MODELS[agentName].maxTokens} and temperature=${AGENT_MODELS[agentName].temperature}`, async () => {
        mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
        mockParseAgentJSON.mockReturnValue({ ok: true });

        await runAgent(agentName, "test");

        const config = mockGenerate.mock.calls[0][2];
        expect(config.maxTokens).toBe(AGENT_MODELS[agentName].maxTokens);
        expect(config.temperature).toBe(AGENT_MODELS[agentName].temperature);
      });
    }

    it("classifier uses maxTokens=4096 and temperature=0", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test");

      const config = mockGenerate.mock.calls[0][2];
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0);
    });

    it("analyzer uses maxTokens=8192 and temperature=0", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("analyzer", "test");

      const config = mockGenerate.mock.calls[0][2];
      expect(config.maxTokens).toBe(8192);
      expect(config.temperature).toBe(0);
    });

    it("task-executor uses maxTokens=4096 and temperature=0.2", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("task-executor", "test");

      const config = mockGenerate.mock.calls[0][2];
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.2);
    });

    it("leader uses maxTokens=512 and temperature=0", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("leader", "test");

      const config = mockGenerate.mock.calls[0][2];
      expect(config.maxTokens).toBe(512);
      expect(config.temperature).toBe(0);
    });

    it("investigator uses maxTokens=8192 and temperature=0", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("investigator", "test");

      const config = mockGenerate.mock.calls[0][2];
      expect(config.maxTokens).toBe(8192);
      expect(config.temperature).toBe(0);
    });
  });

  // ─── 4. Config overrides ────────────────────────────────────────────────

  describe("config overrides", () => {
    it("allows overriding maxTokens", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test", { maxTokens: 1000 });

      const config = mockGenerate.mock.calls[0][2];
      expect(config.maxTokens).toBe(1000);
    });

    it("allows overriding systemPrompt", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test", {
        systemPrompt: "Custom system prompt for testing",
      });

      const config = mockGenerate.mock.calls[0][2];
      expect(config.systemPrompt).toBe("Custom system prompt for testing");
    });

    it("allows overriding temperature", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test", { temperature: 0.8 });

      const config = mockGenerate.mock.calls[0][2];
      expect(config.temperature).toBe(0.8);
    });

    it("allows overriding jsonOutput to false", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test", { jsonOutput: false });

      const config = mockGenerate.mock.calls[0][2];
      expect(config.jsonOutput).toBe(false);
    });

    it("allows overriding agentName for logging", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test", {
        agentName: "CUSTOM-AGENT-NAME",
      });

      const config = mockGenerate.mock.calls[0][2];
      expect(config.agentName).toBe("CUSTOM-AGENT-NAME");
    });

    it("allows overriding multiple config fields simultaneously", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test", {
        maxTokens: 2048,
        systemPrompt: "Override prompt",
        temperature: 0.5,
      });

      const config = mockGenerate.mock.calls[0][2];
      expect(config.maxTokens).toBe(2048);
      expect(config.systemPrompt).toBe("Override prompt");
      expect(config.temperature).toBe(0.5);
      // jsonOutput should still be the default true
      expect(config.jsonOutput).toBe(true);
    });

    it("preserves non-overridden defaults from AGENT_MODELS", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      // Override only systemPrompt, keep maxTokens/temperature from AGENT_MODELS
      await runAgent("analyzer", "test", { systemPrompt: "Override" });

      const config = mockGenerate.mock.calls[0][2];
      expect(config.systemPrompt).toBe("Override");
      expect(config.maxTokens).toBe(AGENT_MODELS.analyzer.maxTokens);
      expect(config.temperature).toBe(AGENT_MODELS.analyzer.temperature);
    });
  });

  // ─── 5. Fallback chain behavior ──────────────────────────────────────────

  describe("fallback chain behavior", () => {
    it("falls back to second model when first fails with generic error", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("provider timeout"))
        .mockResolvedValueOnce(makeGenerateResult('{"fallback":true}'));

      const result = await runAgent<{ fallback: boolean }>(
        "classifier",
        "test"
      );

      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe(defaultChain[1]);
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(result.parsed).toEqual({ fallback: true });
    });

    it("falls back to third model when first two fail", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("error1"))
        .mockRejectedValueOnce(new Error("error2"))
        .mockResolvedValueOnce(makeGenerateResult('{"third":true}'));
      mockParseAgentJSON.mockReturnValue({ third: true });

      const result = await runAgent<{ third: boolean }>(
        "classifier",
        "test"
      );

      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe(defaultChain[2]);
      expect(mockGenerate).toHaveBeenCalledTimes(3);
    });

    it("falls back on 429 rate limit error", async () => {
      const rateLimitError = new Error(
        "429 rate_limit_error: Too many requests"
      );
      mockGenerate
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe(defaultChain[1]);
    });

    it("falls back on error with status 429", async () => {
      const error429 = Object.assign(new Error("Too many requests"), {
        status: 429,
      });
      mockGenerate
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedFallback).toBe(true);
    });

    it("falls back on 500 server error", async () => {
      const serverError = Object.assign(new Error("Internal server error"), {
        status: 500,
      });
      mockGenerate
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedFallback).toBe(true);
    });

    it("falls back on non-Error thrown value (string)", async () => {
      mockGenerate
        .mockRejectedValueOnce("string error thrown")
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("classifier", "test");

      expect(result.usedFallback).toBe(true);
    });

    it("passes the correct model key to generate for each attempt", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("fail1"))
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test");

      // First call should use chain[0]
      expect(mockGenerate.mock.calls[0][0]).toBe(defaultChain[0]);
      // Second call should use chain[1]
      expect(mockGenerate.mock.calls[1][0]).toBe(defaultChain[1]);
    });
  });

  // ─── 6. Provider availability (skip disabled providers) ──────────────────

  describe("provider availability", () => {
    it("skips disabled providers without calling generate", async () => {
      // chain[0] disabled, chain[1] enabled
      mockIsProviderEnabled
        .mockReturnValueOnce(false) // skip chain[0]
        .mockReturnValueOnce(true); // use chain[1]

      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));

      await runAgent("classifier", "test");

      expect(mockGenerate).toHaveBeenCalledOnce();
      expect(mockGenerate).toHaveBeenCalledWith(
        defaultChain[1],
        "test",
        expect.any(Object)
      );
    });

    it("skips multiple disabled providers in sequence", async () => {
      // chain[0] disabled, chain[1] disabled, chain[2] enabled
      mockIsProviderEnabled
        .mockReturnValueOnce(false) // skip chain[0]
        .mockReturnValueOnce(false) // skip chain[1]
        .mockReturnValueOnce(true); // use chain[2]

      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));

      await runAgent("classifier", "test");

      expect(mockGenerate).toHaveBeenCalledOnce();
      expect(mockGenerate).toHaveBeenCalledWith(
        defaultChain[2],
        "test",
        expect.any(Object)
      );
    });

    it("returns usedFallback=true when first model is skipped due to disabled provider", async () => {
      // chain[0] disabled, chain[1] enabled
      mockIsProviderEnabled
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("classifier", "test");

      // usedFallback is based on index > 0 in generate loop, not skipped models
      // Since chain[1] is at index 1, usedFallback is true
      expect(result.usedFallback).toBe(true);
    });

    it("rethrows immediately when a model fails and remaining providers are disabled", async () => {
      // chain[0] enabled (will fail), chain[1] disabled, chain[2] disabled
      mockIsProviderEnabled.mockImplementation((provider: string) => {
        return provider === "anthropic";
      });
      mockGenerate.mockRejectedValueOnce(new Error("Anthropic overloaded"));

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        "Anthropic overloaded"
      );
      // Should not attempt generate on disabled providers
      expect(mockGenerate).toHaveBeenCalledOnce();
    });

    it("does not call generate when all providers in chain are disabled", async () => {
      mockIsProviderEnabled.mockReturnValue(false);

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        /nessun provider disponibile/i
      );
      expect(mockGenerate).not.toHaveBeenCalled();
    });
  });

  // ─── 7. Tier switching (different chain starting points) ─────────────────

  describe("tier switching (different chain starting points)", () => {
    it("uses the chain returned by getAgentChain (partner tier = full chain)", async () => {
      const partnerChain: ModelKey[] = [
        "claude-sonnet-4.5",
        "gemini-2.5-pro",
        "mistral-large-3",
        "groq-llama3-70b",
        "cerebras-gpt-oss-120b",
      ];
      mockGetAgentChain.mockReturnValue(partnerChain);
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("analyzer", "test");

      expect(mockGetAgentChain).toHaveBeenCalledWith("analyzer");
      expect(mockGenerate).toHaveBeenCalledWith(
        "claude-sonnet-4.5",
        "test",
        expect.any(Object)
      );
      expect(result.usedModelKey).toBe("claude-sonnet-4.5");
      expect(result.usedFallback).toBe(false);
    });

    it("uses shorter chain for intern tier (starts from later in full chain)", async () => {
      // Simulating intern tier for analyzer: starts at index 2 (mistral-large-3)
      const internChain: ModelKey[] = [
        "mistral-large-3",
        "groq-llama3-70b",
        "cerebras-gpt-oss-120b",
      ];
      mockGetAgentChain.mockReturnValue(internChain);
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("analyzer", "test");

      expect(mockGenerate).toHaveBeenCalledWith(
        "mistral-large-3",
        "test",
        expect.any(Object)
      );
      expect(result.usedModelKey).toBe("mistral-large-3");
      expect(result.usedFallback).toBe(false);
    });

    it("uses associate tier chain (starts from middle)", async () => {
      // Simulating associate tier for classifier: starts at index 1
      const associateChain: ModelKey[] = [
        "gemini-2.5-flash",
        "cerebras-gpt-oss-120b",
        "groq-llama4-scout",
        "mistral-small-3",
      ];
      mockGetAgentChain.mockReturnValue(associateChain);
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("classifier", "test");

      expect(result.usedModelKey).toBe("gemini-2.5-flash");
      expect(result.usedFallback).toBe(false);
    });

    it("investigator chain is short (only Anthropic models)", async () => {
      // Investigator uses only Anthropic models due to web_search constraint
      const investigatorChain: ModelKey[] = [
        "claude-sonnet-4.5",
        "claude-haiku-4.5",
      ];
      mockGetAgentChain.mockReturnValue(investigatorChain);
      mockGenerate
        .mockRejectedValueOnce(new Error("sonnet overloaded"))
        .mockResolvedValueOnce(makeGenerateResult('{"findings":[]}'));
      mockParseAgentJSON.mockReturnValue({ findings: [] });

      const result = await runAgent("investigator", "test");

      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe("claude-haiku-4.5");
      expect(mockGenerate).toHaveBeenCalledTimes(2);
    });

    it("single-model chain throws on first failure (no fallback possible)", async () => {
      // Edge case: chain with only 1 model
      mockGetAgentChain.mockReturnValue(["claude-haiku-4.5"] as ModelKey[]);
      mockGenerate.mockRejectedValueOnce(new Error("only model failed"));

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        "only model failed"
      );
      expect(mockGenerate).toHaveBeenCalledOnce();
    });

    it("fallback works correctly with longer chains (5 models)", async () => {
      const longChain: ModelKey[] = [
        "claude-sonnet-4.5",
        "gemini-2.5-pro",
        "mistral-large-3",
        "groq-llama3-70b",
        "cerebras-gpt-oss-120b",
      ];
      mockGetAgentChain.mockReturnValue(longChain);
      mockGenerate
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"))
        .mockRejectedValueOnce(new Error("fail3"))
        .mockRejectedValueOnce(new Error("fail4"))
        .mockResolvedValueOnce(makeGenerateResult('{"lastResort":true}'));
      mockParseAgentJSON.mockReturnValue({ lastResort: true });

      const result = await runAgent("analyzer", "test");

      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe("cerebras-gpt-oss-120b");
      expect(mockGenerate).toHaveBeenCalledTimes(5);
    });

    it("verifies AGENT_CHAINS and TIER_START data integrity for all agents", () => {
      // This test verifies the real config data used by getAgentChain
      const allAgents: AgentName[] = [
        "leader",
        "question-prep",
        "classifier",
        "corpus-agent",
        "analyzer",
        "investigator",
        "advisor",
        "task-executor",
      ];

      for (const agent of allAgents) {
        const fullChain = AGENT_CHAINS[agent];
        expect(fullChain.length).toBeGreaterThanOrEqual(1);

        // Partner starts at 0, intern at >= partner
        expect(TIER_START[agent].partner).toBe(0);
        expect(TIER_START[agent].intern).toBeGreaterThanOrEqual(
          TIER_START[agent].associate
        );
        expect(TIER_START[agent].associate).toBeGreaterThanOrEqual(
          TIER_START[agent].partner
        );

        // All start indices must be within bounds
        expect(TIER_START[agent].intern).toBeLessThan(fullChain.length);
      }
    });
  });

  // ─── 8. All models in chain fail -> error handling ───────────────────────

  describe("all models in chain fail", () => {
    it("throws the last error when all models fail", async () => {
      mockGenerate.mockRejectedValue(new Error("all providers failed"));

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        "all providers failed"
      );
    });

    it("throws after trying all models in chain", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("error1"))
        .mockRejectedValueOnce(new Error("error2"))
        .mockRejectedValueOnce(new Error("error3: final"));

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        "error3: final"
      );
      expect(mockGenerate).toHaveBeenCalledTimes(3);
    });

    it("does not log costs when all models fail", async () => {
      mockGenerate.mockRejectedValue(new Error("fail"));

      await expect(runAgent("classifier", "test")).rejects.toThrow();

      expect(mockLogAgentCost).not.toHaveBeenCalled();
    });

    it("includes chain info in error when no providers available", async () => {
      mockIsProviderEnabled.mockReturnValue(false);

      await expect(runAgent("classifier", "test")).rejects.toThrow(/Chain:/);
    });

    it("error message includes agent name when no providers available", async () => {
      mockIsProviderEnabled.mockReturnValue(false);

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        /classifier/
      );
    });
  });

  // ─── 9. JSON parsing ────────────────────────────────────────────────────

  describe("JSON parsing", () => {
    it("cascades JSON parse error to fallback model", async () => {
      // First model produces text but parseAgentJSON fails; second model succeeds
      mockGenerate
        .mockResolvedValueOnce(makeGenerateResult("not json at all"))
        .mockResolvedValueOnce(makeGenerateResult('{"valid":true}'));
      mockParseAgentJSON
        .mockImplementationOnce(() => {
          throw new Error("Risposta non JSON da Claude");
        })
        .mockReturnValueOnce({ valid: true });

      const result = await runAgent<{ valid: boolean }>("classifier", "test");

      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(result.parsed).toEqual({ valid: true });
      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe(defaultChain[1]);
    });

    it("throws JSON parse error when last model in chain produces non-JSON", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult("broken json"));
      mockParseAgentJSON.mockImplementation(() => {
        throw new Error("Risposta non JSON da Claude");
      });

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        "Risposta non JSON da Claude"
      );
    });

    it("handles complex nested JSON parsing", async () => {
      const complexData = {
        clauses: [
          {
            id: 1,
            risk: "alta",
            details: { references: ["art. 1571", "art. 1572"] },
          },
        ],
        missingElements: [],
        overallRisk: "medium",
      };
      mockGenerate.mockResolvedValue(
        makeGenerateResult(JSON.stringify(complexData))
      );

      const result = await runAgent<typeof complexData>("analyzer", "test");

      expect(result.parsed).toEqual(complexData);
      expect(result.parsed.clauses[0].details.references).toHaveLength(2);
    });

    it("handles JSON with unicode characters (Italian legal text)", async () => {
      const italianData = {
        testo: "Contratto di locazione -- Art. 1571 c.c.",
        rischio: "clausola vessatoria ex art. 33 D.Lgs. 206/2005",
      };
      mockGenerate.mockResolvedValue(
        makeGenerateResult(JSON.stringify(italianData))
      );

      const result = await runAgent<typeof italianData>("classifier", "test");

      expect(result.parsed.testo).toContain("locazione");
      expect(result.parsed.rischio).toContain("vessatoria");
    });
  });

  // ─── 10. Cost logging ───────────────────────────────────────────────────

  describe("cost logging", () => {
    it("calls logAgentCost after successful execution", async () => {
      mockGenerate.mockResolvedValue(
        makeGenerateResult('{"ok":true}', {
          usage: { inputTokens: 500, outputTokens: 1000 },
          durationMs: 3000,
        })
      );
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("analyzer", "test");

      expect(mockLogAgentCost).toHaveBeenCalledOnce();
      const costArgs = mockLogAgentCost.mock.calls[0][0];
      expect(costArgs).toEqual({
        agentName: "analyzer",
        modelKey: defaultChain[0],
        inputTokens: 500,
        outputTokens: 1000,
        durationMs: 3000,
        usedFallback: false,
      });
    });

    it("logs usedFallback=true when fallback was used", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(
          makeGenerateResult('{"ok":true}', {
            usage: { inputTokens: 200, outputTokens: 100 },
            durationMs: 500,
          })
        );
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("analyzer", "test");

      const costArgs = mockLogAgentCost.mock.calls[0][0];
      expect(costArgs.usedFallback).toBe(true);
      expect(costArgs.modelKey).toBe(defaultChain[1]);
    });

    it("does not propagate cost logger errors (fire-and-forget)", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });
      mockLogAgentCost.mockRejectedValue(
        new Error("Supabase insert failed")
      );

      // Should NOT throw
      const result = await runAgent("classifier", "test");
      expect(result.parsed).toEqual({ ok: true });
    });

    it("does not call logAgentCost when all models fail", async () => {
      mockGenerate.mockRejectedValue(new Error("fail"));

      await expect(runAgent("classifier", "test")).rejects.toThrow();

      expect(mockLogAgentCost).not.toHaveBeenCalled();
    });

    it("logs the correct agent name for each agent type", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("investigator", "test");

      expect(mockLogAgentCost.mock.calls[0][0].agentName).toBe(
        "investigator"
      );
    });
  });

  // ─── 11. GenerateResult passthrough ─────────────────────────────────────

  describe("GenerateResult passthrough", () => {
    it("includes all GenerateResult fields in AgentRunResult", async () => {
      const genResult: GenerateResult = {
        text: '{"data": 42}',
        usage: { inputTokens: 500, outputTokens: 1000 },
        durationMs: 3000,
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
      };
      mockGenerate.mockResolvedValue(genResult);
      mockParseAgentJSON.mockReturnValue({ data: 42 });

      const result = await runAgent("classifier", "test");

      expect(result.text).toBe('{"data": 42}');
      expect(result.usage).toEqual({ inputTokens: 500, outputTokens: 1000 });
      expect(result.durationMs).toBe(3000);
      expect(result.provider).toBe("anthropic");
      expect(result.model).toBe("claude-haiku-4-5-20251001");
      // Plus the agent-runner specific fields
      expect(result.parsed).toEqual({ data: 42 });
      expect(result.usedFallback).toBe(false);
      expect(result.usedModelKey).toBe(defaultChain[0]);
    });

    it("preserves usage from the successful model (not the failed ones)", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(
          makeGenerateResult('{"ok":true}', {
            usage: { inputTokens: 750, outputTokens: 250 },
            durationMs: 1500,
            provider: "gemini",
            model: "gemini-2.5-flash",
          })
        );
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("classifier", "test");

      expect(result.usage).toEqual({ inputTokens: 750, outputTokens: 250 });
      expect(result.durationMs).toBe(1500);
      expect(result.provider).toBe("gemini");
      expect(result.model).toBe("gemini-2.5-flash");
    });
  });

  // ─── 12. usedFallback flag accuracy ─────────────────────────────────────

  describe("usedFallback flag accuracy", () => {
    it("usedFallback=false when first model (index 0) succeeds", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedFallback).toBe(false);
    });

    it("usedFallback=true when second model (index 1) succeeds", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedFallback).toBe(true);
    });

    it("usedFallback=true when third model (index 2) succeeds", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"))
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedFallback).toBe(true);
    });

    it("usedFallback=true when first model is skipped (disabled provider)", async () => {
      // chain[0] disabled → chain[1] succeeds at index 1
      mockIsProviderEnabled
        .mockReturnValueOnce(false)
        .mockReturnValue(true);
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedFallback).toBe(true);
    });
  });

  // ─── 13. usedModelKey accuracy ──────────────────────────────────────────

  describe("usedModelKey accuracy", () => {
    it("returns the first model key when it succeeds", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedModelKey).toBe(defaultChain[0]);
    });

    it("returns the second model key on fallback", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedModelKey).toBe(defaultChain[1]);
    });

    it("returns the last model key when only it succeeds", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"))
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedModelKey).toBe(defaultChain[2]);
    });

    it("returns the correct model key when skipping disabled providers", async () => {
      // chain[0] disabled, chain[1] disabled, chain[2] enabled and succeeds
      mockIsProviderEnabled
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedModelKey).toBe(defaultChain[2]);
    });
  });

  // ─── 14. Edge cases and error details ───────────────────────────────────

  describe("edge cases and error details", () => {
    it("handles empty string prompt", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("classifier", "");

      // generate(modelKey, prompt, config) — prompt is the second arg
      expect(mockGenerate.mock.calls[0][1]).toBe("");
      expect(result.parsed).toEqual({ ok: true });
    });

    it("handles very large prompt text", async () => {
      const largePrompt = "A".repeat(100_000);
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("classifier", largePrompt);

      expect(mockGenerate.mock.calls[0][1]).toBe(largePrompt);
      expect(result.parsed).toEqual({ ok: true });
    });

    it("preserves the original error when last model throws and no more fallbacks", async () => {
      const originalError = new Error("Original overloaded error");
      mockGetAgentChain.mockReturnValue([
        "claude-haiku-4.5",
      ] as ModelKey[]);
      mockGenerate.mockRejectedValueOnce(originalError);

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        originalError
      );
    });

    it("calls getAgentChain with the correct agent name", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("advisor", "test");

      expect(mockGetAgentChain).toHaveBeenCalledWith("advisor");
    });

    it("reads AGENT_MODELS config for the correct agent", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      // Run each agent and verify the config is agent-specific
      await runAgent("leader", "test");
      expect(mockGenerate.mock.calls[0][2].maxTokens).toBe(
        AGENT_MODELS.leader.maxTokens
      );

      vi.clearAllMocks();
      mockGetAgentChain.mockReturnValue(defaultChain);
      mockIsProviderEnabled.mockReturnValue(true);
      mockLogAgentCost.mockResolvedValue(undefined);
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("investigator", "test");
      expect(mockGenerate.mock.calls[0][2].maxTokens).toBe(
        AGENT_MODELS.investigator.maxTokens
      );
    });
  });

  // ─── 15. Mixed scenarios (provider skip + generate fail + JSON fail) ────

  describe("mixed failure scenarios", () => {
    it("skips disabled provider, then handles generate failure, then succeeds on third", async () => {
      const longChain: ModelKey[] = [
        "claude-haiku-4.5",       // disabled
        "gemini-2.5-flash",       // generate fails
        "mistral-small-3",        // succeeds
      ];
      mockGetAgentChain.mockReturnValue(longChain);

      mockIsProviderEnabled.mockImplementation((provider: string) => {
        return provider !== "anthropic";
      });

      mockGenerate
        .mockRejectedValueOnce(new Error("gemini timeout"))
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("classifier", "test");

      // chain[0] skipped (disabled), chain[1] failed, chain[2] succeeded
      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe("mistral-small-3");
      expect(mockGenerate).toHaveBeenCalledTimes(2); // Only gemini and mistral attempted
    });

    it("handles generate success but JSON parse failure, then generate failure, then full success", async () => {
      const longChain: ModelKey[] = [
        "claude-haiku-4.5",       // generate OK, parse fails
        "gemini-2.5-flash",       // generate fails
        "mistral-small-3",        // generate OK, parse OK
      ];
      mockGetAgentChain.mockReturnValue(longChain);

      mockGenerate
        .mockResolvedValueOnce(makeGenerateResult("not json"))
        .mockRejectedValueOnce(new Error("gemini down"))
        .mockResolvedValueOnce(makeGenerateResult('{"final":true}'));
      mockParseAgentJSON
        .mockImplementationOnce(() => {
          throw new Error("Risposta non JSON da Claude");
        })
        // not called for gemini (generate fails)
        .mockReturnValueOnce({ final: true });

      const result = await runAgent<{ final: boolean }>("classifier", "test");

      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe("mistral-small-3");
      expect(result.parsed).toEqual({ final: true });
      expect(mockGenerate).toHaveBeenCalledTimes(3);
    });

    it("disabled providers + all remaining fail = throws with correct error", async () => {
      // chain[0] disabled, chain[1] fails, chain[2] fails
      mockIsProviderEnabled
        .mockReturnValueOnce(false)   // chain[0] skipped
        .mockReturnValueOnce(true)    // chain[1] enabled
        .mockReturnValueOnce(true)    // chain[2] nextAvailable check
        .mockReturnValueOnce(true);   // chain[2] enabled
      mockGenerate
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2: last"));

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        "fail2: last"
      );
      expect(mockGenerate).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 16. Concurrent execution ───────────────────────────────────────────

  describe("concurrent execution", () => {
    it("two concurrent runAgent calls do not interfere with each other", async () => {
      mockGenerate.mockImplementation(async (modelKey: string) => {
        // Simulate varying latency
        await new Promise((r) => setTimeout(r, Math.random() * 10));
        return makeGenerateResult(
          JSON.stringify({ model: modelKey }),
          { model: modelKey }
        );
      });
      mockParseAgentJSON.mockImplementation((text: string) => JSON.parse(text));

      const [result1, result2] = await Promise.all([
        runAgent<{ model: string }>("classifier", "prompt1"),
        runAgent<{ model: string }>("analyzer", "prompt2"),
      ]);

      // Both should succeed independently
      expect(result1.parsed).toBeDefined();
      expect(result2.parsed).toBeDefined();
    });
  });
});
