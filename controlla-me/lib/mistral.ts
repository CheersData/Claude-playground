/**
 * Mistral Client — wrapper per Mistral Large, Nemo, Codestral.
 *
 * Usa l'SDK OpenAI con baseURL Mistral (API compatibile OpenAI).
 * Free tier: tutti i modelli, 2 RPM, 1B token/mese. No carta richiesta.
 *
 * Richiede: MISTRAL_API_KEY nel .env.local
 */

import OpenAI from "openai";

export { parseAgentJSON } from "./anthropic";

// ─── Singleton ───

let _client: OpenAI | null = null;

function getMistralClient(): OpenAI {
  if (!_client) {
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error("Missing MISTRAL_API_KEY environment variable");
    }
    _client = new OpenAI({
      apiKey: process.env.MISTRAL_API_KEY,
      baseURL: "https://api.mistral.ai/v1",
    });
  }
  return _client;
}

// ─── Models ───

/** Mistral Large 3: MoE 675B, reasoning forte ($0.50/$1.50 per 1M token) */
export const MISTRAL_MODEL_LARGE = "mistral-large-2512";
/** Mistral Medium 3.1: fascia media ($0.40/$2.00 per 1M token) */
export const MISTRAL_MODEL_MEDIUM = "mistral-medium-3.1";
/** Mistral Small 3.2: 24B params, economico ($0.06/$0.18 per 1M token) */
export const MISTRAL_MODEL_SMALL = "mistral-small-3.2-24b-instruct";
/** Ministral 3 8B: leggero ($0.15/$0.15 per 1M token) */
export const MISTRAL_MODEL_MINI = "ministral-8b-2512";
/** Ministral 3 3B: ultra-leggero ($0.10/$0.10 per 1M token) */
export const MISTRAL_MODEL_NANO = "ministral-3b-2512";
/** Codestral: specializzato codice ($0.30/$0.90 per 1M token) */
export const MISTRAL_MODEL_CODE = "codestral-2508";

const MAX_RETRIES = 3;
const RETRY_WAIT_MS = 35_000; // Free tier ha 2 RPM, serve wait piu' lungo

// ─── Public API ───

/** Check if Mistral is available (API key present). */
export function isMistralEnabled(): boolean {
  return !!process.env.MISTRAL_API_KEY;
}

export interface MistralGenerateConfig {
  /** Model to use. Default mistral-small-latest. */
  model?: string;
  /** System prompt. */
  systemPrompt?: string;
  /** Max output tokens. Default 4096. */
  maxTokens?: number;
  /** Temperature. Default 0.2. */
  temperature?: number;
  /** Force JSON output via response_format. Default true. */
  jsonOutput?: boolean;
  /** Agent name for logging. Default "MISTRAL". */
  agentName?: string;
}

export interface MistralResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

/**
 * Generate a response with a Mistral model.
 * Includes retry logic (3 attempts, 35s wait on 429).
 */
export async function generateWithMistral(
  prompt: string,
  config: MistralGenerateConfig = {}
): Promise<MistralResult> {
  const {
    model = MISTRAL_MODEL_SMALL,
    systemPrompt,
    maxTokens = 4096,
    temperature = 0.2,
    jsonOutput = true,
    agentName = "MISTRAL",
  } = config;

  const client = getMistralClient();
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
      };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isRateLimit =
        status === 429 ||
        (err instanceof Error && err.message.includes("rate_limit"));

      if (isRateLimit && attempt < MAX_RETRIES) {
        console.log(
          `[API] ⏳ ${label} rate limit! Attendo ${RETRY_WAIT_MS / 1000}s (tentativo ${attempt + 1}/${MAX_RETRIES})...`
        );
        await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
        continue;
      }

      throw err;
    }
  }

  throw new Error(`${label}: max retries exceeded`);
}
