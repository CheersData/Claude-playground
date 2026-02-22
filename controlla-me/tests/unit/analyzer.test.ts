import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { makeAnalysis } from "../fixtures/analysis";
import { makeAnthropicResponse } from "../fixtures/anthropic-response";
import { SAMPLE_RENTAL_CONTRACT } from "../fixtures/documents";

// vi.hoisted ensures the mock fn is available when vi.mock factory runs (hoisted to top)
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/anthropic", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/anthropic")>();
  return {
    ...original,
    anthropic: {
      get messages() {
        return { create: mockCreate };
      },
    },
  };
});

import { runAnalyzer } from "@/lib/agents/analyzer";
import { MODEL } from "@/lib/anthropic";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAnalyzer", () => {
  const classification = makeClassification();
  const analysisFixture = makeAnalysis();

  it("calls anthropic with MODEL, 8192 max_tokens, and system prompt", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(analysisFixture))
    );

    await runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification);

    expect(mockCreate).toHaveBeenCalledOnce();
    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe(MODEL);
    expect(params.max_tokens).toBe(8192);
    expect(params.system).toBeDefined();
  });

  it("passes classification JSON and document text in user message", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(analysisFixture))
    );

    await runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification);

    const params = mockCreate.mock.calls[0][0];
    const userMessage = params.messages[0].content as string;
    expect(userMessage).toContain(JSON.stringify(classification));
    expect(userMessage).toContain(SAMPLE_RENTAL_CONTRACT);
  });

  it("returns parsed AnalysisResult from Claude response", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(analysisFixture))
    );

    const result = await runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification);
    expect(result.clauses).toHaveLength(1);
    expect(result.overallRisk).toBe("medium");
    expect(result.clauses[0].riskLevel).toBe("high");
  });

  it("propagates API errors", async () => {
    mockCreate.mockRejectedValue(new Error("API connection failed"));

    await expect(
      runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification)
    ).rejects.toThrow("API connection failed");
  });

  it("propagates JSON parse errors from malformed responses", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse("This is not valid JSON at all")
    );

    await expect(
      runAnalyzer(SAMPLE_RENTAL_CONTRACT, classification)
    ).rejects.toThrow("Risposta non JSON da Claude");
  });
});
