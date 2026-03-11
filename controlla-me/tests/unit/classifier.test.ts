import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { SAMPLE_RENTAL_CONTRACT } from "../fixtures/documents";

const mockRunAgent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai-sdk/agent-runner", () => ({
  runAgent: mockRunAgent,
}));

import { runClassifier } from "@/lib/agents/classifier";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runClassifier", () => {
  const classificationFixture = makeClassification();

  it("calls runAgent with 'classifier' agent name and system prompt", async () => {
    mockRunAgent.mockResolvedValue({
      parsed: classificationFixture,
      text: JSON.stringify(classificationFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-haiku-4.5",
      usedFallback: false,
      usedModelKey: "claude-haiku-4.5",
    });

    await runClassifier(SAMPLE_RENTAL_CONTRACT);

    expect(mockRunAgent).toHaveBeenCalledOnce();
    const [agentName, _prompt, config] = mockRunAgent.mock.calls[0];
    expect(agentName).toBe("classifier");
    expect(config.systemPrompt).toBeDefined();
    expect(typeof config.systemPrompt).toBe("string");
  });

  it("passes document text in user message", async () => {
    mockRunAgent.mockResolvedValue({
      parsed: classificationFixture,
      text: JSON.stringify(classificationFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-haiku-4.5",
      usedFallback: false,
      usedModelKey: "claude-haiku-4.5",
    });

    await runClassifier(SAMPLE_RENTAL_CONTRACT);

    const prompt = mockRunAgent.mock.calls[0][1] as string;
    expect(prompt).toContain(SAMPLE_RENTAL_CONTRACT);
    expect(prompt).toContain("Analizza e classifica");
  });

  it("returns parsed ClassificationResult from runAgent response", async () => {
    mockRunAgent.mockResolvedValue({
      parsed: classificationFixture,
      text: JSON.stringify(classificationFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-haiku-4.5",
      usedFallback: false,
      usedModelKey: "claude-haiku-4.5",
    });

    const result = await runClassifier(SAMPLE_RENTAL_CONTRACT);

    expect(result.documentType).toBe("contratto_locazione_abitativa");
    expect(result.parties).toHaveLength(2);
    expect(result.jurisdiction).toContain("Italia");
    expect(result.confidence).toBe(0.95);
  });

  it("adds default values for new classification fields", async () => {
    const partialFixture = { ...classificationFixture };
    // Simulate a model that doesn't return the new fields
    delete (partialFixture as Record<string, unknown>).documentSubType;
    delete (partialFixture as Record<string, unknown>).relevantInstitutes;
    delete (partialFixture as Record<string, unknown>).legalFocusAreas;

    mockRunAgent.mockResolvedValue({
      parsed: partialFixture,
      text: JSON.stringify(partialFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-haiku-4.5",
      usedFallback: false,
      usedModelKey: "claude-haiku-4.5",
    });

    const result = await runClassifier(SAMPLE_RENTAL_CONTRACT);

    expect(result.documentSubType).toBeNull();
    expect(result.relevantInstitutes).toEqual([]);
    expect(result.legalFocusAreas).toEqual([]);
  });

  it("propagates API errors from agent-runner", async () => {
    mockRunAgent.mockRejectedValue(new Error("API connection failed"));

    await expect(
      runClassifier(SAMPLE_RENTAL_CONTRACT)
    ).rejects.toThrow("API connection failed");
  });

  it("propagates JSON parse errors from agent-runner", async () => {
    mockRunAgent.mockRejectedValue(new Error("Risposta non JSON da Claude"));

    await expect(
      runClassifier(SAMPLE_RENTAL_CONTRACT)
    ).rejects.toThrow("Risposta non JSON da Claude");
  });
});
