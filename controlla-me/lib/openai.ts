/**
 * OpenAI Client — wrapper per GPT-4o, GPT-4.1, GPT-4o Mini, GPT-4.1 Nano.
 *
 * Parallelo a lib/anthropic.ts e lib/gemini.ts: logging, retry, parsing JSON.
 *
 * Richiede: OPENAI_API_KEY nel .env.local
 * Se la chiave non è presente, isOpenAIEnabled() ritorna false.
 */

import OpenAI from "openai";

export { parseAgentJSON } from "./anthropic";

// ─── Singleton ───

let _client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY environment variable");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// ─── Models ───

/** Premium: reasoning avanzato, output finale */
export const OPENAI_MODEL_PREMIUM = "gpt-4o";
/** Medium: buon rapporto qualità/prezzo, context 1M */
export const OPENAI_MODEL_MEDIUM = "gpt-4.1-mini";
/** Economy: task semplici, context 1M, costo minimo */
export const OPENAI_MODEL_ECONOMY = "gpt-4.1-nano";
/** Fast: equivalente economy con context 128K */
export const OPENAI_MODEL_FAST = "gpt-4o-mini";

const MAX_RETRIES = 4;
const RETRY_WAIT_MS = 30_000; // OpenAI rate limit reset più veloce di Anthropic

// ─── Public API ───

/** Check if OpenAI is available (API key present). */
export function isOpenAIEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export interface OpenAIGenerateConfig {
  /** Model to use. Default gpt-4o-mini. */
  model?: string;
  /** System prompt. */
  systemPrompt?: string;
  /** Max output tokens. Default 4096. */
  maxTokens?: number;
  /** Temperature. Default 0.2. */
  temperature?: number;
  /** Force JSON output via response_format. Default true. */
  jsonOutput?: boolean;
  /** Agent name for logging. Default "OPENAI". */
  agentName?: string;
}

export interface OpenAIResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

/**
 * Generate a response with an OpenAI model.
 * Includes retry logic (4 attempts, 30s wait on 429).
 */
export async function generateWithOpenAI(
  prompt: string,
  config: OpenAIGenerateConfig = {}
): Promise<OpenAIResult> {
  const {
    model = OPENAI_MODEL_FAST,
    systemPrompt,
    maxTokens = 4096,
    temperature = 0.2,
    jsonOutput = true,
    agentName = "OPENAI",
  } = config;

  const client = getOpenAIClient();
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
