import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { makeAnalysis } from "../fixtures/analysis";
import { SAMPLE_RENTAL_CONTRACT } from "../fixtures/documents";

const mockRunAgent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai-sdk/agent-runner", () => ({
  runAgent: mockRunAgent,
}));

import { runAnalyzer } from "@/lib/agents/analyzer";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAnalyzer", () => {
  const classification = makeClassification();
  const analysisFixture = makeAnalysis();

  it("calls runAgent with 'analyzer' agent name and system prompt", async () => {
    mockRunAgent.mockResolvedValue({
      parsed: analysisFixture,
      text: JSON.stringify(analysisFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      usedFallback: false,
      usedModelKey: "claude-sonnet-4.5",
    });

    await runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification);

    expect(mockRunAgent).toHaveBeenCalledOnce();
    const [agentName, _prompt, config] = mockRunAgent.mock.calls[0];
    expect(agentName).toBe("analyzer");
    expect(config.systemPrompt).toBeDefined();
  });

  it("passes classification info and document text in user message", async () => {
    mockRunAgent.mockResolvedValue({
      parsed: analysisFixture,
      text: JSON.stringify(analysisFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      usedFallback: false,
      usedModelKey: "claude-sonnet-4.5",
    });

    await runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification);

    const prompt = mockRunAgent.mock.calls[0][1] as string;
    // Analyzer formats classification as human-readable text (not raw JSON)
    expect(prompt).toContain(classification.documentTypeLabel);
    expect(prompt).toContain(classification.jurisdiction);
    expect(prompt).toContain(SAMPLE_RENTAL_CONTRACT);
  });

  it("returns parsed AnalysisResult from runAgent response", async () => {
    mockRunAgent.mockResolvedValue({
      parsed: analysisFixture,
      text: JSON.stringify(analysisFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      usedFallback: false,
      usedModelKey: "claude-sonnet-4.5",
    });

    const result = await runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification);
    expect(result.clauses).toHaveLength(1);
    expect(result.overallRisk).toBe("medium");
    expect(result.clauses[0].riskLevel).toBe("high");
  });

  it("propagates API errors from agent-runner", async () => {
    mockRunAgent.mockRejectedValue(new Error("API connection failed"));

    await expect(
      runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification)
    ).rejects.toThrow("API connection failed");
  });

  it("propagates JSON parse errors from agent-runner", async () => {
    mockRunAgent.mockRejectedValue(new Error("Risposta non JSON da Claude"));

    await expect(
      runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification)
    ).rejects.toThrow("Risposta non JSON da Claude");
  });
});
