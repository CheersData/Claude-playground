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
let _geminiRotatedToAlt = false;

function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    // Use ALT key if already rotated, otherwise primary
    const envKey = _geminiRotatedToAlt && process.env.GEMINI_API_KEY_ALT
      ? "GEMINI_API_KEY_ALT"
      : "GEMINI_API_KEY";
    const apiKey = process.env[envKey];
    if (!apiKey) {
      throw new Error(`Missing ${envKey} environment variable`);
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

/**
 * Attempt to rotate Gemini to ALT key.
 * Returns true if rotation succeeded (ALT key exists and wasn't already active).
 */
function rotateGeminiToAltKey(): boolean {
  if (_geminiRotatedToAlt) return false;
  const altKey = process.env.GEMINI_API_KEY_ALT;
  if (!altKey) return false;

  _geminiRotatedToAlt = true;
  _client = null; // Force recreation on next getGeminiClient()
  console.log("[KEY-ROTATION] gemini switched to ALT key (GEMINI_API_KEY_ALT)");
  return true;
}

// ─── Test Helpers (exported only for tests) ───

/** Reset singleton client and rotation state. Only for tests. */
export function _resetGeminiForTesting(): void {
  _client = null;
  _geminiRotatedToAlt = false;
}

// ─── Config ───

export const GEMINI_MODEL = "gemini-2.5-flash";

const MAX_RETRIES = 3;
const _RETRY_WAIT_MS = 10_000;

// ─── Public API ───

/** Check if Gemini is available (API key present — primary or ALT). */
export function isGeminiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY || !!process.env.GEMINI_API_KEY_ALT;
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

  let client = getGeminiClient();
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
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        status === 429 ||
        errorMsg.includes("RESOURCE_EXHAUSTED");
      const isAuthError = status === 401 || status === 403;

      // On 429, daily quota, or 401/403: try rotating to ALT key before throwing
      // rotateGeminiToAltKey is idempotent — returns false if already rotated or no ALT key
      if ((isRateLimit || isAuthError) && rotateGeminiToAltKey()) {
        console.log(
          `[KEY-ROTATION] ${label} error ${status} → retrying with ALT key`
        );
        client = getGeminiClient();
        continue; // Retry this attempt with the new client
      }

      // Daily quota exhausted on both keys → throw immediately
      const isDailyQuota = errorMsg.includes("PerDay") || errorMsg.includes("per_day");
      if (isRateLimit && isDailyQuota) {
        console.log(
          `[API] ${label} daily quota esaurita (both keys) — throw per fallback immediato`
        );
        throw err;
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

  // Should not reach here, but TypeScript needs it
  throw new Error(`${label}: max retries exceeded`);
}
