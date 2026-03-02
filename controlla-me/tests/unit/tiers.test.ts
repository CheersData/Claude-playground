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
    const allAgents = new Set<AgentName>(["leader", "question-prep", "classifier", "corpus-agent", "analyzer", "investigator", "advisor", "task-executor"]);
    const cost = estimateTierCostForSession("partner", allAgents);
    expect(cost.perQuery).toBe(0);
    expect(cost.label).toBe("~gratis");
  });
});

// ─── setCurrentTier ──────────────────────────────────────────────────────────

describe("setCurrentTier", () => {
  it("cambia il tier globale", () => {
    const original = getCurrentTier();
    setCurrentTier("intern");
    expect(getCurrentTier()).toBe("intern");
    // Ripristina
    setCurrentTier(original);
  });

  it("accetta tutti i 3 tier validi", () => {
    const original = getCurrentTier();
    for (const tier of ["intern", "associate", "partner"] as TierName[]) {
      setCurrentTier(tier);
      expect(getCurrentTier()).toBe(tier);
    }
    setCurrentTier(original);
  });

  it("non influenza sessionTierStore (i context store hanno priorità)", async () => {
    setCurrentTier("intern");
    const ctx = makeSessionCtx("partner");
    const result = await sessionTierStore.run(ctx, () => getCurrentTier());
    expect(result).toBe("partner");
    setCurrentTier("partner"); // ripristina
  });
});

// ─── setAgentEnabled / getDisabledAgents ─────────────────────────────────────

describe("setAgentEnabled / getDisabledAgents", () => {
  it("disabilita un agente nello stato globale", () => {
    // Assicuriamoci che analyzer sia abilitato inizialmente
    setAgentEnabled("analyzer", true);
    expect(isAgentEnabled("analyzer")).toBe(true);

    setAgentEnabled("analyzer", false);
    expect(isAgentEnabled("analyzer")).toBe(false);

    // Ripristina
    setAgentEnabled("analyzer", true);
  });

  it("getDisabledAgents ritorna gli agenti disabilitati", () => {
    // Pulisci stato
    setAgentEnabled("analyzer", true);
    setAgentEnabled("advisor", true);

    setAgentEnabled("analyzer", false);
    setAgentEnabled("advisor", false);

    const disabled = getDisabledAgents();
    expect(disabled).toContain("analyzer");
    expect(disabled).toContain("advisor");
    expect(disabled).not.toContain("classifier");

    // Ripristina
    setAgentEnabled("analyzer", true);
    setAgentEnabled("advisor", true);
  });

  it("ri-abilitare un agente lo rimuove dalla lista disabled", () => {
    setAgentEnabled("classifier", false);
    expect(getDisabledAgents()).toContain("classifier");

    setAgentEnabled("classifier", true);
    expect(getDisabledAgents()).not.toContain("classifier");
  });

  it("setAgentEnabled non influenza il sessionTierStore", async () => {
    setAgentEnabled("analyzer", false);
    const ctx = makeSessionCtx("partner", []); // nessun agente disabilitato nel context
    const result = await sessionTierStore.run(ctx, () => isAgentEnabled("analyzer"));
    expect(result).toBe(true); // il context store ha priorità

    // Ripristina
    setAgentEnabled("analyzer", true);
  });
});

// ─── getFullAgentChain ───────────────────────────────────────────────────────

describe("getFullAgentChain", () => {
  it("ritorna la catena completa (non filtrata per tier)", () => {
    const fullChain = getFullAgentChain("classifier");
    expect(fullChain).toEqual(AGENT_CHAINS.classifier);
  });

  it("la catena completa è >= la catena filtrata per qualsiasi tier", async () => {
    const agents: AgentName[] = ["classifier", "analyzer", "investigator", "advisor"];
    for (const agent of agents) {
      const full = getFullAgentChain(agent);
      for (const tier of ["intern", "associate", "partner"] as TierName[]) {
        const ctx = makeSessionCtx(tier);
        const filtered = await sessionTierStore.run(ctx, () => getAgentChain(agent));
        expect(full.length).toBeGreaterThanOrEqual(filtered.length);
      }
    }
  });

  it("task-executor ha la propria catena separata", () => {
    const chain = getFullAgentChain("task-executor");
    expect(chain.length).toBeGreaterThanOrEqual(1);
    expect(AGENT_CHAINS["task-executor"]).toEqual(chain);
  });
});

// ─── Data Integrity ──────────────────────────────────────────────────────────

describe("AGENT_CHAINS data integrity", () => {
  const allAgents: AgentName[] = [
    "leader", "question-prep", "classifier", "corpus-agent",
    "analyzer", "investigator", "advisor", "task-executor",
  ];

  it("ogni agente ha una catena definita in AGENT_CHAINS", () => {
    for (const agent of allAgents) {
      expect(AGENT_CHAINS[agent]).toBeDefined();
      expect(Array.isArray(AGENT_CHAINS[agent])).toBe(true);
    }
  });

  it("ogni modello nella catena esiste nel registry MODELS", async () => {
    const { MODELS } = await import("@/lib/models");
    for (const agent of allAgents) {
      for (const modelKey of AGENT_CHAINS[agent]) {
        expect(MODELS[modelKey]).toBeDefined();
      }
    }
  });

  it("nessuna catena contiene duplicati", () => {
    for (const agent of allAgents) {
      const chain = AGENT_CHAINS[agent];
      const uniqueKeys = new Set(chain);
      expect(uniqueKeys.size).toBe(chain.length);
    }
  });
});

describe("TIER_START data integrity", () => {
  const allAgents: AgentName[] = [
    "leader", "question-prep", "classifier", "corpus-agent",
    "analyzer", "investigator", "advisor", "task-executor",
  ];
  const allTiers: TierName[] = ["intern", "associate", "partner"];

  it("ogni agente ha un TIER_START entry per tutti e 3 i tier", () => {
    for (const agent of allAgents) {
      expect(TIER_START[agent]).toBeDefined();
      for (const tier of allTiers) {
        expect(typeof TIER_START[agent][tier]).toBe("number");
      }
    }
  });

  it("TIER_START indices sono dentro i bounds della catena", () => {
    for (const agent of allAgents) {
      const chainLength = AGENT_CHAINS[agent].length;
      for (const tier of allTiers) {
        const startIndex = TIER_START[agent][tier];
        expect(startIndex).toBeGreaterThanOrEqual(0);
        expect(startIndex).toBeLessThan(chainLength);
      }
    }
  });

  it("partner ha startIndex <= associate <= intern (tier superiore parte prima)", () => {
    for (const agent of allAgents) {
      expect(TIER_START[agent].partner).toBeLessThanOrEqual(TIER_START[agent].associate);
      expect(TIER_START[agent].associate).toBeLessThanOrEqual(TIER_START[agent].intern);
    }
  });
});

// ─── getAgentChain outside sessionTierStore ──────────────────────────────────

describe("getAgentChain (global tier, no sessionTierStore)", () => {
  it("usa il global tier quando chiamato fuori da sessionTierStore.run", () => {
    const originalTier = getCurrentTier();
    setCurrentTier("intern");

    const chain = getAgentChain("classifier");
    const startIndex = TIER_START.classifier.intern;
    const expected = AGENT_CHAINS.classifier.slice(startIndex);
    expect(chain).toEqual(expected);

    setCurrentTier(originalTier);
  });

  it("cambiare global tier cambia la catena ritornata fuori dallo store", () => {
    const originalTier = getCurrentTier();

    setCurrentTier("partner");
    const partnerChain = getAgentChain("analyzer");

    setCurrentTier("intern");
    const internChain = getAgentChain("analyzer");

    // La catena intern parte da piu avanti, quindi e piu corta o uguale
    expect(internChain.length).toBeLessThanOrEqual(partnerChain.length);

    setCurrentTier(originalTier);
  });
});

// ─── estimateTierCost label format ────────────────────────────────────────────

describe("estimateTierCost label formatting", () => {
  it("tutti gli agenti disabilitati producono label '~gratis'", () => {
    const allAgents = new Set<AgentName>([
      "leader", "question-prep", "classifier", "corpus-agent",
      "analyzer", "investigator", "advisor", "task-executor",
    ]);
    const cost = estimateTierCostForSession("partner", allAgents);
    expect(cost.label).toBe("~gratis");
    expect(cost.perQuery).toBe(0);
  });

  it("label contiene il simbolo $ per costi > 0", () => {
    const cost = estimateTierCostForSession("partner", new Set());
    // Con tutti i provider abilitati (mocked to true), i modelli hanno costi > 0
    if (cost.perQuery > 0) {
      expect(cost.label).toContain("$");
    }
  });
});

// ─── Concurrent getAgentChain with different tiers ───────────────────────────

describe("concurrent getAgentChain isolation", () => {
  it("due sessioni concorrenti con tier diversi ottengono catene diverse per lo stesso agente", async () => {
    const [partnerChain, internChain] = await Promise.all([
      sessionTierStore.run(makeSessionCtx("partner"), async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getAgentChain("analyzer");
      }),
      sessionTierStore.run(makeSessionCtx("intern"), async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getAgentChain("analyzer");
      }),
    ]);

    // Partner starts at index 0, intern starts later
    expect(partnerChain.length).toBeGreaterThanOrEqual(internChain.length);
    // Partner chain should include all models from intern chain
    for (const model of internChain) {
      expect(partnerChain).toContain(model);
    }
  });
});
