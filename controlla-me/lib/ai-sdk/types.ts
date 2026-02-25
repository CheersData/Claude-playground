/**
 * AI SDK — Interfacce comuni per tutti i provider.
 *
 * Usate da generate(), runAgent(), e openai-compat.
 */

export interface GenerateConfig {
  /** System prompt. */
  systemPrompt?: string;
  /** Max output tokens. */
  maxTokens?: number;
  /** Temperature (0-1). */
  temperature?: number;
  /** Force JSON output via response_format/responseMimeType. Default true. */
  jsonOutput?: boolean;
  /** Agent/caller name for logging. */
  agentName?: string;
}

export interface GenerateResult {
  /** Raw text response from the model. */
  text: string;
  /** Token usage. */
  usage: { inputTokens: number; outputTokens: number };
  /** Wall-clock time for the API call in milliseconds. */
  durationMs: number;
  /** Provider that served the request. */
  provider: string;
  /** Model ID used. */
  model: string;
}
