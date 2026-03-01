/**
 * Universal Generate — router che instrada a qualsiasi provider.
 *
 * generate(modelKey, prompt, config) → provider corretto.
 * Usa il registry MODELS da lib/models.ts per risolvere ModelKey → provider + model ID.
 */

import { MODELS, type ModelKey } from "../models";
import { generateWithOpenAICompat } from "./openai-compat";
import { generateWithGemini } from "../gemini";
import { anthropic, extractTextContent } from "../anthropic";
import type { GenerateConfig, GenerateResult } from "./types";

/**
 * Genera una risposta usando qualsiasi modello del registry.
 *
 * @param modelKey - Chiave dal catalogo MODELS (es. "claude-haiku-4.5", "gemini-2.5-flash")
 * @param prompt - User prompt
 * @param config - Configurazione opzionale (systemPrompt, maxTokens, temperature, etc.)
 */
export async function generate(
  modelKey: ModelKey,
  prompt: string,
  config: GenerateConfig = {}
): Promise<GenerateResult> {
  const modelConfig = MODELS[modelKey];

  switch (modelConfig.provider) {
    case "anthropic":
      return generateWithAnthropic(modelConfig.model, prompt, config);

    case "gemini":
      return generateWithGeminiAdapter(modelConfig.model, prompt, config);

    case "openai":
    case "groq":
    case "mistral":
    case "cerebras":
      return generateWithOpenAICompat(
        modelConfig.provider,
        modelConfig.model,
        prompt,
        config
      );

  }
}

// ─── Anthropic Adapter ───

async function generateWithAnthropic(
  model: string,
  prompt: string,
  config: GenerateConfig
): Promise<GenerateResult> {
  const {
    systemPrompt,
    maxTokens = 4096,
    temperature = 0,
    agentName = "ANTHROPIC",
  } = config;

  const start = Date.now();

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  const text = extractTextContent(response);

  return {
    text,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    durationMs: Date.now() - start,
    provider: "anthropic",
    model,
  };
}

// ─── Gemini Adapter ───

async function generateWithGeminiAdapter(
  _model: string,
  prompt: string,
  config: GenerateConfig
): Promise<GenerateResult> {
  const {
    systemPrompt,
    maxTokens = 4096,
    temperature = 0.2,
    jsonOutput = true,
    agentName = "GEMINI",
  } = config;

  const result = await generateWithGemini(prompt, {
    systemPrompt,
    maxOutputTokens: maxTokens,
    temperature,
    jsonOutput,
    agentName,
  });

  return {
    text: result.text,
    usage: result.usage,
    durationMs: result.durationMs,
    provider: "gemini",
    model: _model,
  };
}
