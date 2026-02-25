/**
 * OpenAI-Compatible Provider — 1 funzione per 5 provider.
 *
 * Sostituisce lib/openai.ts, lib/groq.ts, lib/mistral.ts,
 * lib/cerebras.ts, lib/deepseek.ts con una sola implementazione
 * parametrizzata. Tutti usano l'SDK OpenAI con baseURL diversa.
 */

import OpenAI from "openai";
import type { GenerateConfig, GenerateResult } from "./types";

// ─── Provider Configuration ───

type OpenAICompatProvider = "openai" | "groq" | "mistral" | "cerebras" | "deepseek";

interface ProviderConfig {
  baseURL?: string;
  envKey: string;
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
    retryWaitMs: 10_000,
    maxRetries: 3,
  },
  mistral: {
    baseURL: "https://api.mistral.ai/v1",
    envKey: "MISTRAL_API_KEY",
    retryWaitMs: 35_000, // Free tier 2 RPM, serve wait piu' lungo
    maxRetries: 3,
  },
  cerebras: {
    baseURL: "https://api.cerebras.ai/v1",
    envKey: "CEREBRAS_API_KEY",
    retryWaitMs: 10_000,
    maxRetries: 3,
  },
  deepseek: {
    baseURL: "https://api.deepseek.com",
    envKey: "DEEPSEEK_API_KEY",
    retryWaitMs: 15_000,
    maxRetries: 3,
  },
};

// ─── Singleton Pool ───

const _clients = new Map<string, OpenAI>();

function getClient(provider: OpenAICompatProvider): OpenAI {
  let client = _clients.get(provider);
  if (!client) {
    const config = PROVIDER_CONFIGS[provider];
    const apiKey = process.env[config.envKey];
    if (!apiKey) {
      throw new Error(`Missing ${config.envKey} environment variable`);
    }
    client = new OpenAI({
      apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    _clients.set(provider, client);
  }
  return client;
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
  const client = getClient(provider);
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

      if (isRateLimit && attempt < providerConfig.maxRetries) {
        console.log(
          `[API] ⏳ ${label} rate limit! Attendo ${providerConfig.retryWaitMs / 1000}s (tentativo ${attempt + 1}/${providerConfig.maxRetries})...`
        );
        await new Promise((r) => setTimeout(r, providerConfig.retryWaitMs));
        continue;
      }

      throw err;
    }
  }

  throw new Error(`${label}: max retries exceeded`);
}
