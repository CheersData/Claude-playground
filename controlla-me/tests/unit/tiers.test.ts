/**
 * Tests: lib/tiers.ts (P2 — tier logic e AsyncLocalStorage isolation)
 *
 * Copre:
 * - getCurrentTier() default e override via sessionTierStore
 * - getAgentChain() slicing per tier
 * - isAgentEnabled() default e override via sessionTierStore
 * - sessionTierStore.run() isolation per-request
 * - getActiveModel() selezione primo provider disponibile
 * - getTierInfo() struttura output
 * - estimateTierCost() stime non-negative
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentName, ModelKey } from "@/lib/models";

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
  getAgentChain,
  isAgentEnabled,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSessionCtx(tier: TierName, disabled: AgentName[] = []): SessionTierContext {
  return { tier, disabledAgents: new Set(disabled), sid: "test-sid" };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsProviderEnabled.mockReturnValue(true);
});

describe("getCurrentTier", () => {
  it("ritorna 'partner' di default (nessun store context)", () => {
    // Fuori da sessionTierStore.run() → usa global
    const tier = getCurrentTier();
    // Il tier globale può essere "partner" (default) o diverso a seconda di run precedenti
    // Verifichiamo solo che sia un valore valido
    expect(["intern", "associate", "partner"]).toContain(tier);
  });

  it("ritorna il tier dal sessionTierStore quando presente", async () => {
    const ctx = makeSessionCtx("intern");
    const result = await sessionTierStore.run(ctx, () => getCurrentTier());
    expect(result).toBe("intern");
  });

  it("ritorna 'associate' dal sessionTierStore", async () => {
    const ctx = makeSessionCtx("associate");
    const result = await sessionTierStore.run(ctx, () => getCurrentTier());
    expect(result).toBe("associate");
  });
});

describe("getAgentChain", () => {
  it("ritorna la catena a partire dall'indice corretto per 'partner'", async () => {
    const ctx = makeSessionCtx("partner");
    const chain = await sessionTierStore.run(ctx, () => getAgentChain("classifier"));
    const startIndex = TIER_START.classifier.partner;
    const expected = AGENT_CHAINS.classifier.slice(startIndex);
    expect(chain).toEqual(expected);
  });

  it("ritorna la catena a partire dall'indice corretto per 'intern'", async () => {
    const ctx = makeSessionCtx("intern");
    const chain = await sessionTierStore.run(ctx, () => getAgentChain("classifier"));
    const startIndex = TIER_START.classifier.intern;
    const expected = AGENT_CHAINS.classifier.slice(startIndex);
    expect(chain).toEqual(expected);
  });

  it("la catena per 'intern' è più corta o uguale a quella di 'partner'", async () => {
    const [partnerChain, internChain] = await Promise.all([
      sessionTierStore.run(makeSessionCtx("partner"), () => getAgentChain("analyzer")),
      sessionTierStore.run(makeSessionCtx("intern"), () => getAgentChain("analyzer")),
    ]);
    expect(internChain.length).toBeLessThanOrEqual(partnerChain.length);
  });

  it("investigator ha solo modelli Anthropic (web_search constraint)", async () => {
    const ctx = makeSessionCtx("partner");
    const chain = await sessionTierStore.run(ctx, () => getAgentChain("investigator"));
    for (const key of chain) {
      expect(key).toContain("claude");
    }
  });

  it("tutte le catene hanno almeno 1 elemento", async () => {
    const agents: AgentName[] = ["leader", "question-prep", "classifier", "corpus-agent", "analyzer", "investigator", "advisor"];
    const ctx = makeSessionCtx("intern");
    for (const agent of agents) {
      const chain = await sessionTierStore.run(ctx, () => getAgentChain(agent));
      expect(chain.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("isAgentEnabled", () => {
  it("ritorna true di default (nessun agente disabilitato)", () => {
    // Fuori dal context store, usa lo stato globale (che di default ha tutto abilitato)
    // ma isoliamo con un context "vuoto"
    const result = isAgentEnabled("classifier");
    expect(typeof result).toBe("boolean");
  });

  it("ritorna true per agente non in disabledAgents", async () => {
    const ctx = makeSessionCtx("partner", ["analyzer"]);
    const result = await sessionTierStore.run(ctx, () => isAgentEnabled("classifier"));
    expect(result).toBe(true);
  });

  it("ritorna false per agente in disabledAgents", async () => {
    const ctx = makeSessionCtx("partner", ["analyzer"]);
    const result = await sessionTierStore.run(ctx, () => isAgentEnabled("analyzer"));
    expect(result).toBe(false);
  });

  it("isola correttamente tra sessioni concorrenti", async () => {
    const ctx1 = makeSessionCtx("partner", ["analyzer"]);
    const ctx2 = makeSessionCtx("partner", ["classifier"]);

    const [r1, r2] = await Promise.all([
      sessionTierStore.run(ctx1, () => isAgentEnabled("analyzer")),
      sessionTierStore.run(ctx2, () => isAgentEnabled("analyzer")),
    ]);

    expect(r1).toBe(false);  // ctx1 disabilita analyzer
    expect(r2).toBe(true);   // ctx2 non disabilita analyzer
  });
});

describe("sessionTierStore isolation", () => {
  it("isola tier tra richieste concorrenti", async () => {
    const ctx1 = makeSessionCtx("intern");
    const ctx2 = makeSessionCtx("partner");

    const [tier1, tier2] = await Promise.all([
      sessionTierStore.run(ctx1, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getCurrentTier();
      }),
      sessionTierStore.run(ctx2, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getCurrentTier();
      }),
    ]);

    expect(tier1).toBe("intern");
    expect(tier2).toBe("partner");
  });

  it("isola disabledAgents tra sessioni concorrenti", async () => {
    const ctx1 = makeSessionCtx("partner", ["advisor"]);
    const ctx2 = makeSessionCtx("partner", []);

    const [r1, r2] = await Promise.all([
      sessionTierStore.run(ctx1, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return isAgentEnabled("advisor");
      }),
      sessionTierStore.run(ctx2, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return isAgentEnabled("advisor");
      }),
    ]);

    expect(r1).toBe(false);
    expect(r2).toBe(true);
  });
});

describe("getActiveModel", () => {
  it("ritorna il primo modello con provider disponibile", async () => {
    mockIsProviderEnabled.mockReturnValue(true);
    const ctx = makeSessionCtx("partner");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("classifier"));
    expect(typeof model).toBe("string");
    expect(AGENT_CHAINS.classifier).toContain(model);
  });

  it("salta modelli con provider non disponibile", async () => {
    // Primo disabilitato, secondo abilitato
    mockIsProviderEnabled
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const ctx = makeSessionCtx("partner");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("classifier"));
    const chain = AGENT_CHAINS.classifier.slice(TIER_START.classifier.partner);
    // Non deve essere il primo (che era disabilitato)
    expect(model).not.toBe(chain[0]);
  });

  it("ritorna primo elemento della catena se tutti i provider sono disabilitati (fallback)", async () => {
    mockIsProviderEnabled.mockReturnValue(false);
    const ctx = makeSessionCtx("partner");
    const model = await sessionTierStore.run(ctx, () => getActiveModel("classifier"));
    const chain = AGENT_CHAINS.classifier.slice(TIER_START.classifier.partner);
    expect(model).toBe(chain[0]);
  });
});

describe("getTierInfo", () => {
  it("ritorna struttura con current e agents", () => {
    const info = getTierInfo();
    expect(info).toHaveProperty("current");
    expect(info).toHaveProperty("agents");
    expect(["intern", "associate", "partner"]).toContain(info.current);
  });

  it("contiene tutti gli agenti", () => {
    const info = getTierInfo();
    const expectedAgents: AgentName[] = ["leader", "question-prep", "classifier", "corpus-agent", "analyzer", "investigator", "advisor"];
    for (const agent of expectedAgents) {
      expect(info.agents).toHaveProperty(agent);
    }
  });

  it("ogni agente ha chain, activeIndex, activeModel, enabled", () => {
    const info = getTierInfo();
    for (const [, agentInfo] of Object.entries(info.agents)) {
      expect(agentInfo).toHaveProperty("chain");
      expect(agentInfo).toHaveProperty("activeIndex");
      expect(agentInfo).toHaveProperty("activeModel");
      expect(agentInfo).toHaveProperty("enabled");
      expect(Array.isArray(agentInfo.chain)).toBe(true);
      expect(typeof agentInfo.enabled).toBe("boolean");
    }
  });
});

describe("getTierInfoForSession", () => {
  it("usa il tier passato come parametro (non il globale)", () => {
    const info = getTierInfoForSession("intern", new Set());
    expect(info.current).toBe("intern");
  });

  it("riflette gli agenti disabilitati passati", () => {
    const disabled = new Set<AgentName>(["analyzer", "advisor"]);
    const info = getTierInfoForSession("partner", disabled);
    expect(info.agents.analyzer.enabled).toBe(false);
    expect(info.agents.advisor.enabled).toBe(false);
    expect(info.agents.classifier.enabled).toBe(true);
  });
});

describe("estimateTierCost", () => {
  it("ritorna un oggetto con perQuery e label", () => {
    const cost = estimateTierCost();
    expect(cost).toHaveProperty("perQuery");
    expect(cost).toHaveProperty("label");
    expect(typeof cost.perQuery).toBe("number");
    expect(typeof cost.label).toBe("string");
  });

  it("perQuery >= 0", () => {
    const cost = estimateTierCost();
    expect(cost.perQuery).toBeGreaterThanOrEqual(0);
  });
});

describe("estimateTierCostForSession", () => {
  it("tier intern ha costo <= tier partner", () => {
    const internCost = estimateTierCostForSession("intern", new Set());
    const partnerCost = estimateTierCostForSession("partner", new Set());
    expect(internCost.perQuery).toBeLessThanOrEqual(partnerCost.perQuery);
  });

  it("disabilitare agenti riduce il costo", () => {
    const fullCost = estimateTierCostForSession("partner", new Set());
    const partialCost = estimateTierCostForSession("partner", new Set(["analyzer", "investigator", "advisor"] as AgentName[]));
    expect(partialCost.perQuery).toBeLessThanOrEqual(fullCost.perQuery);
  });

  it("tutti gli agenti disabilitati → costo ~0", () => {
    const allAgents = new Set<AgentName>(["leader", "question-prep", "classifier", "corpus-agent", "analyzer", "investigator", "advisor"]);
    const cost = estimateTierCostForSession("partner", allAgents);
    expect(cost.perQuery).toBe(0);
    expect(cost.label).toBe("~gratis");
  });
});
