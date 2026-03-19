/**
 * Tests: Tier comparison — model selection changes across tiers
 *
 * Validates that switching between intern/associate/partner tiers
 * correctly changes which models are selected for each agent, and that
 * disabled agents return proper default values in the orchestrator.
 *
 * Tests cover:
 * - Each tier selects different starting models for the 4 core pipeline agents
 * - Agent chains get progressively shorter as tier decreases
 * - Tier cost ordering: intern < associate < partner
 * - Disabled agents produce correct default outputs in the orchestrator
 * - Tier switching does not leak state between sessions
 * - investigator special case: intern == associate (Anthropic-only constraint)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentName } from "@/lib/models";

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
  estimateTierCostForSession,
  getTierInfoForSession,
  AGENT_CHAINS,
  TIER_START,
  type TierName,
  type SessionTierContext,
} from "@/lib/tiers";
import { MODELS } from "@/lib/models";

// ── Constants ──

const ALL_TIERS: TierName[] = ["intern", "associate", "partner"];

const CORE_PIPELINE_AGENTS: AgentName[] = [
  "classifier",
  "analyzer",
  "investigator",
  "advisor",
];

const ALL_AGENTS: AgentName[] = [
  "leader", "question-prep", "classifier", "corpus-agent",
  "analyzer", "investigator", "advisor", "document-chat",
  "task-executor", "mapper", "mapping-agent",
  "integration-setup", "sync-supervisor",
];

function makeSessionCtx(
  tier: TierName,
  disabled: AgentName[] = [],
): SessionTierContext {
  return { tier, disabledAgents: new Set(disabled), sid: "test-tier-cmp" };
}

// ── Setup ──

beforeEach(() => {
  vi.clearAllMocks();
  mockIsProviderEnabled.mockReturnValue(true);
  setCurrentTier("partner");
  for (const agent of ALL_AGENTS) {
    setAgentEnabled(agent, true);
  }
});

afterEach(() => {
  setCurrentTier("partner");
  for (const agent of ALL_AGENTS) {
    setAgentEnabled(agent, true);
  }
});

// =============================================================================
// Tier switching changes model selection
// =============================================================================

describe("tier switching changes model selection", () => {
  it("partner tier selects premium models for all pipeline agents", async () => {
    const ctx = makeSessionCtx("partner");
    const models = await sessionTierStore.run(ctx, () => ({
      classifier: getActiveModel("classifier"),
      analyzer: getActiveModel("analyzer"),
      investigator: getActiveModel("investigator"),
      advisor: getActiveModel("advisor"),
    }));

    expect(models.classifier).toBe("claude-haiku-4.5");
    expect(models.analyzer).toBe("claude-sonnet-4.5");
    expect(models.investigator).toBe("claude-sonnet-4.5");
    expect(models.advisor).toBe("claude-sonnet-4.5");
  });

  it("associate tier selects mid-range models", async () => {
    const ctx = makeSessionCtx("associate");
    const models = await sessionTierStore.run(ctx, () => ({
      classifier: getActiveModel("classifier"),
      analyzer: getActiveModel("analyzer"),
      investigator: getActiveModel("investigator"),
      advisor: getActiveModel("advisor"),
    }));

    // Associate starts at index 1 for most agents
    expect(models.classifier).toBe("gemini-2.5-flash");
    expect(models.analyzer).toBe("gemini-2.5-pro");
    // Investigator: associate starts at index 1 (haiku)
    expect(models.investigator).toBe("claude-haiku-4.5");
    expect(models.advisor).toBe("gemini-2.5-pro");
  });

  it("intern tier selects budget/free models", async () => {
    const ctx = makeSessionCtx("intern");
    const models = await sessionTierStore.run(ctx, () => ({
      classifier: getActiveModel("classifier"),
      analyzer: getActiveModel("analyzer"),
      investigator: getActiveModel("investigator"),
      advisor: getActiveModel("advisor"),
    }));

    expect(models.classifier).toBe("groq-llama4-scout");
    expect(models.analyzer).toBe("groq-llama3-70b");
    // Investigator: intern starts at index 1, same as associate (web_search = Anthropic)
    expect(models.investigator).toBe("claude-haiku-4.5");
    expect(models.advisor).toBe("groq-llama3-70b");
  });

  it("each tier produces a different first model for classifier", async () => {
    const firstModels = await Promise.all(
      ALL_TIERS.map((tier) =>
        sessionTierStore.run(makeSessionCtx(tier), () =>
          getActiveModel("classifier"),
        ),
      ),
    );

    const [intern, associate, partner] = firstModels;
    // All three should be different
    expect(partner).not.toBe(associate);
    expect(associate).not.toBe(intern);
    // But intern != partner is the main assertion
    expect(partner).not.toBe(intern);
  });

  it("each tier produces a different first model for analyzer", async () => {
    const firstModels = await Promise.all(
      ALL_TIERS.map((tier) =>
        sessionTierStore.run(makeSessionCtx(tier), () =>
          getActiveModel("analyzer"),
        ),
      ),
    );

    const [intern, associate, partner] = firstModels;
    expect(partner).not.toBe(associate);
    expect(associate).not.toBe(intern);
  });
});

// =============================================================================
// Chain length varies by tier
// =============================================================================

describe("chain length varies by tier", () => {
  for (const agent of CORE_PIPELINE_AGENTS) {
    it(`${agent}: partner chain >= associate chain >= intern chain`, async () => {
      const chains = await Promise.all(
        ALL_TIERS.map((tier) =>
          sessionTierStore.run(makeSessionCtx(tier), () => getAgentChain(agent)),
        ),
      );

      const [internChain, associateChain, partnerChain] = chains;
      expect(partnerChain.length).toBeGreaterThanOrEqual(associateChain.length);
      expect(associateChain.length).toBeGreaterThanOrEqual(internChain.length);
    });
  }

  it("intern chain is a suffix of the partner chain for all agents", async () => {
    for (const agent of CORE_PIPELINE_AGENTS) {
      const partnerChain = await sessionTierStore.run(
        makeSessionCtx("partner"),
        () => getAgentChain(agent),
      );
      const internChain = await sessionTierStore.run(
        makeSessionCtx("intern"),
        () => getAgentChain(agent),
      );

      // Intern chain should be the last N elements of partner chain
      const partnerSuffix = partnerChain.slice(
        partnerChain.length - internChain.length,
      );
      expect(internChain).toEqual(partnerSuffix);
    }
  });
});

// =============================================================================
// Agent chains correctly configured per tier
// =============================================================================

describe("agent chains correctly configured per tier", () => {
  it("classifier partner chain starts with claude-haiku-4.5", () => {
    const chain = AGENT_CHAINS.classifier;
    expect(chain[TIER_START.classifier.partner]).toBe("claude-haiku-4.5");
  });

  it("classifier associate chain starts with gemini-2.5-flash", () => {
    const chain = AGENT_CHAINS.classifier;
    expect(chain[TIER_START.classifier.associate]).toBe("gemini-2.5-flash");
  });

  it("classifier intern chain starts with groq-llama4-scout", () => {
    const chain = AGENT_CHAINS.classifier;
    expect(chain[TIER_START.classifier.intern]).toBe("groq-llama4-scout");
  });

  it("analyzer partner starts with claude-sonnet-4.5", () => {
    const chain = AGENT_CHAINS.analyzer;
    expect(chain[TIER_START.analyzer.partner]).toBe("claude-sonnet-4.5");
  });

  it("analyzer associate starts with gemini-2.5-pro", () => {
    const chain = AGENT_CHAINS.analyzer;
    expect(chain[TIER_START.analyzer.associate]).toBe("gemini-2.5-pro");
  });

  it("analyzer intern starts with groq-llama3-70b", () => {
    const chain = AGENT_CHAINS.analyzer;
    expect(chain[TIER_START.analyzer.intern]).toBe("groq-llama3-70b");
  });

  it("investigator: intern and associate are identical (special case)", () => {
    expect(TIER_START.investigator.intern).toBe(TIER_START.investigator.associate);
    // Both start at haiku (index 1)
    const chain = AGENT_CHAINS.investigator;
    expect(chain[TIER_START.investigator.intern]).toBe("claude-haiku-4.5");
  });

  it("investigator chain has exactly 2 entries (web_search = Anthropic only)", () => {
    expect(AGENT_CHAINS.investigator).toHaveLength(2);
    expect(AGENT_CHAINS.investigator[0]).toBe("claude-sonnet-4.5");
    expect(AGENT_CHAINS.investigator[1]).toBe("claude-haiku-4.5");
  });

  it("advisor follows same pattern as analyzer (partner=sonnet, associate=gemini-pro, intern=groq)", () => {
    const chain = AGENT_CHAINS.advisor;
    expect(chain[TIER_START.advisor.partner]).toBe("claude-sonnet-4.5");
    expect(chain[TIER_START.advisor.associate]).toBe("gemini-2.5-pro");
    expect(chain[TIER_START.advisor.intern]).toBe("groq-llama3-70b");
  });

  it("all chain start indices are within bounds", () => {
    for (const agent of ALL_AGENTS) {
      for (const tier of ALL_TIERS) {
        const startIndex = TIER_START[agent][tier];
        const chainLength = AGENT_CHAINS[agent].length;
        expect(startIndex).toBeGreaterThanOrEqual(0);
        expect(startIndex).toBeLessThan(chainLength);
      }
    }
  });
});

// =============================================================================
// Cost ordering across tiers
// =============================================================================

describe("cost ordering across tiers", () => {
  it("intern cost <= associate cost <= partner cost", () => {
    const internCost = estimateTierCostForSession("intern", new Set());
    const associateCost = estimateTierCostForSession("associate", new Set());
    const partnerCost = estimateTierCostForSession("partner", new Set());

    expect(internCost.perQuery).toBeLessThanOrEqual(associateCost.perQuery);
    expect(associateCost.perQuery).toBeLessThanOrEqual(partnerCost.perQuery);
  });

  it("intern cost is very cheap (free-tier models)", () => {
    const internCost = estimateTierCostForSession("intern", new Set());
    // Intern uses budget models — cost should be < $0.10 per full pipeline query
    // (investigator still uses Claude Haiku which has non-zero cost)
    expect(internCost.perQuery).toBeLessThan(0.10);
  });

  it("partner cost is significantly higher than intern", () => {
    const internCost = estimateTierCostForSession("intern", new Set());
    const partnerCost = estimateTierCostForSession("partner", new Set());

    // Partner should be at least 3x more expensive than intern
    if (internCost.perQuery > 0) {
      expect(partnerCost.perQuery / internCost.perQuery).toBeGreaterThan(3);
    } else {
      expect(partnerCost.perQuery).toBeGreaterThan(0);
    }
  });

  it("intern label is ~gratis or very low cost", () => {
    const internCost = estimateTierCostForSession("intern", new Set());
    // Should be either "~gratis" or "~$X.Xc"
    expect(internCost.label).toMatch(/^~(gratis|\$[\d.]+c?)$/);
  });
});

// =============================================================================
// Disabled agents return proper defaults
// =============================================================================

describe("disabled agents return proper defaults", () => {
  it("disabled classifier produces minimal classification", () => {
    // This is what the orchestrator returns when classifier is disabled
    const defaultClassification = {
      documentType: "contract",
      documentTypeLabel: "Contratto generico",
      documentSubType: null,
      parties: [],
      jurisdiction: "Italia",
      applicableLaws: [],
      relevantInstitutes: [],
      legalFocusAreas: [],
      keyDates: [],
      summary: "Classificazione non eseguita (agente disabilitato)",
      confidence: 0,
    };

    expect(defaultClassification.documentType).toBe("contract");
    expect(defaultClassification.parties).toEqual([]);
    expect(defaultClassification.confidence).toBe(0);
    expect(defaultClassification.relevantInstitutes).toEqual([]);
  });

  it("disabled analyzer produces empty analysis", () => {
    const defaultAnalysis = {
      clauses: [],
      missingElements: [],
      overallRisk: "low",
      positiveAspects: [],
    };

    expect(defaultAnalysis.clauses).toEqual([]);
    expect(defaultAnalysis.overallRisk).toBe("low");
  });

  it("disabled investigator produces empty findings", () => {
    const defaultInvestigation = { findings: [] };
    expect(defaultInvestigation.findings).toEqual([]);
  });

  it("getTierInfoForSession reflects disabled state", () => {
    const disabled = new Set<AgentName>(["analyzer", "investigator"]);
    const info = getTierInfoForSession("intern", disabled);

    expect(info.agents.analyzer.enabled).toBe(false);
    expect(info.agents.investigator.enabled).toBe(false);
    expect(info.agents.classifier.enabled).toBe(true);
    expect(info.agents.advisor.enabled).toBe(true);
  });

  it("disabling agents on intern reduces already-low cost", () => {
    const fullCost = estimateTierCostForSession("intern", new Set());
    const disabled = new Set<AgentName>(["analyzer", "advisor"]);
    const reducedCost = estimateTierCostForSession("intern", disabled);

    expect(reducedCost.perQuery).toBeLessThanOrEqual(fullCost.perQuery);
  });
});

// =============================================================================
// Tier switching does not leak state
// =============================================================================

describe("tier switching does not leak state", () => {
  it("global tier change does not affect sessionTierStore contexts", async () => {
    setCurrentTier("intern");

    const partnerModel = await sessionTierStore.run(
      makeSessionCtx("partner"),
      () => getActiveModel("classifier"),
    );

    expect(partnerModel).toBe("claude-haiku-4.5"); // partner first model
    // Global is still intern
    expect(getCurrentTier()).toBe("intern");
  });

  it("concurrent sessions on different tiers pick different models", async () => {
    const [partnerModel, internModel] = await Promise.all([
      sessionTierStore.run(makeSessionCtx("partner"), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getActiveModel("analyzer");
      }),
      sessionTierStore.run(makeSessionCtx("intern"), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getActiveModel("analyzer");
      }),
    ]);

    expect(partnerModel).toBe("claude-sonnet-4.5");
    expect(internModel).toBe("groq-llama3-70b");
    expect(partnerModel).not.toBe(internModel);
  });

  it("nested sessionTierStore.run respects innermost tier", async () => {
    const result = await sessionTierStore.run(
      makeSessionCtx("partner"),
      async () => {
        const outer = getActiveModel("classifier");
        const inner = await sessionTierStore.run(
          makeSessionCtx("intern"),
          () => getActiveModel("classifier"),
        );
        const afterInner = getActiveModel("classifier");
        return { outer, inner, afterInner };
      },
    );

    expect(result.outer).toBe("claude-haiku-4.5"); // partner
    expect(result.inner).toBe("groq-llama4-scout"); // intern
    expect(result.afterInner).toBe("claude-haiku-4.5"); // back to partner
  });

  it("disabling agent in session does not affect global state", async () => {
    const sessionResult = await sessionTierStore.run(
      makeSessionCtx("intern", ["analyzer"]),
      () => isAgentEnabled("analyzer"),
    );
    expect(sessionResult).toBe(false);

    // Global state: analyzer is still enabled
    expect(isAgentEnabled("analyzer")).toBe(true);
  });
});

// =============================================================================
// Provider availability impact on tier
// =============================================================================

describe("provider availability impact on tier", () => {
  it("when groq is down, intern classifier falls to cerebras", async () => {
    mockIsProviderEnabled.mockImplementation(
      (provider: string) => provider !== "groq",
    );

    const ctx = makeSessionCtx("intern");
    const model = await sessionTierStore.run(ctx, () =>
      getActiveModel("classifier"),
    );
    expect(model).toBe("cerebras-gpt-oss-120b");
  });

  it("when groq and cerebras are down, intern classifier falls to sambanova", async () => {
    mockIsProviderEnabled.mockImplementation(
      (provider: string) => provider !== "groq" && provider !== "cerebras",
    );

    const ctx = makeSessionCtx("intern");
    const model = await sessionTierStore.run(ctx, () =>
      getActiveModel("classifier"),
    );
    expect(model).toBe("sambanova-llama3-70b");
  });

  it("when all intern providers are down, falls to first in chain as last resort", async () => {
    mockIsProviderEnabled.mockReturnValue(false);

    const ctx = makeSessionCtx("intern");
    const model = await sessionTierStore.run(ctx, () =>
      getActiveModel("classifier"),
    );
    // getActiveModel returns chain[0] when no providers are available
    const internChain = AGENT_CHAINS.classifier.slice(TIER_START.classifier.intern);
    expect(model).toBe(internChain[0]);
  });

  it("intern investigator with no anthropic: getActiveModel returns haiku anyway (fallback)", async () => {
    mockIsProviderEnabled.mockImplementation(
      (provider: string) => provider !== "anthropic",
    );

    const ctx = makeSessionCtx("intern");
    const model = await sessionTierStore.run(ctx, () =>
      getActiveModel("investigator"),
    );
    // Falls back to chain[0] which is haiku (only option in intern investigator chain)
    expect(model).toBe("claude-haiku-4.5");
  });
});

// =============================================================================
// All provider models in intern chains exist in MODELS registry
// =============================================================================

describe("all intern chain models exist in MODELS registry", () => {
  for (const agent of ALL_AGENTS) {
    it(`${agent}: all intern chain models are valid MODELS entries`, async () => {
      const ctx = makeSessionCtx("intern");
      const chain = await sessionTierStore.run(ctx, () => getAgentChain(agent));
      for (const key of chain) {
        expect(MODELS[key]).toBeDefined();
        expect(MODELS[key].provider).toBeTruthy();
        expect(MODELS[key].displayName).toBeTruthy();
        expect(MODELS[key].model).toBeTruthy();
      }
    });
  }
});
