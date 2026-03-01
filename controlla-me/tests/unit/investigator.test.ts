import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { makeAnalysis, makeClause } from "../fixtures/analysis";
import { makeInvestigation } from "../fixtures/investigation";
import {
  makeAnthropicResponse,
  makeToolUseBlock,
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
  vi.clearAllMocks();
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

  it("continues agentic loop when tool_use blocks are present", async () => {
    const investigation = makeInvestigation();

    // Iteration 1: tool_use (web search)
    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse("Searching...", {
        stop_reason: "tool_use",
        extra_content: [
          makeToolUseBlock("tu_1", "web_search", { query: "Art. 1384 c.c." }),
        ],
      })
    );

    // Iteration 2: end_turn with final result
    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify(investigation), {
        stop_reason: "end_turn",
      })
    );

    const analysis = makeAnalysis();
    const result = await runInvestigator(classification, analysis);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.findings).toHaveLength(1);
  });

  it("respects MAX_ITERATIONS (5) and stops looping", async () => {
    // All iterations return tool_use, never end_turn
    for (let i = 0; i < 5; i++) {
      mockCreate.mockResolvedValueOnce(
        makeAnthropicResponse(`{"findings": []}`, {
          stop_reason: "tool_use",
          extra_content: [
            makeToolUseBlock(`tu_${i}`, "web_search", { query: "test" }),
          ],
        })
      );
    }

    const analysis = makeAnalysis();
    const result = await runInvestigator(classification, analysis);

    expect(mockCreate).toHaveBeenCalledTimes(5);
    expect(result.findings).toEqual([]);
  });

  it("uses MODEL (Sonnet) and web_search tool in API call", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(makeInvestigation()))
    );

    const analysis = makeAnalysis();
    await runInvestigator(classification, analysis);

    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe(MODEL);
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

  it("handles multi-iteration search with tool_use blocks", async () => {
    const deepResult = { response: "Trovato.", sources: [] };

    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse("Cerco...", {
        stop_reason: "tool_use",
        extra_content: [
          makeToolUseBlock("tu_1", "web_search", { query: "test" }),
        ],
      })
    );
    mockCreate.mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify(deepResult))
    );

    const result = await runDeepSearch("ctx", "analysis", "question?");
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.response).toBe("Trovato.");
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
});
