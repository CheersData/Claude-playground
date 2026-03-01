/**
 * Tier System — Catene di fallback ordinate per agente.
 *
 * Ogni agente ha una catena di modelli (N modelli). Il tier (intern/associate/partner)
 * determina il punto di partenza nella catena. Su errore 429 o provider non
 * disponibile, si scende automaticamente al modello successivo.
 *
 * Tier:
 *   intern    = modelli gratuiti (Cerebras, Groq, Mistral free)
 *   associate = modelli intermedi (Gemini, Haiku)
 *   partner   = modelli top-tier (Sonnet, GPT-5)
 *
 * Per cambiare catena o tier start: modifica SOLO questo file.
 *
 * SEC-004: Il tier state per la console usa AsyncLocalStorage per isolamento
 * per-request. Le variabili globali rimangono per backward compatibility
 * (orchestrator standard, test, scripts). Le route console wrappano
 * l'esecuzione con sessionTierStore.run(ctx, fn).
 */

import { AsyncLocalStorage } from "async_hooks";
import { type AgentName, type ModelKey, MODELS, isProviderEnabled } from "./models";

// ─── Types ───

export type TierName = "intern" | "associate" | "partner";

export interface TierInfo {
  current: TierName;
  agents: Record<AgentName, {
    chain: Array<{ key: ModelKey; displayName: string; provider: string; available: boolean }>;
    activeIndex: number;
    activeModel: ModelKey;
    enabled: boolean;
  }>;
}

/** Contesto per-sessione iniettato via AsyncLocalStorage nelle route console. */
export interface SessionTierContext {
  tier: TierName;
  disabledAgents: Set<AgentName>;
  /** Session ID per logging e correlazione */
  sid: string;
}

/**
 * AsyncLocalStorage per isolare il tier state per-request nelle route console.
 * Le route wrappano l'esecuzione con:
 *   await sessionTierStore.run(ctx, async () => { ... })
 * Tutte le funzioni getCurrentTier(), isAgentEnabled(), getAgentChain() leggono
 * automaticamente dal context di questo store se presente.
 */
export const sessionTierStore = new AsyncLocalStorage<SessionTierContext>();

// ─── Fallback Chains ───

/**
 * Catena completa per ogni agente. Indice 0 = migliore (partner), ultimo = ultimo resort.
 * Su 429 o errore, si scende al prossimo nella catena.
 */
export const AGENT_CHAINS: Record<AgentName, ModelKey[]> = {
  leader: [
    "claude-haiku-4.5",       // partner
    "gemini-2.5-flash",       // associate
    "cerebras-gpt-oss-120b",  // intern
    "groq-llama4-scout",
    "mistral-small-3",
  ],
  "question-prep": [
    "claude-haiku-4.5",       // partner
    "gemini-2.5-flash",       // associate
    "cerebras-gpt-oss-120b",  // intern
    "groq-llama4-scout",
    "mistral-small-3",
  ],
  classifier: [
    "claude-haiku-4.5",       // partner
    "gemini-2.5-flash",       // associate
    "cerebras-gpt-oss-120b",  // intern
    "groq-llama4-scout",
    "mistral-small-3",
  ],
  "corpus-agent": [
    "claude-sonnet-4.5",      // partner
    "claude-haiku-4.5",       // associate
    "gemini-2.5-flash",       // intern
    "cerebras-gpt-oss-120b",
    "groq-llama4-scout",
  ],
  analyzer: [
    "claude-sonnet-4.5",      // partner
    "gemini-2.5-pro",         // associate
    "mistral-large-3",        // intern (MoE 675B, 2 RPM)
    "groq-llama3-70b",
    "cerebras-gpt-oss-120b",
  ],
  investigator: [
    "claude-sonnet-4.5",      // partner
    "claude-haiku-4.5",       // associate + intern (web_search = solo Anthropic)
  ],
  advisor: [
    "claude-sonnet-4.5",      // partner
    "gemini-2.5-pro",         // associate
    "mistral-large-3",        // intern
    "groq-llama3-70b",
    "cerebras-gpt-oss-120b",
  ],
};

/**
 * Indice di partenza nella catena per ogni tier/agente.
 * Il tier sceglie da dove iniziare; su errore si scende nella catena.
 */
export const TIER_START: Record<AgentName, Record<TierName, number>> = {
  leader:         { partner: 0, associate: 1, intern: 2 },
  "question-prep": { partner: 0, associate: 1, intern: 2 },
  classifier:     { partner: 0, associate: 1, intern: 2 },
  "corpus-agent": { partner: 0, associate: 1, intern: 2 },
  analyzer:       { partner: 0, associate: 1, intern: 2 },
  investigator:   { partner: 0, associate: 1, intern: 1 },  // intern = associate per investigator (solo Anthropic)
  advisor:        { partner: 0, associate: 1, intern: 2 },
};

// ─── State ───

let currentTier: TierName = "partner";
const disabledAgents: Set<AgentName> = new Set();

export function getCurrentTier(): TierName {
  // Legge dal context di sessione se disponibile (route console)
  return sessionTierStore.getStore()?.tier ?? currentTier;
}

// TODO TD-2: setCurrentTier non è chiamato da /api/analyze — rischio di shared state
// tra worker serverless è teorico ma non attuale. Prima di implementare tier dinamico
// per-utente in /api/analyze, wrappare con withRequestTier() usando sessionTierStore
// (già presente e usato dalle route console). Effort stimato: 1h.
export function setCurrentTier(tier: TierName): void {
  currentTier = tier;
  console.log(`[TIER] Switched to: ${tier}`);
}

/** Check if an agent is enabled (not in the disabled set). */
export function isAgentEnabled(agent: AgentName): boolean {
  // Legge dal context di sessione se disponibile (route console)
  const store = sessionTierStore.getStore();
  if (store) return !store.disabledAgents.has(agent);
  return !disabledAgents.has(agent);
}

/** Enable or disable an agent. Disabled agents are skipped in the pipeline. */
export function setAgentEnabled(agent: AgentName, enabled: boolean): void {
  if (enabled) {
    disabledAgents.delete(agent);
  } else {
    disabledAgents.add(agent);
  }
  console.log(`[TIER] Agent ${agent}: ${enabled ? "enabled" : "disabled"}`);
}

/** Get the list of currently disabled agents. */
export function getDisabledAgents(): AgentName[] {
  return Array.from(disabledAgents);
}

// ─── Chain Resolution ───

/**
 * Ritorna la sotto-catena dal punto di partenza del tier corrente.
 * Legge il tier tramite getCurrentTier() per rispettare il context AsyncLocalStorage
 * nelle route console (sessionTierStore.run).
 */
export function getAgentChain(agent: AgentName): ModelKey[] {
  const chain = AGENT_CHAINS[agent];
  const startIndex = TIER_START[agent][getCurrentTier()];
  return chain.slice(startIndex);
}

/**
 * Ritorna la catena completa (non filtrata per tier) — utile per la UI.
 */
export function getFullAgentChain(agent: AgentName): ModelKey[] {
  return AGENT_CHAINS[agent];
}

/**
 * Ritorna il primo modello disponibile nella catena per l'agente corrente.
 */
export function getActiveModel(agent: AgentName): ModelKey {
  const chain = getAgentChain(agent);
  for (const key of chain) {
    if (isProviderEnabled(MODELS[key].provider)) {
      return key;
    }
  }
  return chain[0];
}

// ─── Info ───

/**
 * Ritorna info completa su tier e catene per tutti gli agenti.
 * Usata dalla UI (PowerPanel) e dall'API /api/console/tier.
 */
export function getTierInfo(): TierInfo {
  const agents = {} as TierInfo["agents"];
  const allAgents: AgentName[] = [
    "leader", "question-prep", "classifier", "corpus-agent",
    "analyzer", "investigator", "advisor",
  ];

  for (const agent of allAgents) {
    const chain = getAgentChain(agent);
    const fullChain = chain.map((key) => ({
      key,
      displayName: MODELS[key].displayName,
      provider: MODELS[key].provider,
      available: isProviderEnabled(MODELS[key].provider),
    }));

    let activeIndex = 0;
    for (let i = 0; i < chain.length; i++) {
      if (isProviderEnabled(MODELS[chain[i]].provider)) {
        activeIndex = i;
        break;
      }
    }

    agents[agent] = {
      chain: fullChain,
      activeIndex,
      activeModel: chain[activeIndex],
      enabled: isAgentEnabled(agent),
    };
  }

  return { current: currentTier, agents };
}

/**
 * Versione per-sessione di getTierInfo: usa tier e disabledAgents espliciti.
 * Usata dalle route console per costruire la risposta basata sul token JWT.
 */
export function getTierInfoForSession(
  tier: TierName,
  disabled: Set<AgentName>
): TierInfo {
  const agents = {} as TierInfo["agents"];
  const allAgents: AgentName[] = [
    "leader", "question-prep", "classifier", "corpus-agent",
    "analyzer", "investigator", "advisor",
  ];

  for (const agent of allAgents) {
    const fullChain = AGENT_CHAINS[agent];
    const startIndex = TIER_START[agent][tier];
    const chain = fullChain.slice(startIndex);

    const chainWithMeta = chain.map((key) => ({
      key,
      displayName: MODELS[key].displayName,
      provider: MODELS[key].provider,
      available: isProviderEnabled(MODELS[key].provider),
    }));

    let activeIndex = 0;
    for (let i = 0; i < chain.length; i++) {
      if (isProviderEnabled(MODELS[chain[i]].provider)) {
        activeIndex = i;
        break;
      }
    }

    agents[agent] = {
      chain: chainWithMeta,
      activeIndex,
      activeModel: chain[activeIndex],
      enabled: !disabled.has(agent),
    };
  }

  return { current: tier, agents };
}

/**
 * Stima costo per una query completa (tutti gli agenti) nel tier corrente.
 * Basato su token medi tipici per agente.
 */
export function estimateTierCost(): { perQuery: number; label: string } {
  const TYPICAL_TOKENS: Record<AgentName, { input: number; output: number }> = {
    leader:         { input: 800,  output: 200 },
    "question-prep": { input: 1000, output: 400 },
    classifier:     { input: 5000, output: 1200 },
    "corpus-agent": { input: 8000, output: 2000 },
    analyzer:       { input: 10000, output: 4000 },
    investigator:   { input: 6000, output: 3000 },
    advisor:        { input: 8000, output: 2000 },
  };

  let total = 0;
  for (const agent of Object.keys(TYPICAL_TOKENS) as AgentName[]) {
    if (!isAgentEnabled(agent)) continue;
    const model = MODELS[getActiveModel(agent)];
    const tokens = TYPICAL_TOKENS[agent];
    total +=
      (tokens.input / 1_000_000) * model.inputCostPer1M +
      (tokens.output / 1_000_000) * model.outputCostPer1M;
  }

  if (total < 0.001) return { perQuery: 0, label: "~gratis" };
  if (total < 0.01) return { perQuery: total, label: `~$${(total * 100).toFixed(1)}c` };
  return { perQuery: total, label: `~$${total.toFixed(3)}` };
}

/**
 * Versione per-sessione di estimateTierCost: usa tier e disabledAgents espliciti.
 */
export function estimateTierCostForSession(
  tier: TierName,
  disabled: Set<AgentName>
): { perQuery: number; label: string } {
  const TYPICAL_TOKENS: Record<AgentName, { input: number; output: number }> = {
    leader:          { input: 800,   output: 200 },
    "question-prep": { input: 1000,  output: 400 },
    classifier:      { input: 5000,  output: 1200 },
    "corpus-agent":  { input: 8000,  output: 2000 },
    analyzer:        { input: 10000, output: 4000 },
    investigator:    { input: 6000,  output: 3000 },
    advisor:         { input: 8000,  output: 2000 },
  };

  let total = 0;
  for (const agent of Object.keys(TYPICAL_TOKENS) as AgentName[]) {
    if (disabled.has(agent)) continue;
    const startIndex = TIER_START[agent][tier];
    const chain = AGENT_CHAINS[agent].slice(startIndex);
    const activeKey = chain.find((k) => isProviderEnabled(MODELS[k].provider)) ?? chain[0];
    const model = MODELS[activeKey];
    const tokens = TYPICAL_TOKENS[agent];
    total +=
      (tokens.input / 1_000_000) * model.inputCostPer1M +
      (tokens.output / 1_000_000) * model.outputCostPer1M;
  }

  if (total < 0.001) return { perQuery: 0, label: "~gratis" };
  if (total < 0.01) return { perQuery: total, label: `~$${(total * 100).toFixed(1)}c` };
  return { perQuery: total, label: `~$${total.toFixed(3)}` };
}
