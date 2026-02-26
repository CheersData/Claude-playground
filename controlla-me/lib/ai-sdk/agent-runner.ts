/**
 * Agent Runner — esecuzione agenti con fallback automatico.
 *
 * runAgent(agentName, prompt) legge la config da AGENT_MODELS,
 * tenta il primary, cade sul fallback se necessario,
 * e parsa automaticamente il JSON output.
 */

import {
  AGENT_MODELS,
  MODELS,
  type AgentName,
  isProviderEnabled,
} from "../models";
import { generate } from "./generate";
import { parseAgentJSON } from "../anthropic";
import type { GenerateConfig, GenerateResult } from "./types";

export interface AgentRunResult<T> extends GenerateResult {
  /** Parsed JSON output from the model. */
  parsed: T;
  /** True if the fallback model was used instead of primary. */
  usedFallback: boolean;
}

/**
 * Esegue un agente usando la configurazione centralizzata da AGENT_MODELS.
 *
 * 1. Legge primary/fallback/maxTokens/temperature da AGENT_MODELS[agentName]
 * 2. Se il provider del primary e' disponibile, lo usa
 * 3. Se fallisce (errore o provider non disponibile), prova il fallback
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
  const primaryModel = MODELS[agentConfig.primary];
  const fallbackModel = MODELS[agentConfig.fallback];

  const mergedConfig: GenerateConfig = {
    maxTokens: agentConfig.maxTokens,
    temperature: agentConfig.temperature,
    jsonOutput: true,
    agentName: agentName.toUpperCase(),
    ...config,
  };

  // Try primary
  const primaryAvailable = isProviderEnabled(primaryModel.provider);

  if (primaryAvailable) {
    try {
      const result = await generate(agentConfig.primary, prompt, mergedConfig);
      const parsed = parseAgentJSON<T>(result.text);
      return { ...result, parsed, usedFallback: false };
    } catch (err) {
      // If primary and fallback are the same, don't retry
      if (agentConfig.primary === agentConfig.fallback) {
        throw err;
      }
      console.warn(
        `[AGENT-RUNNER] ${agentName} primary (${agentConfig.primary}) fallito, provo fallback (${agentConfig.fallback}):`,
        err instanceof Error ? err.message : err
      );
    }
  } else {
    console.log(
      `[AGENT-RUNNER] ${agentName} primary (${agentConfig.primary}) non disponibile (${primaryModel.provider} disabilitato), uso fallback`
    );
  }

  // Try fallback
  const fallbackAvailable = isProviderEnabled(fallbackModel.provider);
  if (!fallbackAvailable) {
    throw new Error(
      `[AGENT-RUNNER] ${agentName}: nessun provider disponibile. ` +
        `Primary: ${primaryModel.provider} (${primaryAvailable ? "errore" : "disabilitato"}), ` +
        `Fallback: ${fallbackModel.provider} (disabilitato)`
    );
  }

  const result = await generate(agentConfig.fallback, prompt, mergedConfig);
  const parsed = parseAgentJSON<T>(result.text);
  return { ...result, parsed, usedFallback: true };
}
