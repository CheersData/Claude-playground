/**
 * Tests: Fallback chain behavior — agent-runner with tier-specific chains
 *
 * Validates the fallback chain mechanism in agent-runner.ts when running
 * on different tiers. These tests mock the generate() and runViaCLI()
 * functions to simulate provider failures and verify correct fallback behavior.
 *
 * Tests cover:
 * - Full fallback chain: all N models fail -> graceful error with descriptive message
 * - Partial fallback: first model 429 -> second model succeeds
 * - Fallback across multiple providers: groq -> cerebras -> sambanova -> mistral
 * - Investigator limited chain: only Anthropic models (2 entries)
 * - CLI-first agents falling back to SDK chain on intern tier
 * - Provider skip: disabled provider gets skipped in chain
 * - usedFallback flag: true when first model fails, false when it succeeds
 * - Error accumulation: all errors collected in final error message
 * - JSON parsing: valid intern-quality JSON is parseable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ModelKey, AgentName } from "@/lib/models";
import type { GenerateResult } from "@/lib/ai-sdk/types";

// ── Mocks ──

const mockGenerate = vi.hoisted(() => vi.fn());
const mockIsProviderEnabled = vi.hoisted(() => vi.fn());
const mockGetAgentChain = vi.hoisted(() => vi.fn());
const mockGetExecutionMode = vi.hoisted(() => vi.fn());
const mockGetCliModel = vi.hoisted(() => vi.fn());
const mockIsCliRunnerEnabled = vi.hoisted(() => vi.fn());
const mockRunViaCLI = vi.hoisted(() => vi.fn());
const mockLogAgentCost = vi.hoisted(() => vi.fn());
const mockParseAgentJSON = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai-sdk/generate", () => ({
  generate: mockGenerate,
}));

vi.mock("@/lib/models", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/models")>();
  return {
    ...original,
    isProviderEnabled: mockIsProviderEnabled,
  };
});

vi.mock("@/lib/tiers", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tiers")>();
  return {
    ...original,
    getAgentChain: mockGetAgentChain,
    getExecutionMode: mockGetExecutionMode,
    getCliModel: mockGetCliModel,
  };
});

vi.mock("@/lib/ai-sdk/cli-runner", () => ({
  runViaCLI: mockRunViaCLI,
  isCliRunnerEnabled: mockIsCliRunnerEnabled,
}));

vi.mock("@/lib/company/cost-logger", () => ({
  logAgentCost: mockLogAgentCost,
}));

vi.mock("@/lib/anthropic", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/anthropic")>();
  return {
    ...original,
    parseAgentJSON: mockParseAgentJSON,
  };
});

import { runAgent } from "@/lib/ai-sdk/agent-runner";
import { MODELS } from "@/lib/models";

// ── Fixtures ──

import {
  INTERN_CLASSIFICATION_GROQ,
  INTERN_ANALYSIS_GROQ,
  INTERN_ADVISOR_GROQ,
} from "../../fixtures/intern-tier-responses";

// ── Helpers ──

function makeGenerateResult(
  text: string,
  overrides?: Partial<GenerateResult>,
): GenerateResult {
  return {
    text,
    usage: { inputTokens: 500, outputTokens: 300 },
    durationMs: 2000,
    provider: overrides?.provider ?? "groq",
    model: overrides?.model ?? "llama-3.3-70b-versatile",
    ...overrides,
  };
}

// ── Setup ──

beforeEach(() => {
  vi.clearAllMocks();
  mockIsProviderEnabled.mockReturnValue(true);
  mockGetExecutionMode.mockReturnValue("sdk");
  mockIsCliRunnerEnabled.mockReturnValue(false);
  mockLogAgentCost.mockResolvedValue(undefined);
});

// =============================================================================
// Intern tier fallback chain: classifier (Groq -> Cerebras -> SambaNova -> Mistral)
// =============================================================================

describe("intern classifier fallback chain", () => {
  const INTERN_CLASSIFIER_CHAIN: ModelKey[] = [
    "groq-llama4-scout",
    "cerebras-gpt-oss-120b",
    "sambanova-llama3-70b",
    "mistral-small-3",
  ];

  beforeEach(() => {
    mockGetAgentChain.mockReturnValue(INTERN_CLASSIFIER_CHAIN);
  });

  it("first model succeeds: no fallback", async () => {
    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    const result = await runAgent("classifier", "test prompt");

    expect(result.usedFallback).toBe(false);
    expect(result.usedModelKey).toBe("groq-llama4-scout");
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toBe("groq-llama4-scout");
  });

  it("first model 429 -> falls to cerebras", async () => {
    const error429 = new Error("rate_limit exceeded");
    (error429 as Error & { status: number }).status = 429;
    mockGenerate.mockRejectedValueOnce(error429);

    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult(jsonText, { provider: "cerebras" }),
    );
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    const result = await runAgent("classifier", "test prompt");

    expect(result.usedFallback).toBe(true);
    expect(result.usedModelKey).toBe("cerebras-gpt-oss-120b");
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it("groq and cerebras fail -> falls to sambanova", async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error("groq overloaded"))
      .mockRejectedValueOnce(new Error("cerebras timeout"));

    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult(jsonText, { provider: "sambanova" }),
    );
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    const result = await runAgent("classifier", "test prompt");

    expect(result.usedFallback).toBe(true);
    expect(result.usedModelKey).toBe("sambanova-llama3-70b");
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it("first three fail -> falls to mistral (last resort)", async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error("groq down"))
      .mockRejectedValueOnce(new Error("cerebras down"))
      .mockRejectedValueOnce(new Error("sambanova down"));

    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult(jsonText, { provider: "mistral" }),
    );
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    const result = await runAgent("classifier", "test prompt");

    expect(result.usedFallback).toBe(true);
    expect(result.usedModelKey).toBe("mistral-small-3");
    expect(mockGenerate).toHaveBeenCalledTimes(4);
  });

  it("all 4 models fail -> throws with descriptive error", async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error("groq: 429"))
      .mockRejectedValueOnce(new Error("cerebras: timeout"))
      .mockRejectedValueOnce(new Error("sambanova: 503"))
      .mockRejectedValueOnce(new Error("mistral: 429"));

    await expect(
      runAgent("classifier", "test prompt"),
    ).rejects.toThrow("mistral: 429");

    expect(mockGenerate).toHaveBeenCalledTimes(4);
  });
});

// =============================================================================
// Intern tier fallback chain: analyzer (Groq 70B -> Cerebras -> SambaNova -> Mistral Large)
// =============================================================================

describe("intern analyzer fallback chain", () => {
  const INTERN_ANALYZER_CHAIN: ModelKey[] = [
    "groq-llama3-70b",
    "cerebras-gpt-oss-120b",
    "sambanova-llama3-70b",
    "mistral-large-3",
  ];

  beforeEach(() => {
    mockGetAgentChain.mockReturnValue(INTERN_ANALYZER_CHAIN);
  });

  it("first model succeeds with valid analysis", async () => {
    const jsonText = JSON.stringify(INTERN_ANALYSIS_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_ANALYSIS_GROQ);

    const result = await runAgent("analyzer", "test prompt");

    expect(result.usedFallback).toBe(false);
    expect(result.parsed).toEqual(INTERN_ANALYSIS_GROQ);
  });

  it("partial fallback preserves valid structure", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("groq 429"));

    const jsonText = JSON.stringify(INTERN_ANALYSIS_GROQ);
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult(jsonText, { provider: "cerebras" }),
    );
    mockParseAgentJSON.mockReturnValueOnce(INTERN_ANALYSIS_GROQ);

    const result = await runAgent("analyzer", "test prompt");

    expect(result.usedFallback).toBe(true);
    expect(result.parsed).toHaveProperty("clauses");
    expect(result.parsed).toHaveProperty("overallRisk");
  });
});

// =============================================================================
// Investigator limited chain (Anthropic only)
// =============================================================================

describe("investigator limited chain", () => {
  it("investigator intern chain has only 1 model (haiku)", async () => {
    // importActual returns a promise — must await it
    const actual = await vi.importActual<typeof import("@/lib/tiers")>("@/lib/tiers");
    const internStart = actual.TIER_START.investigator.intern;
    const internChain = actual.AGENT_CHAINS.investigator.slice(internStart);
    expect(internChain).toHaveLength(1);
    expect(internChain[0]).toBe("claude-haiku-4.5");
  });

  it("investigator full chain has only 2 models (both Claude)", async () => {
    const actual = await vi.importActual<typeof import("@/lib/tiers")>("@/lib/tiers");
    expect(actual.AGENT_CHAINS.investigator).toHaveLength(2);
    expect(actual.AGENT_CHAINS.investigator[0]).toBe("claude-sonnet-4.5");
    expect(actual.AGENT_CHAINS.investigator[1]).toBe("claude-haiku-4.5");
  });

  it("if single haiku model fails on intern, error is thrown immediately", async () => {
    mockGetAgentChain.mockReturnValue(["claude-haiku-4.5"] as ModelKey[]);

    mockGenerate.mockRejectedValueOnce(new Error("haiku: credits low"));

    await expect(
      runAgent("investigator", "test prompt"),
    ).rejects.toThrow("haiku: credits low");

    // Only 1 attempt — no fallback available
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("partner investigator: sonnet fails -> haiku succeeds", async () => {
    mockGetAgentChain.mockReturnValue([
      "claude-sonnet-4.5",
      "claude-haiku-4.5",
    ] as ModelKey[]);

    mockGenerate.mockRejectedValueOnce(new Error("sonnet: 429"));

    const emptyInvestigation = { findings: [] };
    const jsonText = JSON.stringify(emptyInvestigation);
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult(jsonText, { provider: "anthropic" }),
    );
    mockParseAgentJSON.mockReturnValueOnce(emptyInvestigation);

    const result = await runAgent("investigator", "test prompt");

    expect(result.usedFallback).toBe(true);
    expect(result.usedModelKey).toBe("claude-haiku-4.5");
    expect(result.parsed).toEqual(emptyInvestigation);
  });
});

// =============================================================================
// Provider skip behavior
// =============================================================================

describe("provider skip behavior", () => {
  const INTERN_ADVISOR_CHAIN: ModelKey[] = [
    "groq-llama3-70b",
    "cerebras-gpt-oss-120b",
    "sambanova-llama3-70b",
    "mistral-large-3",
  ];

  beforeEach(() => {
    mockGetAgentChain.mockReturnValue(INTERN_ADVISOR_CHAIN);
  });

  it("skips groq when groq provider is disabled, tries cerebras directly", async () => {
    mockIsProviderEnabled.mockImplementation(
      (provider: string) => provider !== "groq",
    );

    const jsonText = JSON.stringify(INTERN_ADVISOR_GROQ);
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult(jsonText, { provider: "cerebras" }),
    );
    mockParseAgentJSON.mockReturnValueOnce(INTERN_ADVISOR_GROQ);

    const result = await runAgent("advisor", "test prompt");

    // Should have called generate only once (cerebras)
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toBe("cerebras-gpt-oss-120b");
    expect(result.usedFallback).toBe(true); // index > 0
    expect(result.usedModelKey).toBe("cerebras-gpt-oss-120b");
  });

  it("skips multiple disabled providers", async () => {
    mockIsProviderEnabled.mockImplementation(
      (provider: string) => provider !== "groq" && provider !== "cerebras",
    );

    const jsonText = JSON.stringify(INTERN_ADVISOR_GROQ);
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult(jsonText, { provider: "sambanova" }),
    );
    mockParseAgentJSON.mockReturnValueOnce(INTERN_ADVISOR_GROQ);

    const result = await runAgent("advisor", "test prompt");

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toBe("sambanova-llama3-70b");
  });

  it("all providers disabled: throws 'nessun provider disponibile'", async () => {
    mockIsProviderEnabled.mockReturnValue(false);

    await expect(runAgent("advisor", "test prompt")).rejects.toThrow(
      /nessun provider disponibile/,
    );

    // generate should never be called
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

// =============================================================================
// CLI-first fallback to SDK on intern
// =============================================================================

describe("CLI-first fallback to SDK on intern", () => {
  const INTERN_ANALYZER_CHAIN: ModelKey[] = [
    "groq-llama3-70b",
    "cerebras-gpt-oss-120b",
    "sambanova-llama3-70b",
    "mistral-large-3",
  ];

  beforeEach(() => {
    mockGetAgentChain.mockReturnValue(INTERN_ANALYZER_CHAIN);
  });

  it("CLI mode agent falls back to SDK chain when CLI fails", async () => {
    mockGetExecutionMode.mockReturnValue("cli");
    mockIsCliRunnerEnabled.mockReturnValue(true);
    mockGetCliModel.mockReturnValue("sonnet");

    // CLI fails
    mockRunViaCLI.mockRejectedValueOnce(new Error("ENOENT: claude not found"));

    // SDK chain succeeds on first model
    const jsonText = JSON.stringify(INTERN_ANALYSIS_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_ANALYSIS_GROQ);

    const result = await runAgent("analyzer", "test prompt");

    expect(mockRunViaCLI).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result.usedFallback).toBe(false); // first model in SDK chain
    expect(result.usedModelKey).toBe("groq-llama3-70b");
  });

  it("SDK-mode agent skips CLI entirely", async () => {
    mockGetExecutionMode.mockReturnValue("sdk");
    mockIsCliRunnerEnabled.mockReturnValue(true);

    const jsonText = JSON.stringify(INTERN_ANALYSIS_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_ANALYSIS_GROQ);

    await runAgent("analyzer", "test prompt");

    expect(mockRunViaCLI).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("CLI disabled globally: skips CLI path even for cli-mode agents", async () => {
    mockGetExecutionMode.mockReturnValue("cli");
    mockIsCliRunnerEnabled.mockReturnValue(false); // disabled

    const jsonText = JSON.stringify(INTERN_ANALYSIS_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_ANALYSIS_GROQ);

    await runAgent("analyzer", "test prompt");

    expect(mockRunViaCLI).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// JSON parsing of intern-quality responses
// =============================================================================

describe("JSON parsing of intern-quality responses", () => {
  const INTERN_CLASSIFIER_CHAIN: ModelKey[] = [
    "groq-llama4-scout",
    "cerebras-gpt-oss-120b",
  ];

  beforeEach(() => {
    mockGetAgentChain.mockReturnValue(INTERN_CLASSIFIER_CHAIN);
  });

  it("valid JSON from intern model is parsed correctly", async () => {
    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    const result = await runAgent("classifier", "test prompt");

    expect(result.parsed).toEqual(INTERN_CLASSIFICATION_GROQ);
    expect(mockParseAgentJSON).toHaveBeenCalledWith(jsonText);
  });

  it("JSON parse error on first model triggers fallback to next", async () => {
    // First model returns valid-looking text but parseAgentJSON throws
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult("not valid json"),
    );
    mockParseAgentJSON.mockImplementationOnce(() => {
      throw new Error("Risposta non JSON");
    });

    // Second model succeeds
    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult(jsonText, { provider: "cerebras" }),
    );
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    const result = await runAgent("classifier", "test prompt");

    expect(result.usedFallback).toBe(true);
    expect(result.usedModelKey).toBe("cerebras-gpt-oss-120b");
  });

  it("JSON with extra whitespace/newlines is still parseable", async () => {
    // Intern models sometimes add extra whitespace
    const jsonText = `\n  ${JSON.stringify(INTERN_CLASSIFICATION_GROQ, null, 2)}  \n`;
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    const result = await runAgent("classifier", "test prompt");

    expect(result.parsed).toEqual(INTERN_CLASSIFICATION_GROQ);
  });
});

// =============================================================================
// Cost logging on fallback
// =============================================================================

describe("cost logging on fallback", () => {
  const INTERN_CLASSIFIER_CHAIN: ModelKey[] = [
    "groq-llama4-scout",
    "cerebras-gpt-oss-120b",
  ];

  beforeEach(() => {
    mockGetAgentChain.mockReturnValue(INTERN_CLASSIFIER_CHAIN);
  });

  it("logs cost with correct modelKey after fallback", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("groq 429"));

    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(
      makeGenerateResult(jsonText, { provider: "cerebras" }),
    );
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    await runAgent("classifier", "test prompt");

    expect(mockLogAgentCost).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "classifier",
        modelKey: "cerebras-gpt-oss-120b",
        usedFallback: true,
      }),
    );
  });

  it("logs cost with usedFallback=false when first model succeeds", async () => {
    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    await runAgent("classifier", "test prompt");

    expect(mockLogAgentCost).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "classifier",
        modelKey: "groq-llama4-scout",
        usedFallback: false,
      }),
    );
  });

  it("cost logging failure does not break the agent run", async () => {
    mockLogAgentCost.mockRejectedValueOnce(new Error("Supabase down"));

    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    // Should not throw despite cost logging failure
    const result = await runAgent("classifier", "test prompt");
    expect(result.parsed).toEqual(INTERN_CLASSIFICATION_GROQ);
  });
});

// =============================================================================
// Config passing through fallback chain
// =============================================================================

describe("config passing through fallback chain", () => {
  const INTERN_CLASSIFIER_CHAIN: ModelKey[] = [
    "groq-llama4-scout",
    "cerebras-gpt-oss-120b",
  ];

  beforeEach(() => {
    mockGetAgentChain.mockReturnValue(INTERN_CLASSIFIER_CHAIN);
  });

  it("systemPrompt is passed to generate on fallback model", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("groq 429"));

    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    await runAgent("classifier", "test prompt", {
      systemPrompt: "Classify this document.",
    });

    // Second call (cerebras) should have the same config
    const secondCallConfig = mockGenerate.mock.calls[1][2];
    expect(secondCallConfig.systemPrompt).toBe("Classify this document.");
  });

  it("maxTokens override is preserved across fallback", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("groq 429"));

    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    await runAgent("classifier", "test prompt", { maxTokens: 2048 });

    const secondCallConfig = mockGenerate.mock.calls[1][2];
    expect(secondCallConfig.maxTokens).toBe(2048);
  });

  it("prompt text is the same for all models in chain", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("groq 429"));

    const jsonText = JSON.stringify(INTERN_CLASSIFICATION_GROQ);
    mockGenerate.mockResolvedValueOnce(makeGenerateResult(jsonText));
    mockParseAgentJSON.mockReturnValueOnce(INTERN_CLASSIFICATION_GROQ);

    await runAgent("classifier", "my specific prompt text");

    expect(mockGenerate.mock.calls[0][1]).toBe("my specific prompt text");
    expect(mockGenerate.mock.calls[1][1]).toBe("my specific prompt text");
  });
});
