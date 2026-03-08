/**
 * lib/llm.ts — Lightweight wrapper for calling free LLM providers (ZERO COSTI)
 *
 * Usa generate() dal registry ai-sdk con catena fallback su provider gratuiti:
 *   1. Gemini 2.5 Flash  (250 req/day free)
 *   2. Groq Llama 4 Scout (1000 req/day free)
 *   3. Cerebras Qwen 3 235B (24M tok/day free)
 *   4. Mistral Small 3 (free tier, 2 RPM)
 *
 * Usato da daemon scripts (cme-autorun, daily-standup, task-runner, etc.)
 * che necessitano di chiamate LLM economiche/gratuite.
 */

import { generate } from "./ai-sdk/generate";
import type { GenerateConfig, GenerateResult } from "./ai-sdk/types";
import type { ModelKey } from "./models";
import { isProviderEnabled } from "./models";

// ─── Catena fallback gratuita ───

const FREE_CHAIN: { key: ModelKey; provider: string }[] = [
  { key: "gemini-2.5-flash", provider: "gemini" },
  { key: "groq-llama4-scout", provider: "groq" },
  { key: "cerebras-qwen3-235b", provider: "cerebras" },
  { key: "mistral-small-3", provider: "mistral" },
];

// ─── Public API ───

export interface CallLLMOptions {
  /** System prompt opzionale */
  systemPrompt?: string;
  /** Max output tokens (default 4096) */
  maxTokens?: number;
  /** Temperature (default 0.2) */
  temperature?: number;
  /** Forza output JSON (default true) */
  jsonOutput?: boolean;
  /** Nome caller per logging */
  callerName?: string;
  /** Modello specifico da usare (bypassa la catena) */
  model?: ModelKey;
}

/**
 * Chiama un LLM gratuito con fallback automatico.
 * Ritorna il testo grezzo della risposta.
 */
export async function callLLM(
  prompt: string,
  options: CallLLMOptions = {}
): Promise<string> {
  const result = await callLLMFull(prompt, options);
  return result.text;
}

/**
 * Come callLLM ma ritorna il GenerateResult completo (per logging/debug).
 */
export async function callLLMFull(
  prompt: string,
  options: CallLLMOptions = {}
): Promise<GenerateResult> {
  const {
    systemPrompt,
    maxTokens = 4096,
    temperature = 0.2,
    jsonOutput = true,
    callerName = "SCRIPT",
    model,
  } = options;

  const config: GenerateConfig = {
    systemPrompt,
    maxTokens,
    temperature,
    jsonOutput,
    agentName: callerName,
  };

  // Se model specifico richiesto, usa solo quello
  if (model) {
    console.log(`  [LLM] ${callerName} -> ${model}`);
    const result = await generate(model, prompt, config);
    console.log(
      `  [LLM] OK ${result.provider}/${result.model} | ${result.durationMs}ms | ${result.usage.inputTokens}in/${result.usage.outputTokens}out`
    );
    return result;
  }

  // Catena fallback gratuita
  const errors: string[] = [];

  for (const { key, provider } of FREE_CHAIN) {
    // Skip provider non configurati
    if (!isProviderEnabled(provider as Parameters<typeof isProviderEnabled>[0])) {
      continue;
    }

    try {
      console.log(`  [LLM] ${callerName} -> ${key}`);
      const result = await generate(key, prompt, config);
      console.log(
        `  [LLM] OK ${result.provider}/${result.model} | ${result.durationMs}ms | ${result.usage.inputTokens}in/${result.usage.outputTokens}out`
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [LLM] FAIL ${key}: ${msg.slice(0, 120)}`);
      errors.push(`${key}: ${msg}`);
    }
  }

  throw new Error(
    `[LLM] Tutti i provider gratuiti hanno fallito per ${callerName}:\n${errors.join("\n")}`
  );
}

// ─── JSON Parser robusto (stesso pattern di lib/anthropic.ts) ───

/**
 * Parsa JSON dalla risposta LLM con fallback chain:
 * 1. Parse diretto
 * 2. Strip code fences
 * 3. Regex estrazione { ... } o [ ... ]
 */
export function parseJSON<T = unknown>(text: string): T {
  // 1. Parse diretto
  try {
    return JSON.parse(text) as T;
  } catch {
    // continue
  }

  // 2. Strip code fences
  const stripped = text
    .replace(/^```(?:json)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // continue
  }

  // 3. Regex: estrai primo { ... } o [ ... ]
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      // continue
    }
  }

  const arrMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]) as T;
    } catch {
      // continue
    }
  }

  throw new Error(
    `[LLM] Impossibile parsare JSON dalla risposta (primi 200 char): ${text.slice(0, 200)}`
  );
}
