/**
 * Registry centralizzato dei modelli AI — controlla.me
 *
 * Un unico file per configurare quale modello usa ogni agente.
 * Per cambiare modello a un agente, modifica SOLO questo file.
 *
 * Provider disponibili (7):
 * - anthropic:  Claude Sonnet 4.5, Haiku 4.5
 * - gemini:     Gemini 2.5 Flash, Flash Lite, Pro
 * - openai:     GPT-5.2, 5.1, 5, 5 Mini/Nano, 4.1, 4.1 Mini/Nano, 4o, 4o Mini, OSS 120B/20B, Codex Mini
 * - mistral:    Large, Medium, Small, Nemo, Ministral 14B/8B/3B, Magistral Small/Medium, Codestral
 * - groq:       Llama 4 Scout, 3.3 70B, 3.1 8B, Qwen 3 32B, GPT-OSS 120B/20B, Kimi K2
 * - cerebras:   GPT-OSS 120B, Qwen 3 235B, Llama 3.1 8B
 * - deepseek:   DeepSeek V3, R1 (⚠️ server in Cina)
 *
 * ~40 modelli registrati, 7 provider.
 * Vedi docs/MODEL-CENSUS.md per pricing e confronto completo.
 */

// ─── Provider Types ───

export type Provider =
  | "anthropic"
  | "gemini"
  | "openai"
  | "mistral"
  | "groq"
  | "cerebras"
  | "deepseek";

export interface ModelConfig {
  provider: Provider;
  model: string;
  /** Display name for logs and UI */
  displayName: string;
  /** Cost per 1M input tokens (USD). 0 = free tier */
  inputCostPer1M: number;
  /** Cost per 1M output tokens (USD). 0 = free tier */
  outputCostPer1M: number;
  /** Max context window */
  contextWindow: number;
}

// ─── Model Catalog ───

export const MODELS = {
  // ── Anthropic ──
  "claude-opus-4.5": {
    provider: "anthropic" as const,
    model: "claude-opus-4-5-20251101",
    displayName: "Claude Opus 4.5",
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    contextWindow: 200_000,
  },
  "claude-sonnet-4.5": {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 200_000,
  },
  "claude-haiku-4.5": {
    provider: "anthropic" as const,
    model: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    inputCostPer1M: 1.0,
    outputCostPer1M: 5.0,
    contextWindow: 200_000,
  },

  // ── Google Gemini ──
  "gemini-2.5-flash": {
    provider: "gemini" as const,
    model: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-pro": {
    provider: "gemini" as const,
    model: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-flash-lite": {
    provider: "gemini" as const,
    model: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    contextWindow: 1_000_000,
  },

  // ── OpenAI ──
  "gpt-4o": {
    provider: "openai" as const,
    model: "gpt-4o",
    displayName: "GPT-4o",
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    contextWindow: 128_000,
  },
  "gpt-4o-mini": {
    provider: "openai" as const,
    model: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    contextWindow: 128_000,
  },
  "gpt-4.1": {
    provider: "openai" as const,
    model: "gpt-4.1",
    displayName: "GPT-4.1",
    inputCostPer1M: 2.0,
    outputCostPer1M: 8.0,
    contextWindow: 1_000_000,
  },
  "gpt-4.1-mini": {
    provider: "openai" as const,
    model: "gpt-4.1-mini",
    displayName: "GPT-4.1 Mini",
    inputCostPer1M: 0.4,
    outputCostPer1M: 1.6,
    contextWindow: 1_000_000,
  },
  "gpt-4.1-nano": {
    provider: "openai" as const,
    model: "gpt-4.1-nano",
    displayName: "GPT-4.1 Nano",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    contextWindow: 1_000_000,
  },
  "gpt-5": {
    provider: "openai" as const,
    model: "gpt-5",
    displayName: "GPT-5",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    contextWindow: 400_000,
  },
  "gpt-5-mini": {
    provider: "openai" as const,
    model: "gpt-5-mini",
    displayName: "GPT-5 Mini",
    inputCostPer1M: 0.25,
    outputCostPer1M: 2.0,
    contextWindow: 400_000,
  },
  "gpt-5-nano": {
    provider: "openai" as const,
    model: "gpt-5-nano",
    displayName: "GPT-5 Nano",
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.4,
    contextWindow: 400_000,
  },
  "gpt-5.1": {
    provider: "openai" as const,
    model: "gpt-5.1",
    displayName: "GPT-5.1",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    contextWindow: 400_000,
  },
  "gpt-5.2": {
    provider: "openai" as const,
    model: "gpt-5.2",
    displayName: "GPT-5.2",
    inputCostPer1M: 1.75,
    outputCostPer1M: 14.0,
    contextWindow: 400_000,
  },
  "gpt-5.1-codex-mini": {
    provider: "openai" as const,
    model: "gpt-5.1-codex-mini",
    displayName: "GPT-5.1 Codex Mini",
    inputCostPer1M: 0.25,
    outputCostPer1M: 2.0,
    contextWindow: 400_000,
  },
  "gpt-oss-20b": {
    provider: "openai" as const,
    model: "gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    inputCostPer1M: 0.03,
    outputCostPer1M: 0.14,
    contextWindow: 128_000,
  },
  "gpt-oss-120b": {
    provider: "openai" as const,
    model: "gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    inputCostPer1M: 0.04,
    outputCostPer1M: 0.19,
    contextWindow: 128_000,
  },

  // ── Mistral (free tier: tutti i modelli, 2 RPM, 1B tok/mese) ──
  "mistral-large-3": {
    provider: "mistral" as const,
    model: "mistral-large-2512",
    displayName: "Mistral Large 3",
    inputCostPer1M: 0.5,
    outputCostPer1M: 1.5,
    contextWindow: 256_000,
  },
  "mistral-medium-3": {
    provider: "mistral" as const,
    model: "mistral-medium-3.1",
    displayName: "Mistral Medium 3.1",
    inputCostPer1M: 0.4,
    outputCostPer1M: 2.0,
    contextWindow: 128_000,
  },
  "mistral-small-3": {
    provider: "mistral" as const,
    model: "mistral-small-3.2-24b-instruct",
    displayName: "Mistral Small 3.2",
    inputCostPer1M: 0.06,
    outputCostPer1M: 0.18,
    contextWindow: 128_000,
  },
  "ministral-8b": {
    provider: "mistral" as const,
    model: "ministral-8b-2512",
    displayName: "Ministral 3 8B",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.15,
    contextWindow: 256_000,
  },
  "ministral-3b": {
    provider: "mistral" as const,
    model: "ministral-3b-2512",
    displayName: "Ministral 3 3B",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.1,
    contextWindow: 128_000,
  },
  "mistral-nemo": {
    provider: "mistral" as const,
    model: "open-mistral-nemo",
    displayName: "Mistral Nemo",
    inputCostPer1M: 0.02,
    outputCostPer1M: 0.04,
    contextWindow: 128_000,
  },
  "ministral-14b": {
    provider: "mistral" as const,
    model: "ministral-14b-2512",
    displayName: "Ministral 14B",
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.2,
    contextWindow: 256_000,
  },
  "magistral-small": {
    provider: "mistral" as const,
    model: "magistral-small-2506",
    displayName: "Magistral Small",
    inputCostPer1M: 0.5,
    outputCostPer1M: 1.5,
    contextWindow: 40_000,
  },
  "magistral-medium": {
    provider: "mistral" as const,
    model: "magistral-medium-2506",
    displayName: "Magistral Medium",
    inputCostPer1M: 2.0,
    outputCostPer1M: 5.0,
    contextWindow: 40_000,
  },
  "codestral": {
    provider: "mistral" as const,
    model: "codestral-2508",
    displayName: "Codestral",
    inputCostPer1M: 0.3,
    outputCostPer1M: 0.9,
    contextWindow: 256_000,
  },

  // ── Groq — Llama su hardware LPU (free tier: 1000 req/giorno) ──
  "groq-llama4-scout": {
    provider: "groq" as const,
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    displayName: "Llama 4 Scout (Groq)",
    inputCostPer1M: 0.11,
    outputCostPer1M: 0.34,
    contextWindow: 128_000,
  },
  "groq-llama3-70b": {
    provider: "groq" as const,
    model: "llama-3.3-70b-versatile",
    displayName: "Llama 3.3 70B (Groq)",
    inputCostPer1M: 0.59,
    outputCostPer1M: 0.79,
    contextWindow: 128_000,
  },
  "groq-llama3-8b": {
    provider: "groq" as const,
    model: "llama-3.1-8b-instant",
    displayName: "Llama 3.1 8B (Groq)",
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.08,
    contextWindow: 128_000,
  },
  "groq-qwen3-32b": {
    provider: "groq" as const,
    model: "qwen/qwen3-32b",
    displayName: "Qwen 3 32B (Groq)",
    inputCostPer1M: 0.29,
    outputCostPer1M: 0.59,
    contextWindow: 128_000,
  },
  "groq-gpt-oss-120b": {
    provider: "groq" as const,
    model: "gpt-oss-120b",
    displayName: "GPT-OSS 120B (Groq)",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    contextWindow: 128_000,
  },
  "groq-gpt-oss-20b": {
    provider: "groq" as const,
    model: "gpt-oss-20b",
    displayName: "GPT-OSS 20B (Groq)",
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
    contextWindow: 128_000,
  },
  "groq-kimi-k2": {
    provider: "groq" as const,
    model: "moonshotai/kimi-k2-instruct",
    displayName: "Kimi K2 (Groq)",
    inputCostPer1M: 1.0,
    outputCostPer1M: 3.0,
    contextWindow: 256_000,
  },

  // ── Cerebras — hardware WSE (free tier: 24M tok/giorno) ──
  "cerebras-gpt-oss-120b": {
    provider: "cerebras" as const,
    model: "gpt-oss-120b",
    displayName: "GPT-OSS 120B (Cerebras)",
    inputCostPer1M: 0.35,
    outputCostPer1M: 0.75,
    contextWindow: 128_000,
  },
  "cerebras-llama3-8b": {
    provider: "cerebras" as const,
    model: "llama3.1-8b",
    displayName: "Llama 3.1 8B (Cerebras)",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.1,
    contextWindow: 128_000,
  },
  "cerebras-qwen3-235b": {
    provider: "cerebras" as const,
    model: "qwen3-235b",
    displayName: "Qwen 3 235B (Cerebras)",
    inputCostPer1M: 0.6,
    outputCostPer1M: 1.2,
    contextWindow: 128_000,
  },

  // ── DeepSeek (⚠️ server in Cina — non usare per dati legali sensibili) ──
  "deepseek-v3": {
    provider: "deepseek" as const,
    model: "deepseek-chat",
    displayName: "DeepSeek V3.2",
    inputCostPer1M: 0.28,
    outputCostPer1M: 0.42,
    contextWindow: 128_000,
  },
  "deepseek-r1": {
    provider: "deepseek" as const,
    model: "deepseek-reasoner",
    displayName: "DeepSeek R1",
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
    contextWindow: 128_000,
  },
} as const satisfies Record<string, ModelConfig>;

export type ModelKey = keyof typeof MODELS;

// ─── Agent Configuration ───

export type AgentName =
  | "leader"
  | "question-prep"
  | "classifier"
  | "analyzer"
  | "investigator"
  | "advisor"
  | "corpus-agent";

export interface AgentModelConfig {
  /** Primary model for this agent */
  primary: ModelKey;
  /** Fallback model if primary fails or is unavailable */
  fallback: ModelKey;
  /** Max output tokens */
  maxTokens: number;
  /** Temperature (0-1) */
  temperature: number;
  /** Notes on why this model was chosen */
  notes: string;
}

/**
 * CONFIGURAZIONE ATTUALE — modifica qui per cambiare modello a qualsiasi agente.
 *
 * Questo è il SINGOLO punto di configurazione per tutti gli agenti.
 */
export const AGENT_MODELS: Record<AgentName, AgentModelConfig> = {
  // ── Corpus Q&A Pipeline — FULL ANTHROPIC ──
  leader: {
    primary: "claude-haiku-4.5",
    fallback: "claude-haiku-4.5",
    maxTokens: 512,
    temperature: 0,
    notes: "Routing veloce. Haiku per qualità decisioni.",
  },
  "question-prep": {
    primary: "claude-haiku-4.5",
    fallback: "claude-haiku-4.5",
    maxTokens: 1024,
    temperature: 0.2,
    notes: "Riformulazione domanda. Haiku per precisione giuridica.",
  },
  "corpus-agent": {
    primary: "claude-haiku-4.5",
    fallback: "claude-haiku-4.5",
    maxTokens: 4096,
    temperature: 0.2,
    notes: "Sintesi risposta. Haiku basta: il lavoro pesante lo fa l'Investigator (Sonnet). Rate limit separati.",
  },
  // ── Document Analysis Pipeline — FULL ANTHROPIC ──
  classifier: {
    primary: "claude-haiku-4.5",
    fallback: "claude-haiku-4.5",
    maxTokens: 4096,
    temperature: 0,
    notes: "Classificazione documento. Haiku eccelle con istruzioni complesse.",
  },
  analyzer: {
    primary: "claude-sonnet-4.5",
    fallback: "claude-sonnet-4.5",
    maxTokens: 8192,
    temperature: 0,
    notes: "Analisi rischi profonda. Serve reasoning top-tier.",
  },
  investigator: {
    primary: "claude-sonnet-4.5",
    fallback: "claude-sonnet-4.5",
    maxTokens: 8192,
    temperature: 0,
    notes: "Usa web_search Anthropic — richiede Claude.",
  },
  advisor: {
    primary: "claude-sonnet-4.5",
    fallback: "claude-sonnet-4.5",
    maxTokens: 4096,
    temperature: 0,
    notes: "Output finale utente. Serve qualità massima, zero errori.",
  },
};

// ─── Helper Functions ───

/** Get the full model config for an agent's primary model. */
export function getAgentModel(agent: AgentName): ModelConfig {
  const agentConfig = AGENT_MODELS[agent];
  return MODELS[agentConfig.primary];
}

/** Get the full model config for an agent's fallback model. */
export function getAgentFallbackModel(agent: AgentName): ModelConfig {
  const agentConfig = AGENT_MODELS[agent];
  return MODELS[agentConfig.fallback];
}

/** Check if a specific provider is enabled (API key present). */
export function isProviderEnabled(provider: Provider): boolean {
  switch (provider) {
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    case "gemini":
      return !!process.env.GEMINI_API_KEY;
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "mistral":
      return !!process.env.MISTRAL_API_KEY;
    case "groq":
      return !!process.env.GROQ_API_KEY;
    case "cerebras":
      return !!process.env.CEREBRAS_API_KEY;
    case "deepseek":
      return !!process.env.DEEPSEEK_API_KEY;
  }
}

/** Get a summary of all enabled providers. */
export function getEnabledProviders(): Provider[] {
  return (
    ["anthropic", "gemini", "openai", "mistral", "groq", "cerebras", "deepseek"] as const
  ).filter(isProviderEnabled);
}

/** Estimate cost for a single agent call (in USD). */
export function estimateAgentCost(
  agent: AgentName,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getAgentModel(agent);
  return (
    (inputTokens / 1_000_000) * model.inputCostPer1M +
    (outputTokens / 1_000_000) * model.outputCostPer1M
  );
}
