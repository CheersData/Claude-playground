/**
 * Cerebras Client — wrapper per Llama su hardware Cerebras (WSE).
 *
 * Usa l'SDK OpenAI con baseURL Cerebras (API compatibile OpenAI).
 * Free tier: 1M token/giorno, 30 RPM. No carta richiesta.
 * Punto di forza: velocita' estrema, simile a Groq.
 *
 * Richiede: CEREBRAS_API_KEY nel .env.local
 */

import OpenAI from "openai";

export { parseAgentJSON } from "./anthropic";

// ─── Singleton ───

let _client: OpenAI | null = null;

function getCerebrasClient(): OpenAI {
  if (!_client) {
    if (!process.env.CEREBRAS_API_KEY) {
      throw new Error("Missing CEREBRAS_API_KEY environment variable");
    }
    _client = new OpenAI({
      apiKey: process.env.CEREBRAS_API_KEY,
      baseURL: "https://api.cerebras.ai/v1",
    });
  }
  return _client;
}

// ─── Models ───

/** Llama 3.3 70B su Cerebras: reasoning forte, velocita' estrema */
export const CEREBRAS_MODEL_LLAMA3_70B = "llama-3.3-70b";
/** Llama 3.1 8B su Cerebras: ultra-veloce, economy */
export const CEREBRAS_MODEL_LLAMA3_8B = "llama3.1-8b";

const MAX_RETRIES = 3;
const RETRY_WAIT_MS = 10_000;

// ─── Public API ───

/** Check if Cerebras is available (API key present). */
export function isCerebrasEnabled(): boolean {
  return !!process.env.CEREBRAS_API_KEY;
}

export interface CerebrasGenerateConfig {
  /** Model to use. Default llama-3.3-70b. */
  model?: string;
  /** System prompt. */
  systemPrompt?: string;
  /** Max output tokens. Default 4096. */
  maxTokens?: number;
  /** Temperature. Default 0.2. */
  temperature?: number;
  /** Force JSON output via response_format. Default true. */
  jsonOutput?: boolean;
  /** Agent name for logging. Default "CEREBRAS". */
  agentName?: string;
}

export interface CerebrasResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

/**
 * Generate a response with a model on Cerebras hardware.
 * Includes retry logic (3 attempts, 10s wait on 429).
 */
export async function generateWithCerebras(
  prompt: string,
  config: CerebrasGenerateConfig = {}
): Promise<CerebrasResult> {
  const {
    model = CEREBRAS_MODEL_LLAMA3_70B,
    systemPrompt,
    maxTokens = 4096,
    temperature = 0.2,
    jsonOutput = true,
    agentName = "CEREBRAS",
  } = config;

  const client = getCerebrasClient();
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
