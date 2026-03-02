/**
 * Agent Runner — esecuzione agenti con fallback a catena.
 *
 * runAgent(agentName, prompt) legge la catena di fallback dal tier system,
 * tenta ogni modello in ordine, cade al successivo su errore/429,
 * e parsa automaticamente il JSON output.
 */

import {
  AGENT_MODELS,
  MODELS,
  type AgentName,
  type ModelKey,
  isProviderEnabled,
} from "../models";
import { getAgentChain } from "../tiers";
import { generate } from "./generate";
import { parseAgentJSON } from "../anthropic";
import { logAgentCost } from "../company/cost-logger";
import type { GenerateConfig, GenerateResult } from "./types";

export interface AgentRunResult<T> extends GenerateResult {
  /** Parsed JSON output from the model. */
  parsed: T;
  /** True if a fallback model was used instead of the first in chain. */
  usedFallback: boolean;
  /** The model key that was actually used. */
  usedModelKey: ModelKey;
}

/**
 * Esegue un agente usando la catena di fallback dal tier corrente.
 *
 * 1. Ottiene la catena dal tier system (getAgentChain)
 * 2. Per ogni modello nella catena:
 *    - Se il provider è disponibile (API key presente), tenta la chiamata
 *    - Su successo → ritorna risultato
 *    - Su 429/errore → logga e prova il prossimo nella catena
 * 3. Se nessun modello nella catena ha funzionato → throw
 * 4. Parsa il JSON output automaticamente
 *
 * @param agentName - Nome agente (es. "classifier", "analyzer")
 * @param prompt - User prompt (system prompt va in config)
 * @param config - Override opzionali (systemPrompt, maxTokens, etc.)
 */
export async function runAgent<T>(
  agentName: AgentName,
  prompt: string,
  config?: Partial<GenerateConfig>
): Promise<AgentRunResult<T>> {
  const agentConfig = AGENT_MODELS[agentName];
  const chain = getAgentChain(agentName);

  const mergedConfig: GenerateConfig = {
    maxTokens: agentConfig.maxTokens,
    temperature: agentConfig.temperature,
    jsonOutput: true,
    agentName: agentName.toUpperCase(),
    ...config,
  };

  const errors: Array<{ model: ModelKey; error: string }> = [];

  for (let i = 0; i < chain.length; i++) {
    const modelKey = chain[i];
    const model = MODELS[modelKey];
    const isLast = i === chain.length - 1;

    // Skip if provider not available (API key missing)
    if (!isProviderEnabled(model.provider)) {
      console.log(
        `[AGENT-RUNNER] ${agentName} chain[${i}] ${modelKey} skipped (${model.provider} disabilitato)`
      );
      continue;
    }

    try {
      const result = await generate(modelKey, prompt, mergedConfig);
      const parsed = parseAgentJSON<T>(result.text);

      if (i > 0) {
        console.log(
          `[AGENT-RUNNER] ${agentName} risolto con chain[${i}] ${modelKey} (dopo ${i} fallback)`
        );
      }

      // Fire-and-forget cost logging
      logAgentCost({ agentName, modelKey, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, durationMs: result.durationMs, usedFallback: i > 0 }).catch(() => {});

      return {
        ...result,
        parsed,
        usedFallback: i > 0,
        usedModelKey: modelKey,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ model: modelKey, error: errorMsg });

      if (isLast) {
        // Last in chain — no more fallbacks
        throw err;
      }

      const nextAvailable = chain.slice(i + 1).find((k) =>
        isProviderEnabled(MODELS[k].provider)
      );

      if (!nextAvailable) {
        // No more available providers in chain — rethrow original error immediately
        throw err;
      }

      console.warn(
        `[AGENT-RUNNER] ${agentName} chain[${i}] ${modelKey} fallito → ${nextAvailable}: ${errorMsg}`
      );
    }
  }

  // No model in chain was available
  throw new Error(
    `[AGENT-RUNNER] ${agentName}: nessun provider disponibile nella catena. ` +
      `Chain: ${chain.map((k) => `${k}(${MODELS[k].provider})`).join(" → ")}. ` +
      `Errori: ${errors.map((e) => `${e.model}: ${e.error}`).join("; ")}`
  );
}
