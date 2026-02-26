/**
 * Gemini Client — wrapper per Google Gemini 2.5 Flash.
 *
 * Parallelo a lib/anthropic.ts: logging, retry con backoff, parsing JSON.
 * Primo provider LLM alternativo nel progetto — introduce multi-provider.
 *
 * Richiede: GEMINI_API_KEY nel .env.local
 * Se la chiave non è presente, isGeminiEnabled() ritorna false e il
 * corpus agent usa il fallback Haiku.
 */

import { GoogleGenAI } from "@google/genai";

export { parseAgentJSON } from "./anthropic";

// ─── Singleton ───

let _client: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY environment variable");
    }
    _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _client;
}

// ─── Config ───

export const GEMINI_MODEL = "gemini-2.5-flash";

const MAX_RETRIES = 3;
const RETRY_WAIT_MS = 10_000;

// ─── Public API ───

/** Check if Gemini is available (API key present). */
export function isGeminiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export interface GeminiGenerateConfig {
  /** System instruction for the model. */
  systemPrompt?: string;
  /** Max output tokens. Default 4096. */
  maxOutputTokens?: number;
  /** Temperature. Default 0.2. */
  temperature?: number;
  /** Force JSON output via responseMimeType. Default true. */
  jsonOutput?: boolean;
  /** Agent name for logging. Default "GEMINI". */
  agentName?: string;
}

export interface GeminiResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

/**
 * Generate a response with Gemini 2.5 Flash.
 * Includes retry logic (3 attempts, 10s wait on 429).
 */
export async function generateWithGemini(
  prompt: string,
  config: GeminiGenerateConfig = {}
): Promise<GeminiResult> {
  const {
    systemPrompt,
    maxOutputTokens = 4096,
    temperature = 0.2,
    jsonOutput = true,
    agentName = "GEMINI",
  } = config;

  const client = getGeminiClient();
  const inputChars = prompt.length + (systemPrompt?.length ?? 0);
  const label = agentName.toUpperCase();

  console.log(
    `\n${"=".repeat(60)}\n[API] → ${label} | model: ${GEMINI_MODEL} | max_tokens: ${maxOutputTokens} | input: ~${inputChars} chars`
  );

  const start = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens,
          temperature,
          ...(jsonOutput ? { responseMimeType: "application/json" } : {}),
        },
      });

      const elapsed = Date.now() - start;
      const text = response.text ?? "";
      const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

      console.log(
        `[API] ← ${label} | ${(elapsed / 1000).toFixed(1)}s | tokens: ${inputTokens} in / ${outputTokens} out | risposta totale: ${text.length} chars`
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
        (err instanceof Error && err.message.includes("RESOURCE_EXHAUSTED"));

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

  // Should not reach here, but TypeScript needs it
  throw new Error(`${label}: max retries exceeded`);
}
