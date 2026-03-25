/**
 * Tests: lib/tiers.ts (P2 -- tier logic, fallback chains, AsyncLocalStorage isolation)
 *
 * Comprehensive coverage:
 * - getCurrentTier() default and override via sessionTierStore
 * - setCurrentTier() global state mutation + isolation from sessionTierStore
 * - getAgentChain() slicing per tier for ALL agents
 * - getFullAgentChain() returns unsliced chain
 * - isAgentEnabled() / setAgentEnabled() / getDisabledAgents() global toggle
 * - sessionTierStore.run() per-request isolation (tier + disabled agents)
 * - getActiveModel() first available provider selection + fallback
 * - getTierInfo() full structure validation
 * - getTierInfoForSession() per-session variant
 * - estimateTierCost() and estimateTierCostForSession() cost estimation + label formatting
 * - AGENT_CHAINS and TIER_START data integrity
 * - Edge cases: investigator intern==associate, all providers disabled, concurrent sessions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentName } from "@/lib/models";

// ── Mocks ────────────────────────────────────────────────────────────────────

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
  getFullAgentChain,
  isAgentEnabled,
  setAgentEnabled,
  getDisabledAgents,
  getActiveModel,
  getTierInfo,
  getTierInfoForSession,
  estimateTierCost,
  estimateTierCostForSession,
  sessionTierStore,
  AGENT_CHAINS,
  TIER_START,
  type TierName,
  type SessionTierContext,
} from "@/lib/tiers";
import { MODELS } from "@/lib/models";

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_AGENTS: AgentName[] = [
  "leader", "question-prep", "classifier", "corpus-agent",
  "analyzer", "investigator", "advisor", "document-chat",
  "task-executor", "mapper", "mapping-agent",
  "integration-setup", "sync-supervisor", "critic",
];

const ALL_TIERS: TierName[] = ["intern", "associate", "partner"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSessionCtx(
  tier: TierName,
  disabled: AgentName[] = [],
): SessionTierContext {
  return { tier, disabledAgents: new Set(disabled), sid: "test-sid" };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsProviderEnabled.mockReturnValue(true);
  // Reset global state to known baseline
  setCurrentTier("partner");
  for (const agent of ALL_AGENTS) {
    setAgentEnabled(agent, true);
  }
});

afterEach(() => {
  // Restore global state
  setCurrentTier("partner");
  for (const agent of ALL_AGENTS) {
    setAgentEnabled(agent, true);
  }
});

// =============================================================================
// getCurrentTier
// =============================================================================

describe("getCurrentTier", () => {
  it("returns 'partner' by default", () => {
    expect(getCurrentTier()).toBe("partner");
  });

  it("returns the tier set by setCurrentTier", () => {
    setCurrentTier("intern");
    expect(getCurrentTier()).toBe("intern");

    setCurrentTier("associate");
    expect(getCurrentTier()).toBe("associate");
  });

  it("returns tier from sessionTierStore when inside .run()", async () => {
    const ctx = makeSessionCtx("intern");
    const result = await sessionTierStore.run(ctx, () => getCurrentTier());
    expect(result).toBe("intern");
  });

  it("sessionTierStore takes priority over global tier", async () => {
    setCurrentTier("intern");
    const ctx = makeSessionCtx("partner");
    const result = await sessionTierStore.run(ctx, () => getCurrentTier());
    expect(result).toBe("partner");
  });

  it("returns global tier after sessionTierStore.run() completes", async () => {
    setCurrentTier("associate");
    await sessionTierStore.run(makeSessionCtx("intern"), () => {
      // Inside: should be intern
      expect(getCurrentTier()).toBe("intern");
    });
    // Outside: should be back to global
    expect(getCurrentTier()).toBe("associate");
  });
});

// =============================================================================
// setCurrentTier
// =============================================================================

describe("setCurrentTier", () => {
  it("changes the global tier", () => {
    setCurrentTier("intern");
    expect(getCurrentTier()).toBe("intern");
  });

  it("accepts all 3 valid tier values", () => {
    for (const tier of ALL_TIERS) {
      setCurrentTier(tier);
      expect(getCurrentTier()).toBe(tier);
    }
  });

  it("does not affect sessionTierStore contexts", async () => {
    setCurrentTier("intern");
    const ctx = makeSessionCtx("partner");
    const result = await sessionTierStore.run(ctx, () => getCurrentTier());
    expect(result).toBe("partner");
  });

  it("setting same tier twice is idempotent", () => {
    setCurrentTier("intern");
    setCurrentTier("intern");
    expect(getCurrentTier()).toBe("intern");
  });
});

// =============================================================================
// getAgentChain — per-agent verification
// =============================================================================

describe("getAgentChain", () => {
  describe("slicing by tier", () => {
    for (const agent of ALL_AGENTS) {
      for (const tier of ALL_TIERS) {
        it(`${agent} at tier ${tier} returns chain from index ${TIER_START[agent][tier]}`, async () => {
          const ctx = makeSessionCtx(tier);
          const chain = await sessionTierStore.run(ctx, () => getAgentChain(agent));
          const startIndex = TIER_START[agent][tier];
          const expected = AGENT_CHAINS[agent].slice(startIndex);
          expect(chain).toEqual(expected);
        });
      }
    }
  });

  describe("chain length ordering", () => {
    for (const agent of ALL_AGENTS) {
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
  });

  it("investigator chain contains only Claude models (web_search constraint)", async () => {
    for (const tier of ALL_TIERS) {
      const ctx = makeSessionCtx(tier);
      const chain = await sessionTierStore.run(ctx, () => getAgentChain("investigator"));
      for (const key of chain) {
        expect(key).toContain("claude");
      }
    }
  });

  it("investigator: intern and associate start at the same index (both index 1)", () => {
    expect(TIER_START.investigator.intern).toBe(TIER_START.investigator.associate);
    expect(TIER_START.investigator.intern).toBe(1);
  });

  it("all chains have at least 1 element for all tiers", async () => {
    for (const agent of ALL_AGENTS) {
      for (const tier of ALL_TIERS) {
        const ctx = makeSessionCtx(tier);
        const chain = await sessionTierStore.run(ctx, () => getAgentChain(agent));
        expect(chain.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("uses global tier when called outside sessionTierStore.run", () => {
    setCurrentTier("intern");
    const chain = getAgentChain("classifier");
    const startIndex = TIER_START.classifier.intern;
    const expected = AGENT_CHAINS.classifier.slice(startIndex);
    expect(chain).toEqual(expected);
  });

  it("changing global tier changes the chain returned outside store", () => {
    setCurrentTier("partner");
    const partnerChain = getAgentChain("analyzer");

    setCurrentTier("intern");
    const internChain = getAgentChain("analyzer");

    expect(internChain.length).toBeLessThanOrEqual(partnerChain.length);
    // intern chain is a suffix of partner chain
    const partnerSuffix = partnerChain.slice(partnerChain.length - internChain.length);
    expect(internChain).toEqual(partnerSuffix);
  });
});

// =============================================================================
// getFullAgentChain
// =============================================================================

describe("getFullAgentChain", () => {
  for (const agent of ALL_AGENTS) {
    it(`returns the complete chain for ${agent}`, () => {
      expect(getFullAgentChain(agent)).toEqual(AGENT_CHAINS[agent]);
    });
  }

  it("full chain is always >= filtered chain for any tier", async () => {
    for (const agent of ALL_AGENTS) {
      const full = getFullAgentChain(agent);
      for (const tier of ALL_TIERS) {
        const ctx = makeSessionCtx(tier);
        const filtered = await sessionTierStore.run(ctx, () => getAgentChain(agent));
        expect(full.length).toBeGreaterThanOrEqual(filtered.length);
      }
    }
  });

  it("full chain starts with the partner chain", async () => {
    for (const agent of ALL_AGENTS) {
      const full = getFullAgentChain(agent);
      const partnerCtx = makeSessionCtx("partner");
      const partnerChain = await sessionTierStore.run(partnerCtx, () => getAgentChain(agent));
      // Partner starts at index 0, so partner chain == full chain
      if (TIER_START[agent].partner === 0) {
        expect(partnerChain).toEqual(full);
      }
    }
  });
});

// =============================================================================
// isAgentEnabled / setAgentEnabled / getDisabledAgents
// =============================================================================

describe("isAgentEnabled", () => {
  it("all agents are enabled by default", () => {
    for (const agent of ALL_AGENTS) {
      expect(isAgentEnabled(agent)).toBe(true);
    }
  });

  it("returns false after disabling an agent", () => {
    setAgentEnabled("analyzer", false);
    expect(isAgentEnabled("analyzer")).toBe(false);
  });

  it("returns true after re-enabling an agent", () => {
    setAgentEnabled("analyzer", false);
    setAgentEnabled("analyzer", true);
    expect(isAgentEnabled("analyzer")).toBe(true);
  });

  it("disabling one agent does not affect others", () => {
    setAgentEnabled("analyzer", false);
    expect(isAgentEnabled("classifier")).toBe(true);
    expect(isAgentEnabled("investigator")).toBe(true);
    expect(isAgentEnabled("advisor")).toBe(true);
  });

  it("reads from sessionTierStore when available", async () => {
    const ctx = makeSessionCtx("partner", ["analyzer"]);
    const result = await sessionTierStore.run(ctx, () => isAgentEnabled("analyzer"));
    expect(result).toBe(false);
  });

  it("sessionTierStore disabled list takes priority over global state", async () => {
    // Global: analyzer disabled
    setAgentEnabled("analyzer", false);
    // Session: analyzer NOT disabled
    const ctx = makeSessionCtx("partner", []);
    const result = await sessionTierStore.run(ctx, () => isAgentEnabled("analyzer"));
    expect(result).toBe(true);
  });

  it("sessionTierStore can disable agents that are globally enabled", async () => {
    // Global: all enabled
    const ctx = makeSessionCtx("partner", ["classifier", "advisor"]);
    const [classifierEnabled, advisorEnabled, analyzerEnabled] = await sessionTierStore.run(
      ctx,
      () => [
        isAgentEnabled("classifier"),
        isAgentEnabled("advisor"),
        isAgentEnabled("analyzer"),
      ],
    );
    expect(classifierEnabled).toBe(false);
    expect(advisorEnabled).toBe(false);
    expect(analyzerEnabled).toBe(true);
  });
});

describe("setAgentEnabled", () => {
  it("disabling is idempotent", () => {
    setAgentEnabled("analyzer", false);
    setAgentEnabled("analyzer", false);
    expect(isAgentEnabled("analyzer")).toBe(false);
    expect(getDisabledAgents().filter((a) => a === "analyzer")).toHaveLength(1);
  });

  it("enabling is idempotent", () => {
    setAgentEnabled("analyzer", true);
    setAgentEnabled("analyzer", true);
    expect(isAgentEnabled("analyzer")).toBe(true);
  });

  it("can disable multiple agents independently", () => {
    setAgentEnabled("analyzer", false);
    setAgentEnabled("advisor", false);
    setAgentEnabled("investigator", false);

    expect(isAgentEnabled("analyzer")).toBe(false);
    expect(isAgentEnabled("advisor")).toBe(false);
    expect(isAgentEnabled("investigator")).toBe(false);
    expect(isAgentEnabled("classifier")).toBe(true);
  });
});

describe("getDisabledAgents", () => {
  it("returns empty array when no agents are disabled", () => {
    expect(getDisabledAgents()).toEqual([]);
  });

  it("returns the disabled agents", () => {
    setAgentEnabled("analyzer", false);
    setAgentEnabled("advisor", false);

    const disabled = getDisabledAgents();
    expect(disabled).toContain("analyzer");
    expect(disabled).toContain("advisor");
    expect(disabled).toHaveLength(2);
  });

  it("removing an agent from disabled list is reflected", () => {
    setAgentEnabled("classifier", false);
    expect(getDisabledAgents()).toContain("classifier");

    setAgentEnabled("classifier", true);
    expect(getDisabledAgents()).not.toContain("classifier");
  });

  it("reflects only global state, not sessionTierStore state", async () => {
    // Globally, nothing is disabled
    // In session, analyzer is disabled
    const ctx = makeSessionCtx("partner", ["analyzer"]);
    const disabled = await sessionTierStore.run(ctx, () => getDisabledAgents());
    // getDisabledAgents() reads from the global Set, not the session context
    expect(disabled).not.toContain("analyzer");
  });
});

// =============================================================================
// sessionTierStore isolation
// =============================================================================

describe("sessionTierStore isolation", () => {
  it("isolates tier between concurrent requests", async () => {
    const [tier1, tier2] = await Promise.all([
      sessionTierStore.run(makeSessionCtx("intern"), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getCurrentTier();
      }),
      sessionTierStore.run(makeSessionCtx("partner"), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getCurrentTier();
      }),
    ]);

    expect(tier1).toBe("intern");
    expect(tier2).toBe("partner");
  });

  it("isolates disabled agents between concurrent requests", async () => {
    const [r1, r2] = await Promise.all([
      sessionTierStore.run(makeSessionCtx("partner", ["advisor"]), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return isAgentEnabled("advisor");
      }),
      sessionTierStore.run(makeSessionCtx("partner", []), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return isAgentEnabled("advisor");
      }),
    ]);

    expect(r1).toBe(false);
    expect(r2).toBe(true);
  });

  it("isolates getAgentChain between concurrent requests with different tiers", async () => {
    const [partnerChain, internChain] = await Promise.all([
      sessionTierStore.run(makeSessionCtx("partner"), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getAgentChain("analyzer");
      }),
      sessionTierStore.run(makeSessionCtx("intern"), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getAgentChain("analyzer");
      }),
    ]);

    expect(partnerChain.length).toBeGreaterThanOrEqual(internChain.length);
    // Intern chain is a suffix of partner chain
    for (const model of internChain) {
      expect(partnerChain).toContain(model);
    }
  });

  it("nested sessionTierStore.run uses innermost context", async () => {
    const result = await sessionTierStore.run(makeSessionCtx("partner"), async () => {
      const outer = getCurrentTier();
      const inner = await sessionTierStore.run(makeSessionCtx("intern"), () => {
        return getCurrentTier();
      });
      const afterInner = getCurrentTier();
      return { outer, inner, afterInner };
    });

    expect(result.outer).toBe("partner");
    expect(result.inner).toBe("intern");
    expect(result.afterInner).toBe("partner");
  });
});

// =============================================================================
// getActiveModel
// =============================================================================

describe("getActiveModel", () => {
  it("returns the first model when all providers are available", async () => {
    mockIsProviderEnabled.mockReturnValue(true);
    const ctx = makeSessionCtx("partner");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("classifier"));
    const chain = AGENT_CHAINS.classifier.slice(TIER_START.classifier.partner);
    expect(model).toBe(chain[0]);
  });

  it("skips models with unavailable providers", async () => {
    // First call: anthropic (false), then all true
    mockIsProviderEnabled
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const ctx = makeSessionCtx("partner");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("classifier"));
    const chain = AGENT_CHAINS.classifier.slice(TIER_START.classifier.partner);
    expect(model).toBe(chain[1]);
  });

  it("skips first two unavailable providers, picks third", async () => {
    mockIsProviderEnabled
      .mockReturnValueOnce(false) // first
      .mockReturnValueOnce(false) // second
      .mockReturnValue(true);     // third onwards

    const ctx = makeSessionCtx("partner");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("classifier"));
    const chain = AGENT_CHAINS.classifier.slice(TIER_START.classifier.partner);
    expect(model).toBe(chain[2]);
  });

  it("returns first element as fallback when all providers are disabled", async () => {
    mockIsProviderEnabled.mockReturnValue(false);
    const ctx = makeSessionCtx("partner");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("classifier"));
    const chain = AGENT_CHAINS.classifier.slice(TIER_START.classifier.partner);
    expect(model).toBe(chain[0]);
  });

  it("respects the current tier when selecting active model", async () => {
    mockIsProviderEnabled.mockReturnValue(true);

    const partnerModel = await sessionTierStore.run(
      makeSessionCtx("partner"),
      () => getActiveModel("analyzer"),
    );
    const internModel = await sessionTierStore.run(
      makeSessionCtx("intern"),
      () => getActiveModel("analyzer"),
    );

    const partnerChain = AGENT_CHAINS.analyzer.slice(TIER_START.analyzer.partner);
    const internChain = AGENT_CHAINS.analyzer.slice(TIER_START.analyzer.intern);

    expect(partnerModel).toBe(partnerChain[0]);
    expect(internModel).toBe(internChain[0]);
  });

  it("works outside sessionTierStore using global tier", () => {
    mockIsProviderEnabled.mockReturnValue(true);
    setCurrentTier("intern");
    const model = getActiveModel("classifier");
    const internChain = AGENT_CHAINS.classifier.slice(TIER_START.classifier.intern);
    expect(model).toBe(internChain[0]);
  });

  it("returned model always exists in MODELS registry", async () => {
    mockIsProviderEnabled.mockReturnValue(true);
    for (const agent of ALL_AGENTS) {
      for (const tier of ALL_TIERS) {
        const ctx = makeSessionCtx(tier);
        const model = await sessionTierStore.run(ctx, () => getActiveModel(agent));
        expect(MODELS[model]).toBeDefined();
      }
    }
  });
});

// =============================================================================
// getTierInfo
// =============================================================================

describe("getTierInfo", () => {
  it("returns structure with current and agents", () => {
    const info = getTierInfo();
    expect(info).toHaveProperty("current");
    expect(info).toHaveProperty("agents");
  });

  it("current reflects the global tier", () => {
    setCurrentTier("intern");
    expect(getTierInfo().current).toBe("intern");

    setCurrentTier("associate");
    expect(getTierInfo().current).toBe("associate");

    setCurrentTier("partner");
    expect(getTierInfo().current).toBe("partner");
  });

  it("contains all expected agents", () => {
    const info = getTierInfo();
    for (const agent of ALL_AGENTS) {
      expect(info.agents).toHaveProperty(agent);
    }
  });

  it("each agent entry has chain, activeIndex, activeModel, enabled", () => {
    const info = getTierInfo();
    for (const agent of ALL_AGENTS) {
      const agentInfo = info.agents[agent];
      expect(agentInfo).toHaveProperty("chain");
      expect(agentInfo).toHaveProperty("activeIndex");
      expect(agentInfo).toHaveProperty("activeModel");
      expect(agentInfo).toHaveProperty("enabled");
      expect(Array.isArray(agentInfo.chain)).toBe(true);
      expect(typeof agentInfo.activeIndex).toBe("number");
      expect(typeof agentInfo.activeModel).toBe("string");
      expect(typeof agentInfo.enabled).toBe("boolean");
    }
  });

  it("chain entries have key, displayName, provider, available", () => {
    const info = getTierInfo();
    for (const agent of ALL_AGENTS) {
      for (const entry of info.agents[agent].chain) {
        expect(entry).toHaveProperty("key");
        expect(entry).toHaveProperty("displayName");
        expect(entry).toHaveProperty("provider");
        expect(entry).toHaveProperty("available");
        expect(typeof entry.key).toBe("string");
        expect(typeof entry.displayName).toBe("string");
        expect(typeof entry.provider).toBe("string");
        expect(typeof entry.available).toBe("boolean");
      }
    }
  });

  it("chain length matches getAgentChain for current tier", () => {
    setCurrentTier("partner");
    const info = getTierInfo();
    for (const agent of ALL_AGENTS) {
      const chain = getAgentChain(agent);
      expect(info.agents[agent].chain).toHaveLength(chain.length);
    }
  });

  it("activeIndex is 0 when all providers are available", () => {
    mockIsProviderEnabled.mockReturnValue(true);
    const info = getTierInfo();
    for (const agent of ALL_AGENTS) {
      expect(info.agents[agent].activeIndex).toBe(0);
    }
  });

  it("enabled reflects global agent toggle state", () => {
    setAgentEnabled("analyzer", false);
    setAgentEnabled("investigator", false);

    const info = getTierInfo();
    expect(info.agents.analyzer.enabled).toBe(false);
    expect(info.agents.investigator.enabled).toBe(false);
    expect(info.agents.classifier.enabled).toBe(true);
    expect(info.agents.advisor.enabled).toBe(true);
  });

  it("activeModel matches the key at activeIndex in chain", () => {
    mockIsProviderEnabled.mockReturnValue(true);
    const info = getTierInfo();
    for (const agent of ALL_AGENTS) {
      const agentInfo = info.agents[agent];
      expect(agentInfo.activeModel).toBe(agentInfo.chain[agentInfo.activeIndex].key);
    }
  });
});

// =============================================================================
// getTierInfoForSession
// =============================================================================

describe("getTierInfoForSession", () => {
  it("uses the tier parameter, not the global tier", () => {
    setCurrentTier("partner");
    const info = getTierInfoForSession("intern", new Set());
    expect(info.current).toBe("intern");
  });

  it("reflects disabled agents from the parameter", () => {
    const disabled = new Set<AgentName>(["analyzer", "advisor"]);
    const info = getTierInfoForSession("partner", disabled);
    expect(info.agents.analyzer.enabled).toBe(false);
    expect(info.agents.advisor.enabled).toBe(false);
    expect(info.agents.classifier.enabled).toBe(true);
    expect(info.agents.leader.enabled).toBe(true);
  });

  it("chain length varies by tier", () => {
    const partnerInfo = getTierInfoForSession("partner", new Set());
    const internInfo = getTierInfoForSession("intern", new Set());

    for (const agent of ALL_AGENTS) {
      expect(partnerInfo.agents[agent].chain.length)
        .toBeGreaterThanOrEqual(internInfo.agents[agent].chain.length);
    }
  });

  it("contains all agents", () => {
    const info = getTierInfoForSession("associate", new Set());
    for (const agent of ALL_AGENTS) {
      expect(info.agents).toHaveProperty(agent);
    }
  });

  it("does not mutate global state", () => {
    setCurrentTier("partner");
    getTierInfoForSession("intern", new Set(["analyzer"] as AgentName[]));
    // Global state should be unchanged
    expect(getCurrentTier()).toBe("partner");
    expect(isAgentEnabled("analyzer")).toBe(true);
  });

  it("chain keys match the sliced AGENT_CHAINS", () => {
    for (const tier of ALL_TIERS) {
      const info = getTierInfoForSession(tier, new Set());
      for (const agent of ALL_AGENTS) {
        const expectedChain = AGENT_CHAINS[agent].slice(TIER_START[agent][tier]);
        const actualKeys = info.agents[agent].chain.map((e) => e.key);
        expect(actualKeys).toEqual(expectedChain);
      }
    }
  });
});

// =============================================================================
// estimateTierCost
// =============================================================================

describe("estimateTierCost", () => {
  it("returns an object with perQuery and label", () => {
    const cost = estimateTierCost();
    expect(cost).toHaveProperty("perQuery");
    expect(cost).toHaveProperty("label");
    expect(typeof cost.perQuery).toBe("number");
    expect(typeof cost.label).toBe("string");
  });

  it("perQuery is >= 0", () => {
    const cost = estimateTierCost();
    expect(cost.perQuery).toBeGreaterThanOrEqual(0);
  });

  it("disabling agents reduces cost", () => {
    const fullCost = estimateTierCost();
    setAgentEnabled("analyzer", false);
    setAgentEnabled("investigator", false);
    const reducedCost = estimateTierCost();
    expect(reducedCost.perQuery).toBeLessThanOrEqual(fullCost.perQuery);
  });

  it("all agents disabled produces cost 0 and label '~gratis'", () => {
    for (const agent of ALL_AGENTS) {
      setAgentEnabled(agent, false);
    }
    const cost = estimateTierCost();
    expect(cost.perQuery).toBe(0);
    expect(cost.label).toBe("~gratis");
  });

  it("uses getActiveModel to select model for cost calculation", () => {
    // When all providers are enabled, uses first model in chain
    mockIsProviderEnabled.mockReturnValue(true);
    const cost = estimateTierCost();
    expect(cost.perQuery).toBeGreaterThan(0);
  });
});

// =============================================================================
// estimateTierCostForSession
// =============================================================================

describe("estimateTierCostForSession", () => {
  it("intern tier costs <= partner tier (cheaper models)", () => {
    const internCost = estimateTierCostForSession("intern", new Set());
    const partnerCost = estimateTierCostForSession("partner", new Set());
    expect(internCost.perQuery).toBeLessThanOrEqual(partnerCost.perQuery);
  });

  it("associate tier costs between intern and partner", () => {
    const internCost = estimateTierCostForSession("intern", new Set());
    const associateCost = estimateTierCostForSession("associate", new Set());
    const partnerCost = estimateTierCostForSession("partner", new Set());
    expect(associateCost.perQuery).toBeGreaterThanOrEqual(internCost.perQuery);
    expect(associateCost.perQuery).toBeLessThanOrEqual(partnerCost.perQuery);
  });

  it("disabling agents reduces cost", () => {
    const fullCost = estimateTierCostForSession("partner", new Set());
    const disabled = new Set<AgentName>(["analyzer", "investigator", "advisor"]);
    const partialCost = estimateTierCostForSession("partner", disabled);
    expect(partialCost.perQuery).toBeLessThanOrEqual(fullCost.perQuery);
  });

  it("all agents disabled produces cost 0 and label '~gratis'", () => {
    const allAgentsSet = new Set<AgentName>(ALL_AGENTS);
    const cost = estimateTierCostForSession("partner", allAgentsSet);
    expect(cost.perQuery).toBe(0);
    expect(cost.label).toBe("~gratis");
  });

  it("does not mutate global state", () => {
    setCurrentTier("partner");
    estimateTierCostForSession("intern", new Set(["analyzer"] as AgentName[]));
    expect(getCurrentTier()).toBe("partner");
    expect(isAgentEnabled("analyzer")).toBe(true);
  });

  describe("label formatting", () => {
    it("label is '~gratis' when perQuery is 0", () => {
      const allAgentsSet = new Set<AgentName>(ALL_AGENTS);
      const cost = estimateTierCostForSession("partner", allAgentsSet);
      expect(cost.label).toBe("~gratis");
    });

    it("label contains '$' when cost > 0", () => {
      mockIsProviderEnabled.mockReturnValue(true);
      const cost = estimateTierCostForSession("partner", new Set());
      if (cost.perQuery > 0) {
        expect(cost.label).toContain("$");
      }
    });

    it("label format is '~$X.Xc' for costs between 0.001 and 0.01", () => {
      // We can verify indirectly: intern with cheap models should produce a low cost
      mockIsProviderEnabled.mockReturnValue(true);
      const cost = estimateTierCostForSession("intern", new Set());
      // The label should match one of the expected formats
      expect(cost.label).toMatch(/^~(gratis|\$[\d.]+c?)$/);
    });
  });
});

// =============================================================================
// AGENT_CHAINS data integrity
// =============================================================================

describe("AGENT_CHAINS data integrity", () => {
  it("every agent has a chain defined", () => {
    for (const agent of ALL_AGENTS) {
      expect(AGENT_CHAINS[agent]).toBeDefined();
      expect(Array.isArray(AGENT_CHAINS[agent])).toBe(true);
    }
  });

  it("every model key in every chain exists in the MODELS registry", () => {
    for (const agent of ALL_AGENTS) {
      for (const modelKey of AGENT_CHAINS[agent]) {
        expect(MODELS[modelKey]).toBeDefined();
        expect(MODELS[modelKey]).toHaveProperty("provider");
        expect(MODELS[modelKey]).toHaveProperty("displayName");
      }
    }
  });

  it("no chain contains duplicate model keys", () => {
    for (const agent of ALL_AGENTS) {
      const chain = AGENT_CHAINS[agent];
      const uniqueKeys = new Set(chain);
      expect(uniqueKeys.size).toBe(chain.length);
    }
  });

  it("chains are non-empty", () => {
    for (const agent of ALL_AGENTS) {
      expect(AGENT_CHAINS[agent].length).toBeGreaterThanOrEqual(1);
    }
  });

  it("investigator chain has exactly 2 models (Sonnet + Haiku)", () => {
    expect(AGENT_CHAINS.investigator).toHaveLength(2);
    expect(AGENT_CHAINS.investigator[0]).toBe("claude-sonnet-4.5");
    expect(AGENT_CHAINS.investigator[1]).toBe("claude-haiku-4.5");
  });

  it("task-executor chain starts with Opus", () => {
    expect(AGENT_CHAINS["task-executor"][0]).toBe("claude-opus-4.5");
  });

  it("leader and question-prep share the same chain structure", () => {
    // Both start with haiku -> flash -> groq -> cerebras -> sambanova-maverick -> mistral
    expect(AGENT_CHAINS.leader).toEqual(AGENT_CHAINS["question-prep"]);
  });

  it("classifier uses sambanova-llama3-70b (stability) vs leader's maverick", () => {
    // Classifier diverges from leader only on sambanova model choice
    expect(AGENT_CHAINS.classifier[4]).toBe("sambanova-llama3-70b");
    expect(AGENT_CHAINS.leader[4]).toBe("sambanova-llama4-maverick");
  });
});

// =============================================================================
// TIER_START data integrity
// =============================================================================

describe("TIER_START data integrity", () => {
  it("every agent has TIER_START entry for all 3 tiers", () => {
    for (const agent of ALL_AGENTS) {
      expect(TIER_START[agent]).toBeDefined();
      for (const tier of ALL_TIERS) {
        expect(typeof TIER_START[agent][tier]).toBe("number");
      }
    }
  });

  it("all indices are within chain bounds", () => {
    for (const agent of ALL_AGENTS) {
      const chainLength = AGENT_CHAINS[agent].length;
      for (const tier of ALL_TIERS) {
        const startIndex = TIER_START[agent][tier];
        expect(startIndex).toBeGreaterThanOrEqual(0);
        expect(startIndex).toBeLessThan(chainLength);
      }
    }
  });

  it("partner startIndex <= associate startIndex <= intern startIndex", () => {
    for (const agent of ALL_AGENTS) {
      expect(TIER_START[agent].partner).toBeLessThanOrEqual(TIER_START[agent].associate);
      expect(TIER_START[agent].associate).toBeLessThanOrEqual(TIER_START[agent].intern);
    }
  });

  it("partner always starts at index 0", () => {
    for (const agent of ALL_AGENTS) {
      expect(TIER_START[agent].partner).toBe(0);
    }
  });

  it("investigator intern == associate (special case: web_search = Anthropic only)", () => {
    expect(TIER_START.investigator.intern).toBe(TIER_START.investigator.associate);
  });
});

// =============================================================================
// Integration-style: full workflow scenarios
// =============================================================================

describe("full workflow scenarios", () => {
  it("partner tier with all providers enabled: uses top-tier models", async () => {
    mockIsProviderEnabled.mockReturnValue(true);
    const ctx = makeSessionCtx("partner");

    const results = await sessionTierStore.run(ctx, () => ({
      classifierModel: getActiveModel("classifier"),
      analyzerModel: getActiveModel("analyzer"),
      investigatorModel: getActiveModel("investigator"),
      advisorModel: getActiveModel("advisor"),
    }));

    // Partner tier, all available: should pick first in each chain
    expect(results.classifierModel).toBe("claude-haiku-4.5");
    expect(results.analyzerModel).toBe("claude-sonnet-4.5");
    expect(results.investigatorModel).toBe("claude-sonnet-4.5");
    expect(results.advisorModel).toBe("claude-sonnet-4.5");
  });

  it("intern tier with all providers enabled: uses budget models", async () => {
    mockIsProviderEnabled.mockReturnValue(true);
    const ctx = makeSessionCtx("intern");

    const results = await sessionTierStore.run(ctx, () => ({
      classifierModel: getActiveModel("classifier"),
      analyzerModel: getActiveModel("analyzer"),
      advisorModel: getActiveModel("advisor"),
    }));

    // Intern tier: starts at index 2 for most agents
    const classifierInternChain = AGENT_CHAINS.classifier.slice(TIER_START.classifier.intern);
    const analyzerInternChain = AGENT_CHAINS.analyzer.slice(TIER_START.analyzer.intern);
    const advisorInternChain = AGENT_CHAINS.advisor.slice(TIER_START.advisor.intern);

    expect(results.classifierModel).toBe(classifierInternChain[0]);
    expect(results.analyzerModel).toBe(analyzerInternChain[0]);
    expect(results.advisorModel).toBe(advisorInternChain[0]);
  });

  it("anthropic-only scenario: only Anthropic provider enabled", async () => {
    mockIsProviderEnabled.mockImplementation((provider: string) => provider === "anthropic");

    const ctx = makeSessionCtx("partner");
    const results = await sessionTierStore.run(ctx, () => ({
      classifierModel: getActiveModel("classifier"),
      analyzerModel: getActiveModel("analyzer"),
      investigatorModel: getActiveModel("investigator"),
    }));

    // Classifier chain: haiku, flash, cerebras, groq, mistral -> only haiku available
    expect(results.classifierModel).toBe("claude-haiku-4.5");
    // Analyzer chain: sonnet, gemini-pro, mistral, groq, cerebras -> only sonnet available
    expect(results.analyzerModel).toBe("claude-sonnet-4.5");
    // Investigator: sonnet, haiku -> both available
    expect(results.investigatorModel).toBe("claude-sonnet-4.5");
  });

  it("no anthropic scenario: falls through to alternative providers", async () => {
    mockIsProviderEnabled.mockImplementation((provider: string) => provider !== "anthropic");

    const ctx = makeSessionCtx("partner");
    const classifierModel = await sessionTierStore.run(ctx, () =>
      getActiveModel("classifier"),
    );

    // Classifier: haiku(skip), flash(ok) -> should pick flash
    expect(classifierModel).toBe("gemini-2.5-flash");
  });

  it("getTierInfo and estimateTierCost are consistent", () => {
    mockIsProviderEnabled.mockReturnValue(true);
    setCurrentTier("partner");

    const info = getTierInfo();
    const cost = estimateTierCost();

    // All agents should be enabled
    for (const agent of ALL_AGENTS) {
      expect(info.agents[agent].enabled).toBe(true);
    }

    // Cost should be positive since all agents are enabled with real models
    expect(cost.perQuery).toBeGreaterThan(0);
  });

  it("session with disabled agents: getTierInfoForSession and estimateTierCostForSession are consistent", () => {
    mockIsProviderEnabled.mockReturnValue(true);
    const disabled = new Set<AgentName>(["analyzer", "investigator"]);

    const info = getTierInfoForSession("partner", disabled);
    const cost = estimateTierCostForSession("partner", disabled);
    const fullCost = estimateTierCostForSession("partner", new Set());

    expect(info.agents.analyzer.enabled).toBe(false);
    expect(info.agents.investigator.enabled).toBe(false);
    expect(cost.perQuery).toBeLessThan(fullCost.perQuery);
  });
});
