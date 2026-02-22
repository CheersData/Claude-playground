import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { makeAnalysis } from "../fixtures/analysis";
import { makeInvestigation } from "../fixtures/investigation";
import { makeAdvisorResult } from "../fixtures/advisor";
import { makeAnthropicResponse } from "../fixtures/anthropic-response";

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

import { runAdvisor } from "@/lib/agents/advisor";
import { MODEL } from "@/lib/anthropic";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAdvisor", () => {
  const classification = makeClassification();
  const analysis = makeAnalysis();
  const investigation = makeInvestigation();
  const advisorFixture = makeAdvisorResult();

  it("calls anthropic with MODEL (Sonnet), 4096 max_tokens, and system prompt", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(advisorFixture))
    );

    await runAdvisor(classification, analysis, investigation);

    expect(mockCreate).toHaveBeenCalledOnce();
    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe(MODEL);
    expect(params.max_tokens).toBe(4096);
    expect(params.system).toBeDefined();
  });

  it("passes all 3 prior results in user message", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(advisorFixture))
    );

    await runAdvisor(classification, analysis, investigation);

    const params = mockCreate.mock.calls[0][0];
    const userMessage = params.messages[0].content as string;
    expect(userMessage).toContain(JSON.stringify(classification));
    expect(userMessage).toContain(JSON.stringify(analysis));
    expect(userMessage).toContain(JSON.stringify(investigation));
    expect(userMessage).toContain("report finale");
  });

  it("returns parsed AdvisorResult with fairnessScore, risks, actions", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(advisorFixture))
    );

    const result = await runAdvisor(classification, analysis, investigation);

    expect(result.fairnessScore).toBe(6.2);
    expect(result.risks).toHaveLength(1);
    expect(result.risks[0].severity).toBe("alta");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].priority).toBe(1);
    expect(result.needsLawyer).toBe(true);
    expect(result.lawyerSpecialization).toContain("immobiliare");
  });

  it("handles advisor result with needsLawyer false", async () => {
    const safeResult = makeAdvisorResult({
      fairnessScore: 9.0,
      risks: [],
      needsLawyer: false,
      lawyerReason: "",
    });
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(safeResult))
    );

    const result = await runAdvisor(classification, analysis, investigation);

    expect(result.fairnessScore).toBe(9.0);
    expect(result.risks).toHaveLength(0);
    expect(result.needsLawyer).toBe(false);
  });

  it("propagates API errors", async () => {
    mockCreate.mockRejectedValue(new Error("API timeout"));

    await expect(
      runAdvisor(classification, analysis, investigation)
    ).rejects.toThrow("API timeout");
  });

  it("propagates JSON parse errors from malformed responses", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse("Non JSON response from Claude")
    );

    await expect(
      runAdvisor(classification, analysis, investigation)
    ).rejects.toThrow("Risposta non JSON da Claude");
  });
});
