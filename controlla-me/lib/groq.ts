/**
 * Groq Client — wrapper per Llama 4, Mixtral su hardware Groq (LPU).
 *
 * Usa l'SDK OpenAI con baseURL Groq (API compatibile OpenAI).
 * Free tier: 1000 req/giorno, no carta richiesta.
 * Punto di forza: velocita' di inferenza estrema (migliaia di token/s).
 *
 * Richiede: GROQ_API_KEY nel .env.local
 */

import OpenAI from "openai";

export { parseAgentJSON } from "./anthropic";

// ─── Singleton ───

let _client: OpenAI | null = null;

function getGroqClient(): OpenAI {
  if (!_client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("Missing GROQ_API_KEY environment variable");
    }
    _client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return _client;
}

// ─── Models ───

/** Llama 4 Scout: 109B params, context 512K ($0.11/$0.34 per 1M token) */
export const GROQ_MODEL_LLAMA4_SCOUT = "meta-llama/llama-4-scout-17b-16e-instruct";
/** Llama 3.3 70B: reasoning forte ($0.59/$0.79 per 1M token) */
export const GROQ_MODEL_LLAMA3_70B = "llama-3.3-70b-versatile";
/** Llama 3.1 8B: ultra-veloce, economy ($0.05/$0.08 per 1M token) */
export const GROQ_MODEL_LLAMA3_8B = "llama-3.1-8b-instant";

const MAX_RETRIES = 3;
const RETRY_WAIT_MS = 10_000;

// ─── Public API ───

/** Check if Groq is available (API key present). */
export function isGroqEnabled(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export interface GroqGenerateConfig {
  /** Model to use. Default llama-4-scout. */
  model?: string;
  /** System prompt. */
  systemPrompt?: string;
  /** Max output tokens. Default 4096. */
  maxTokens?: number;
  /** Temperature. Default 0.2. */
  temperature?: number;
  /** Force JSON output via response_format. Default true. */
  jsonOutput?: boolean;
  /** Agent name for logging. Default "GROQ". */
  agentName?: string;
}

export interface GroqResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

/**
 * Generate a response with a model on Groq hardware.
 * Includes retry logic (3 attempts, 10s wait on 429).
 */
export async function generateWithGroq(
  prompt: string,
  config: GroqGenerateConfig = {}
): Promise<GroqResult> {
  const {
    model = GROQ_MODEL_LLAMA4_SCOUT,
    systemPrompt,
    maxTokens = 4096,
    temperature = 0.2,
    jsonOutput = true,
    agentName = "GROQ",
  } = config;

  const client = getGroqClient();
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
