/**
 * OpenAI-Compatible Provider — 1 funzione per 4 provider.
 *
 * Sostituisce lib/openai.ts, lib/groq.ts, lib/mistral.ts, lib/cerebras.ts
 * con una sola implementazione parametrizzata.
 * Tutti usano l'SDK OpenAI con baseURL diversa.
 * ⚠️  DeepSeek RIMOSSO (SEC-001): server in Cina, non conforme GDPR/SCHREMS II.
 */

import OpenAI from "openai";
import type { GenerateConfig, GenerateResult } from "./types";

// ─── Provider Configuration ───

type OpenAICompatProvider = "openai" | "groq" | "mistral" | "cerebras" | "sambanova";

interface ProviderConfig {
  baseURL?: string;
  envKey: string;
  envKeyAlt?: string;
  retryWaitMs: number;
  maxRetries: number;
}

const PROVIDER_CONFIGS: Record<OpenAICompatProvider, ProviderConfig> = {
  openai: {
    envKey: "OPENAI_API_KEY",
    retryWaitMs: 30_000,
    maxRetries: 4,
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    envKeyAlt: "GROQ_API_KEY_ALT",
    retryWaitMs: 10_000,
    maxRetries: 3,
  },
  mistral: {
    baseURL: "https://api.mistral.ai/v1",
    envKey: "MISTRAL_API_KEY",
    envKeyAlt: "MISTRAL_API_KEY_ALT",
    retryWaitMs: 35_000, // Free tier 2 RPM, serve wait piu' lungo
    maxRetries: 3,
  },
  cerebras: {
    baseURL: "https://api.cerebras.ai/v1",
    envKey: "CEREBRAS_API_KEY",
    envKeyAlt: "CEREBRAS_API_KEY_ALT",
    retryWaitMs: 10_000,
    maxRetries: 3,
  },
  sambanova: {
    baseURL: "https://api.sambanova.ai/v1",
    envKey: "SAMBANOVA_API_KEY",
    envKeyAlt: "SAMBANOVA_API_KEY_ALT",
    retryWaitMs: 10_000,
    maxRetries: 3,
  },
};

// ─── Singleton Pool ───

const _clients = new Map<string, OpenAI>();

/** Tracks providers that have been permanently rotated to their ALT key. */
const _rotatedProviders = new Set<string>();

function getClient(provider: OpenAICompatProvider): OpenAI {
  let client = _clients.get(provider);
  if (!client) {
    const config = PROVIDER_CONFIGS[provider];
    // Use ALT key if already rotated, otherwise primary
    const useAlt = _rotatedProviders.has(provider);
    const envKeyToUse = useAlt && config.envKeyAlt ? config.envKeyAlt : config.envKey;
    const apiKey = process.env[envKeyToUse];
    if (!apiKey) {
      throw new Error(`Missing ${envKeyToUse} environment variable`);
    }
    client = new OpenAI({
      apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    _clients.set(provider, client);
  }
  return client;
}

/**
 * Attempt to rotate to ALT key for a provider.
 * Returns true if rotation succeeded (ALT key exists and wasn't already active).
 */
function rotateToAltKey(provider: OpenAICompatProvider): boolean {
  if (_rotatedProviders.has(provider)) return false; // Already on ALT
  const config = PROVIDER_CONFIGS[provider];
  if (!config.envKeyAlt) return false;
  const altKey = process.env[config.envKeyAlt];
  if (!altKey) return false;

  // Permanently rotate: recreate client with ALT key
  _rotatedProviders.add(provider);
  _clients.delete(provider); // Force recreation on next getClient()
  console.log(`[KEY-ROTATION] ${provider} switched to ALT key (${config.envKeyAlt})`);
  return true;
}

// ─── Public API ───

/**
 * Generate a response using any OpenAI-compatible provider.
 * Includes retry logic with provider-specific wait times.
 */
export async function generateWithOpenAICompat(
  provider: OpenAICompatProvider,
  model: string,
  prompt: string,
  config: GenerateConfig = {}
): Promise<GenerateResult> {
  const {
    systemPrompt,
    maxTokens = 4096,
    temperature = 0.2,
    jsonOutput = true,
    agentName = provider.toUpperCase(),
  } = config;

  const providerConfig = PROVIDER_CONFIGS[provider];
  let client = getClient(provider);
  const inputChars = prompt.length + (systemPrompt?.length ?? 0);
  const label = agentName.toUpperCase();

  console.log(
    `\n${"=".repeat(60)}\n[API] → ${label} | model: ${model} | max_tokens: ${maxTokens} | input: ~${inputChars} chars`
  );

  const start = Date.now();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  for (let attempt = 0; attempt <= providerConfig.maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(jsonOutput ? { response_format: { type: "json_object" as const } } : {}),
      });

      const elapsed = Date.now() - start;
      const text = response.choices[0]?.message?.content ?? "";
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;

      console.log(
        `[API] ← ${label} | ${(elapsed / 1000).toFixed(1)}s | tokens: ${inputTokens} in / ${outputTokens} out | stop: ${response.choices[0]?.finish_reason} | risposta totale: ${text.length} chars`
      );
      console.log(
        `[API]   Risposta (primi 8000 char):\n${text.slice(0, 8000)}${text.length > 8000 ? "\n... [troncato, altri " + (text.length - 8000) + " chars]" : ""}`
      );
      console.log("=".repeat(60));

      return {
        text,
        usage: { inputTokens, outputTokens },
        durationMs: elapsed,
        provider,
        model,
      };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isRateLimit =
        status === 429 ||
        (err instanceof Error && err.message.includes("rate_limit"));
      const isAuthError = status === 401 || status === 403;

      // On 429 or 401/403: try rotating to ALT key before throwing
      // rotateToAltKey is idempotent — returns false if already rotated or no ALT key
      if ((isRateLimit || isAuthError) && rotateToAltKey(provider)) {
        console.log(
          `[KEY-ROTATION] ${label} error ${status} → retrying with ALT key`
        );
        client = getClient(provider);
        continue; // Retry this attempt with the new client
      }

      if (isRateLimit) {
        // Already on ALT key (or no ALT available) → let agent-runner try next provider
        console.log(
          `[API] ${label} rate limit (both keys exhausted) → skip al prossimo provider nella catena`
        );
        throw err;
      }

      throw err;
    }
  }

  throw new Error(`${label}: max retries exceeded`);
}
