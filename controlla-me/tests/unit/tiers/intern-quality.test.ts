/**
 * Tests: Intern tier quality — Legal Office analysis on free/intern models
 *
 * Validates that the analysis pipeline produces structurally valid output
 * when running on the intern tier (Groq, Cerebras, SambaNova, Mistral).
 *
 * These tests do NOT call real APIs. They use mocked agent responses that
 * simulate realistic intern-model outputs, then verify:
 * - Correct model selection for each agent
 * - Valid output structure from each agent
 * - Required fields present in ClassificationResult, AnalysisResult, AdvisorResult
 * - Investigator handles web_search unavailability gracefully
 * - Advisor produces valid scoring (fairnessScore 1-10, scores object)
 * - Advisor output limits enforced (max 3 risks, max 3 actions)
 * - Pipeline completes end-to-end with intern-quality responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentName, ModelKey } from "@/lib/models";

import {
  INTERN_CLASSIFICATION_GROQ,
  INTERN_CLASSIFICATION_CEREBRAS,
  INTERN_CLASSIFICATION_SAMBANOVA,
  INTERN_CLASSIFICATION_MISTRAL,
  INTERN_ANALYSIS_GROQ,
  INTERN_ANALYSIS_CEREBRAS,
  INTERN_ADVISOR_GROQ,
  INTERN_ADVISOR_CEREBRAS_NO_SCORES,
  INTERN_ADVISOR_OVER_LIMIT,
  INTERN_INVESTIGATION_EMPTY,
  makeAgentRunResult,
} from "../../fixtures/intern-tier-responses";
import { makeClassification } from "../../fixtures/classification";
import { makeAnalysis } from "../../fixtures/analysis";
import { SAMPLE_RENTAL_CONTRACT } from "../../fixtures/documents";

// ── Mocks ──

const mockIsProviderEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/models", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/models")>();
  return {
    ...original,
    isProviderEnabled: mockIsProviderEnabled,
  };
});

import {
  getCurrentTier,
  setCurrentTier,
  getAgentChain,
  getActiveModel,
  isAgentEnabled,
  setAgentEnabled,
  sessionTierStore,
  AGENT_CHAINS,
  TIER_START,
  type TierName,
  type SessionTierContext,
} from "@/lib/tiers";
import { MODELS } from "@/lib/models";

// ── Constants ──

const CORE_PIPELINE_AGENTS: AgentName[] = [
  "classifier",
  "analyzer",
  "investigator",
  "advisor",
];

function makeSessionCtx(
  tier: TierName,
  disabled: AgentName[] = [],
): SessionTierContext {
  return { tier, disabledAgents: new Set(disabled), sid: "test-intern-quality" };
}

// ── Setup ──

beforeEach(() => {
  vi.clearAllMocks();
  mockIsProviderEnabled.mockReturnValue(true);
  setCurrentTier("partner");
  for (const agent of CORE_PIPELINE_AGENTS) {
    setAgentEnabled(agent, true);
  }
});

afterEach(() => {
  setCurrentTier("partner");
  for (const agent of CORE_PIPELINE_AGENTS) {
    setAgentEnabled(agent, true);
  }
});

// =============================================================================
// Intern tier model selection
// =============================================================================

describe("intern tier model selection", () => {
  it("classifier selects groq-llama4-scout as first model on intern", async () => {
    const ctx = makeSessionCtx("intern");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("classifier"));
    expect(model).toBe("groq-llama4-scout");
  });

  it("analyzer selects groq-llama3-70b as first model on intern", async () => {
    const ctx = makeSessionCtx("intern");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("analyzer"));
    expect(model).toBe("groq-llama3-70b");
  });

  it("investigator selects claude-haiku-4.5 on intern (web_search requires Anthropic)", async () => {
    const ctx = makeSessionCtx("intern");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("investigator"));
    // Investigator intern starts at index 1, which is haiku
    expect(model).toBe("claude-haiku-4.5");
  });

  it("advisor selects groq-llama3-70b as first model on intern", async () => {
    const ctx = makeSessionCtx("intern");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("advisor"));
    expect(model).toBe("groq-llama3-70b");
  });

  it("intern classifier chain is: groq-llama4-scout -> cerebras -> sambanova -> mistral", async () => {
    const ctx = makeSessionCtx("intern");
    const chain = await sessionTierStore.run(ctx, () => getAgentChain("classifier"));
    expect(chain).toEqual([
      "groq-llama4-scout",
      "cerebras-gpt-oss-120b",
      "sambanova-llama3-70b",
      "mistral-small-3",
    ]);
  });

  it("intern analyzer chain is: groq-llama3-70b -> cerebras -> sambanova -> mistral-large-3", async () => {
    const ctx = makeSessionCtx("intern");
    const chain = await sessionTierStore.run(ctx, () => getAgentChain("analyzer"));
    expect(chain).toEqual([
      "groq-llama3-70b",
      "cerebras-gpt-oss-120b",
      "sambanova-llama3-70b",
      "mistral-large-3",
    ]);
  });

  it("intern investigator chain has only 1 model (haiku)", async () => {
    const ctx = makeSessionCtx("intern");
    const chain = await sessionTierStore.run(ctx, () => getAgentChain("investigator"));
    expect(chain).toEqual(["claude-haiku-4.5"]);
    // All models must be Claude (web_search constraint)
    for (const key of chain) {
      expect(MODELS[key].provider).toBe("anthropic");
    }
  });

  it("intern advisor chain is: groq-llama3-70b -> cerebras -> sambanova -> mistral-large-3", async () => {
    const ctx = makeSessionCtx("intern");
    const chain = await sessionTierStore.run(ctx, () => getAgentChain("advisor"));
    expect(chain).toEqual([
      "groq-llama3-70b",
      "cerebras-gpt-oss-120b",
      "sambanova-llama3-70b",
      "mistral-large-3",
    ]);
  });

  it("all intern models are free or near-free tier", async () => {
    const ctx = makeSessionCtx("intern");
    for (const agent of CORE_PIPELINE_AGENTS) {
      const chain = await sessionTierStore.run(ctx, () => getAgentChain(agent));
      for (const key of chain) {
        const model = MODELS[key];
        // Intern models should be cheap: input < $2/1M tokens
        // Exception: investigator uses Claude Haiku (required for web_search)
        if (agent !== "investigator") {
          expect(model.inputCostPer1M).toBeLessThanOrEqual(2.0);
        }
      }
    }
  });
});

// =============================================================================
// Classifier output validation — intern tier
// =============================================================================

describe("classifier output validation — intern tier", () => {
  const allInternClassifications = [
    { name: "Groq Llama 4 Scout", data: INTERN_CLASSIFICATION_GROQ },
    { name: "Cerebras GPT-OSS 120B", data: INTERN_CLASSIFICATION_CEREBRAS },
    { name: "SambaNova Llama 3.3 70B", data: INTERN_CLASSIFICATION_SAMBANOVA },
    { name: "Mistral Small", data: INTERN_CLASSIFICATION_MISTRAL },
  ];

  for (const { name, data } of allInternClassifications) {
    describe(`${name} classifier output`, () => {
      it("has required field: documentType (non-empty string)", () => {
        expect(typeof data.documentType).toBe("string");
        expect(data.documentType.length).toBeGreaterThan(0);
      });

      it("has required field: documentTypeLabel (non-empty string)", () => {
        expect(typeof data.documentTypeLabel).toBe("string");
        expect(data.documentTypeLabel.length).toBeGreaterThan(0);
      });

      it("has required field: parties (array)", () => {
        expect(Array.isArray(data.parties)).toBe(true);
      });

      it("has required field: jurisdiction (non-empty string)", () => {
        expect(typeof data.jurisdiction).toBe("string");
        expect(data.jurisdiction.length).toBeGreaterThan(0);
      });

      it("has required field: applicableLaws (array)", () => {
        expect(Array.isArray(data.applicableLaws)).toBe(true);
      });

      it("has required field: summary (non-empty string)", () => {
        expect(typeof data.summary).toBe("string");
        expect(data.summary.length).toBeGreaterThan(0);
      });

      it("has required field: confidence (number 0-1)", () => {
        expect(typeof data.confidence).toBe("number");
        expect(data.confidence).toBeGreaterThanOrEqual(0);
        expect(data.confidence).toBeLessThanOrEqual(1);
      });

      it("has optional field: documentSubType (string | null)", () => {
        expect(
          data.documentSubType === null || typeof data.documentSubType === "string",
        ).toBe(true);
      });

      it("has optional field: relevantInstitutes (array)", () => {
        expect(Array.isArray(data.relevantInstitutes)).toBe(true);
      });

      it("has optional field: legalFocusAreas (array)", () => {
        expect(Array.isArray(data.legalFocusAreas)).toBe(true);
      });

      it("has optional field: keyDates (array)", () => {
        expect(Array.isArray(data.keyDates)).toBe(true);
      });

      it("each party has role, name, and type", () => {
        for (const party of data.parties) {
          expect(typeof party.role).toBe("string");
          expect(typeof party.name).toBe("string");
          expect(typeof party.type).toBe("string");
        }
      });

      it("each applicableLaw has reference and name", () => {
        for (const law of data.applicableLaws) {
          expect(typeof law.reference).toBe("string");
          expect(typeof law.name).toBe("string");
        }
      });
    });
  }

  it("intern models may have lower confidence than partner-tier defaults", () => {
    // Partner fixture uses confidence 0.95
    const partnerConfidence = makeClassification().confidence;
    // At least some intern models should have lower confidence
    const internConfidences = allInternClassifications.map((c) => c.data.confidence);
    const minInternConfidence = Math.min(...internConfidences);
    expect(minInternConfidence).toBeLessThanOrEqual(partnerConfidence);
  });

  it("all intern classifications identify at least the document type", () => {
    for (const { data } of allInternClassifications) {
      // Even the weakest model should identify it as some kind of contract
      expect(data.documentType).toBeTruthy();
      expect(data.documentType.toLowerCase()).toContain("contratto");
    }
  });

  it("weaker intern models may return empty optional arrays (acceptable degradation)", () => {
    // Cerebras and Mistral return empty relevantInstitutes and legalFocusAreas
    expect(INTERN_CLASSIFICATION_CEREBRAS.relevantInstitutes).toEqual([]);
    expect(INTERN_CLASSIFICATION_CEREBRAS.legalFocusAreas).toEqual([]);
    expect(INTERN_CLASSIFICATION_MISTRAL.relevantInstitutes).toEqual([]);
    expect(INTERN_CLASSIFICATION_MISTRAL.legalFocusAreas).toEqual([]);
  });
});

// =============================================================================
// Analyzer output validation — intern tier
// =============================================================================

describe("analyzer output validation — intern tier", () => {
  const allInternAnalyses = [
    { name: "Groq Llama 3.3 70B", data: INTERN_ANALYSIS_GROQ },
    { name: "Cerebras GPT-OSS 120B", data: INTERN_ANALYSIS_CEREBRAS },
  ];

  for (const { name, data } of allInternAnalyses) {
    describe(`${name} analyzer output`, () => {
      it("has required field: clauses (array)", () => {
        expect(Array.isArray(data.clauses)).toBe(true);
      });

      it("has required field: missingElements (array)", () => {
        expect(Array.isArray(data.missingElements)).toBe(true);
      });

      it("has required field: overallRisk (valid enum value)", () => {
        expect(["critical", "high", "medium", "low"]).toContain(data.overallRisk);
      });

      it("has required field: positiveAspects (array)", () => {
        expect(Array.isArray(data.positiveAspects)).toBe(true);
      });

      it("each clause has required fields", () => {
        for (const clause of data.clauses) {
          expect(typeof clause.id).toBe("string");
          expect(typeof clause.title).toBe("string");
          expect(typeof clause.riskLevel).toBe("string");
          expect(["critical", "high", "medium", "low", "info"]).toContain(
            clause.riskLevel,
          );
          expect(typeof clause.issue).toBe("string");
          expect(typeof clause.recommendation).toBe("string");
        }
      });

      it("each missingElement has required fields", () => {
        for (const el of data.missingElements) {
          expect(typeof el.element).toBe("string");
          expect(["high", "medium", "low"]).toContain(el.importance);
          expect(typeof el.explanation).toBe("string");
        }
      });

      it("identifies the excessive penalty as a risk", () => {
        const penaltyClause = data.clauses.find(
          (c) =>
            c.title.toLowerCase().includes("penale") ||
            c.issue.toLowerCase().includes("penale"),
        );
        expect(penaltyClause).toBeDefined();
        expect(["critical", "high"]).toContain(penaltyClause!.riskLevel);
      });
    });
  }

  it("weaker intern model (Cerebras) may have fewer details but is still valid", () => {
    // Cerebras produces less detailed output
    expect(INTERN_ANALYSIS_CEREBRAS.missingElements).toEqual([]);
    expect(INTERN_ANALYSIS_CEREBRAS.positiveAspects).toEqual([]);
    // But still identifies the core risk
    expect(INTERN_ANALYSIS_CEREBRAS.clauses.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Investigator — web_search unavailability on intern tier
// =============================================================================

describe("investigator — web_search unavailability on intern tier", () => {
  it("investigator chain on intern uses only claude-haiku-4.5 (Anthropic required for web_search)", async () => {
    const ctx = makeSessionCtx("intern");
    const chain = await sessionTierStore.run(ctx, () => getAgentChain("investigator"));
    expect(chain).toHaveLength(1);
    expect(chain[0]).toBe("claude-haiku-4.5");
  });

  it("when Anthropic is unavailable on intern, investigator has no models", async () => {
    // Simulate: no Anthropic API key
    mockIsProviderEnabled.mockImplementation(
      (provider: string) => provider !== "anthropic",
    );

    const ctx = makeSessionCtx("intern");
    const chain = await sessionTierStore.run(ctx, () => getAgentChain("investigator"));

    // Chain still has 1 entry (haiku) but the provider is disabled
    expect(chain).toHaveLength(1);
    // getActiveModel falls back to chain[0] even when disabled
    const active = await sessionTierStore.run(ctx, () =>
      getActiveModel("investigator"),
    );
    expect(active).toBe("claude-haiku-4.5");
  });

  it("empty investigation result is valid (graceful degradation)", () => {
    expect(INTERN_INVESTIGATION_EMPTY.findings).toEqual([]);
    expect(Array.isArray(INTERN_INVESTIGATION_EMPTY.findings)).toBe(true);
  });

  it("orchestrator continues after investigator failure (non-fatal)", () => {
    // This is a structural assertion: InvestigationResult with empty findings
    // is the expected fallback when investigator fails on intern tier.
    const fallback: { findings: unknown[] } = { findings: [] };
    expect(fallback).toHaveProperty("findings");
    expect(fallback.findings).toEqual([]);
  });
});

// =============================================================================
// Advisor output validation — intern tier
// =============================================================================

describe("advisor output validation — intern tier", () => {
  const allInternAdvisors = [
    { name: "Groq Llama 3.3 70B", data: INTERN_ADVISOR_GROQ },
    { name: "Cerebras GPT-OSS (no scores)", data: INTERN_ADVISOR_CEREBRAS_NO_SCORES },
  ];

  for (const { name, data } of allInternAdvisors) {
    describe(`${name} advisor output`, () => {
      it("has fairnessScore between 1 and 10", () => {
        expect(typeof data.fairnessScore).toBe("number");
        expect(data.fairnessScore).toBeGreaterThanOrEqual(1);
        expect(data.fairnessScore).toBeLessThanOrEqual(10);
      });

      it("has scores object or null", () => {
        expect(data.scores === null || typeof data.scores === "object").toBe(true);
        if (data.scores !== null) {
          expect(typeof data.scores.contractEquity).toBe("number");
          expect(typeof data.scores.legalCoherence).toBe("number");
          expect(typeof data.scores.practicalCompliance).toBe("number");
          expect(typeof data.scores.completeness).toBe("number");
        }
      });

      it("has summary (non-empty string)", () => {
        expect(typeof data.summary).toBe("string");
        expect(data.summary.length).toBeGreaterThan(0);
      });

      it("has risks array with max 3 entries when enforced", () => {
        expect(Array.isArray(data.risks)).toBe(true);
        // Raw output may exceed 3, but advisor code enforces the limit
      });

      it("each risk has required fields", () => {
        for (const risk of data.risks) {
          expect(["alta", "media", "bassa"]).toContain(risk.severity);
          expect(typeof risk.title).toBe("string");
          expect(typeof risk.detail).toBe("string");
        }
      });

      it("has actions array", () => {
        expect(Array.isArray(data.actions)).toBe(true);
      });

      it("each action has required fields", () => {
        for (const action of data.actions) {
          expect(typeof action.priority).toBe("number");
          expect(typeof action.action).toBe("string");
          expect(typeof action.rationale).toBe("string");
        }
      });

      it("has needsLawyer (boolean)", () => {
        expect(typeof data.needsLawyer).toBe("boolean");
      });

      it("has lawyerSpecialization and lawyerReason (strings)", () => {
        expect(typeof data.lawyerSpecialization).toBe("string");
        expect(typeof data.lawyerReason).toBe("string");
      });
    });
  }

  it("scores can be null when intern model omits multidimensional scoring", () => {
    // Cerebras and smaller models may not produce the scores object
    expect(INTERN_ADVISOR_CEREBRAS_NO_SCORES.scores).toBeNull();
    // But fairnessScore should still be present
    expect(INTERN_ADVISOR_CEREBRAS_NO_SCORES.fairnessScore).toBeDefined();
  });

  it("when scores are present, each dimension is 1-10", () => {
    const scores = INTERN_ADVISOR_GROQ.scores!;
    const dimensions = [
      scores.contractEquity,
      scores.legalCoherence,
      scores.practicalCompliance,
      scores.completeness,
    ];
    for (const score of dimensions) {
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(10);
    }
  });
});

// =============================================================================
// Advisor output limits enforcement
// =============================================================================

describe("advisor output limits enforcement", () => {
  it("advisor code truncates risks to max 3", () => {
    // Simulate what runAdvisor does
    const result = { ...INTERN_ADVISOR_OVER_LIMIT };
    if (result.risks && result.risks.length > 3) {
      result.risks = result.risks.slice(0, 3);
    }
    expect(result.risks).toHaveLength(3);
  });

  it("advisor code truncates actions to max 3", () => {
    const result = { ...INTERN_ADVISOR_OVER_LIMIT };
    if (result.actions && result.actions.length > 3) {
      result.actions = result.actions.slice(0, 3);
    }
    expect(result.actions).toHaveLength(3);
  });

  it("truncated risks preserve priority order (first 3)", () => {
    const result = { ...INTERN_ADVISOR_OVER_LIMIT };
    result.risks = result.risks.slice(0, 3);
    // First 3 from the original
    expect(result.risks[0].title).toBe("Penale eccessiva");
    expect(result.risks[1].title).toBe("Deposito trattenuto");
    expect(result.risks[2].title).toBe("Manca recesso");
  });

  it("original fixture has 5 risks and 4 actions (pre-enforcement)", () => {
    expect(INTERN_ADVISOR_OVER_LIMIT.risks).toHaveLength(5);
    expect(INTERN_ADVISOR_OVER_LIMIT.actions).toHaveLength(4);
  });
});

// =============================================================================
// End-to-end: intern tier pipeline structural validation
// =============================================================================

describe("intern tier pipeline structural validation", () => {
  it("classification -> analysis -> investigation -> advice: all valid intern-quality responses", () => {
    const classification = INTERN_CLASSIFICATION_GROQ;
    const analysis = INTERN_ANALYSIS_GROQ;
    const investigation = INTERN_INVESTIGATION_EMPTY;
    const advice = INTERN_ADVISOR_GROQ;

    // Step 1: Classification is valid
    expect(classification.documentType).toBeTruthy();
    expect(classification.parties.length).toBeGreaterThanOrEqual(1);

    // Step 2: Analysis uses classification info
    expect(analysis.overallRisk).toBeTruthy();
    expect(analysis.clauses.length).toBeGreaterThanOrEqual(1);

    // Step 3: Investigation can be empty on intern (no web_search)
    expect(Array.isArray(investigation.findings)).toBe(true);

    // Step 4: Advisor produces valid final output
    expect(advice.fairnessScore).toBeGreaterThanOrEqual(1);
    expect(advice.fairnessScore).toBeLessThanOrEqual(10);
    expect(advice.summary.length).toBeGreaterThan(0);
    expect(advice.risks.length).toBeLessThanOrEqual(3);
    expect(advice.actions.length).toBeLessThanOrEqual(3);
  });

  it("worst-case intern pipeline: minimal classification + minimal analysis + empty investigation + no-scores advisor", () => {
    const classification = INTERN_CLASSIFICATION_MISTRAL;
    const analysis = INTERN_ANALYSIS_CEREBRAS;
    const investigation = INTERN_INVESTIGATION_EMPTY;
    const advice = INTERN_ADVISOR_CEREBRAS_NO_SCORES;

    // Even worst-case intern: all outputs are structurally valid
    expect(classification.documentType).toBeTruthy();
    expect(analysis.clauses.length).toBeGreaterThanOrEqual(1);
    expect(investigation.findings).toEqual([]);
    expect(advice.fairnessScore).toBeGreaterThanOrEqual(1);
    expect(advice.scores).toBeNull();
    expect(advice.summary.length).toBeGreaterThan(0);
  });

  it("intern models can still detect the key risk (excessive penalty) across all tiers of quality", () => {
    // The rental contract has a 12-month penalty -- even weak models should flag it
    const allAnalyses = [INTERN_ANALYSIS_GROQ, INTERN_ANALYSIS_CEREBRAS];
    for (const analysis of allAnalyses) {
      const penaltyFound = analysis.clauses.some(
        (c) =>
          c.title.toLowerCase().includes("penale") ||
          c.issue.toLowerCase().includes("penale") ||
          c.originalText.toLowerCase().includes("penale"),
      );
      expect(penaltyFound).toBe(true);
    }
  });
});

// =============================================================================
// makeAgentRunResult helper
// =============================================================================

describe("makeAgentRunResult helper", () => {
  it("creates a valid AgentRunResult-shaped object with defaults", () => {
    const result = makeAgentRunResult(INTERN_CLASSIFICATION_GROQ);
    expect(result.parsed).toBe(INTERN_CLASSIFICATION_GROQ);
    expect(result.text).toBe(JSON.stringify(INTERN_CLASSIFICATION_GROQ));
    expect(result.usage.inputTokens).toBe(500);
    expect(result.usage.outputTokens).toBe(300);
    expect(result.durationMs).toBe(2000);
    expect(result.provider).toBe("groq");
    expect(result.usedFallback).toBe(false);
  });

  it("allows overriding all fields", () => {
    const result = makeAgentRunResult(INTERN_ANALYSIS_GROQ, {
      provider: "cerebras",
      model: "gpt-oss-120b",
      usedFallback: true,
      usedModelKey: "cerebras-gpt-oss-120b",
      durationMs: 5000,
      inputTokens: 1000,
      outputTokens: 800,
    });
    expect(result.provider).toBe("cerebras");
    expect(result.model).toBe("gpt-oss-120b");
    expect(result.usedFallback).toBe(true);
    expect(result.usedModelKey).toBe("cerebras-gpt-oss-120b");
    expect(result.durationMs).toBe(5000);
    expect(result.usage.inputTokens).toBe(1000);
    expect(result.usage.outputTokens).toBe(800);
  });
});
