import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { makeAnalysis, makeClause } from "../fixtures/analysis";
import { makeInvestigation } from "../fixtures/investigation";
import {
  makeAnthropicResponse,
} from "../fixtures/anthropic-response";

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

import { runInvestigator, runDeepSearch } from "@/lib/agents/investigator";
import { MODEL_FAST, MODEL } from "@/lib/anthropic";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("runInvestigator", () => {
  const classification = makeClassification();

  it("returns empty findings when no clauses are critical/high/medium risk", async () => {
    const analysis = makeAnalysis({
      clauses: [
        makeClause({ riskLevel: "low", id: "c1" }),
        makeClause({ riskLevel: "info", id: "c2" }),
      ],
    });

    const result = await runInvestigator(classification, analysis);
    expect(result).toEqual({ findings: [] });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns empty findings when clauses array is empty", async () => {
    const analysis = makeAnalysis({ clauses: [] });

    const result = await runInvestigator(classification, analysis);
    expect(result).toEqual({ findings: [] });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("filters out low and info risk clauses before calling API", async () => {
    const investigation = makeInvestigation();
    const analysis = makeAnalysis({
      clauses: [
        makeClause({ riskLevel: "high", id: "c1" }),
        makeClause({ riskLevel: "low", id: "c2" }),
        makeClause({ riskLevel: "info", id: "c3" }),
        makeClause({ riskLevel: "critical", id: "c4" }),
      ],
    });

    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(investigation))
    );

    await runInvestigator(classification, analysis);

    const params = mockCreate.mock.calls[0][0];
    const userMsg = params.messages[0].content as string;
    // Should only include high and critical clauses
    expect(userMsg).toContain("c1");
    expect(userMsg).toContain("c4");
    expect(userMsg).not.toContain('"id":"c2"');
    expect(userMsg).not.toContain('"id":"c3"');
  });

  it("completes in single iteration when stop_reason is end_turn", async () => {
    const investigation = makeInvestigation();
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(investigation), {
        stop_reason: "end_turn",
      })
    );

    const analysis = makeAnalysis();
    const result = await runInvestigator(classification, analysis);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.findings).toHaveLength(1);
  });

  it("continues with text-only context on max_tokens truncation", async () => {
    const investigation = makeInvestigation();

    // Iteration 1: truncated output
    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse('{"findings": [', {
        stop_reason: "max_tokens",
      })
    );

    // Iteration 2: model regenerates complete result
    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify(investigation), {
        stop_reason: "end_turn",
      })
    );

    const analysis = makeAnalysis();
    // The concatenated text won't be valid JSON in this mock scenario,
    // so we catch the parse error and verify the API call behavior instead
    try {
      await runInvestigator(classification, analysis);
    } catch {
      // Expected: concatenated partial + full text may not parse as valid JSON
    }

    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Second call should include text-only continuation (no tool blocks)
    const secondCall = mockCreate.mock.calls[1][0];
    const assistantMsg = secondCall.messages[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(typeof assistantMsg.content).toBe("string");
    const userContinue = secondCall.messages[2];
    expect(userContinue.role).toBe("user");
    expect(userContinue.content).toContain("Continua");
  });

  it("stops on tool_use stop_reason without looping", async () => {
    // web_search_20250305 is server-side, so tool_use stop_reason
    // should not trigger a client-side loop
    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse('{"findings": []}', {
        stop_reason: "tool_use",
      })
    );

    const analysis = makeAnalysis();
    const result = await runInvestigator(classification, analysis);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.findings).toEqual([]);
  });

  it("respects MAX_CONTINUATIONS (3) and stops", async () => {
    // All iterations return max_tokens with partial text
    for (let i = 0; i <= 3; i++) {
      mockCreate.mockResolvedValueOnce(
        makeAnthropicResponse(`"partial_${i}"`, {
          stop_reason: "max_tokens",
        })
      );
    }

    const analysis = makeAnalysis();
    // Will throw because concatenated text is not valid JSON,
    // but we verify the call count
    try {
      await runInvestigator(classification, analysis);
    } catch {
      // Expected: concatenated partial text is not valid JSON
    }

    // initial call + 3 continuations = 4 calls total
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it("uses MODEL_FAST and web_search tool in API call", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(makeInvestigation()))
    );

    const analysis = makeAnalysis();
    await runInvestigator(classification, analysis);

    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe(MODEL_FAST);
    expect(params.tools).toEqual([
      { type: "web_search_20250305", name: "web_search" },
    ]);
  });

  it("returns parsed InvestigationResult on success", async () => {
    const investigation = makeInvestigation();
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(investigation))
    );

    const analysis = makeAnalysis();
    const result = await runInvestigator(classification, analysis);

    expect(result.findings[0].clauseId).toBe("clause_1");
    expect(result.findings[0].laws).toHaveLength(1);
    expect(result.findings[0].courtCases).toHaveLength(1);
  });

  it("propagates API errors", async () => {
    mockCreate.mockRejectedValue(new Error("rate_limit exceeded"));

    const analysis = makeAnalysis();
    await expect(
      runInvestigator(classification, analysis)
    ).rejects.toThrow("rate_limit exceeded");
  });
});

describe("runDeepSearch", () => {
  it("uses MODEL (Sonnet) instead of MODEL_FAST", async () => {
    const deepResult = {
      response: "Risposta dettagliata.",
      sources: [{ url: "https://example.com", title: "Source", excerpt: "..." }],
    };
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(deepResult))
    );

    await runDeepSearch("clausola context", "analisi esistente", "domanda?");

    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe(MODEL);
  });

  it("includes clause context, existing analysis, and user question", async () => {
    const deepResult = { response: "Risposta.", sources: [] };
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(deepResult))
    );

    await runDeepSearch("La clausola penale", "Analisi precedente", "È legale?");

    const params = mockCreate.mock.calls[0][0];
    const userMsg = params.messages[0].content as string;
    expect(userMsg).toContain("La clausola penale");
    expect(userMsg).toContain("Analisi precedente");
    expect(userMsg).toContain("È legale?");
  });

  it("handles max_tokens continuation in deep search", async () => {
    const deepResult = { response: "Trovato Art. 1384.", sources: [] };

    // Iteration 1: truncated
    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse('{"response": "Trovato', {
        stop_reason: "max_tokens",
      })
    );
    // Iteration 2: model regenerates complete result
    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify(deepResult))
    );

    // Concatenated text may not parse as valid JSON in this mock scenario
    try {
      await runDeepSearch("ctx", "analysis", "question?");
    } catch {
      // Expected
    }

    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Second call should use text-only continuation
    const secondCall = mockCreate.mock.calls[1][0];
    expect(secondCall.messages[1].role).toBe("assistant");
    expect(typeof secondCall.messages[1].content).toBe("string");
  });

  it("returns parsed response with sources array", async () => {
    const deepResult = {
      response: "La penale è riducibile ai sensi dell'Art. 1384 c.c.",
      sources: [
        { url: "https://brocardi.it/1384", title: "Art. 1384", excerpt: "..." },
      ],
    };
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(deepResult))
    );

    const result = await runDeepSearch("ctx", "analysis", "question?");
    expect(result.response).toContain("1384");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].url).toContain("brocardi");
  });

  it("stops on tool_use stop_reason without looping", async () => {
    const deepResult = { response: "Risposta.", sources: [] };
    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify(deepResult), {
        stop_reason: "tool_use",
      })
    );

    const result = await runDeepSearch("ctx", "analysis", "question?");
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.response).toBe("Risposta.");
  });
});
