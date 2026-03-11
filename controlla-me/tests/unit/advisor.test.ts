import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { makeAnalysis } from "../fixtures/analysis";
import { makeInvestigation } from "../fixtures/investigation";
import { makeAdvisorResult } from "../fixtures/advisor";

const mockRunAgent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai-sdk/agent-runner", () => ({
  runAgent: mockRunAgent,
}));

import { runAdvisor } from "@/lib/agents/advisor";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAdvisor", () => {
  const classification = makeClassification();
  const analysis = makeAnalysis();
  const investigation = makeInvestigation();
  const advisorFixture = makeAdvisorResult();

  it("calls runAgent with 'advisor' agent name, system prompt, and combined user message", async () => {
    mockRunAgent.mockResolvedValue({
      parsed: advisorFixture,
      text: JSON.stringify(advisorFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      usedFallback: false,
      usedModelKey: "claude-sonnet-4.5",
    });

    await runAdvisor(classification, analysis, investigation);

    expect(mockRunAgent).toHaveBeenCalledOnce();
    const [agentName, _prompt, config] = mockRunAgent.mock.calls[0];
    expect(agentName).toBe("advisor");
    expect(config.systemPrompt).toBeDefined();
    expect(typeof config.systemPrompt).toBe("string");
  });

  it("passes all 3 prior results in user message", async () => {
    mockRunAgent.mockResolvedValue({
      parsed: advisorFixture,
      text: JSON.stringify(advisorFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      usedFallback: false,
      usedModelKey: "claude-sonnet-4.5",
    });

    await runAdvisor(classification, analysis, investigation);

    const prompt = mockRunAgent.mock.calls[0][1] as string;
    expect(prompt).toContain(JSON.stringify(classification));
    expect(prompt).toContain(JSON.stringify(analysis));
    expect(prompt).toContain(JSON.stringify(investigation));
    expect(prompt).toContain("report finale");
  });

  it("returns parsed AdvisorResult with fairnessScore, risks, actions", async () => {
    mockRunAgent.mockResolvedValue({
      parsed: advisorFixture,
      text: JSON.stringify(advisorFixture),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      usedFallback: false,
      usedModelKey: "claude-sonnet-4.5",
    });

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
    mockRunAgent.mockResolvedValue({
      parsed: safeResult,
      text: JSON.stringify(safeResult),
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1000,
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      usedFallback: false,
      usedModelKey: "claude-sonnet-4.5",
    });

    const result = await runAdvisor(classification, analysis, investigation);

    expect(result.fairnessScore).toBe(9.0);
    expect(result.risks).toHaveLength(0);
    expect(result.needsLawyer).toBe(false);
  });

  it("propagates API errors from agent-runner", async () => {
    mockRunAgent.mockRejectedValue(new Error("API timeout"));

    await expect(
      runAdvisor(classification, analysis, investigation)
    ).rejects.toThrow("API timeout");
  });

  it("propagates JSON parse errors from agent-runner", async () => {
    mockRunAgent.mockRejectedValue(new Error("Risposta non JSON da Claude"));

    await expect(
      runAdvisor(classification, analysis, investigation)
    ).rejects.toThrow("Risposta non JSON da Claude");
  });
});
