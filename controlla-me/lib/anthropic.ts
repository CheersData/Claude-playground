import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _client;
}

/** @deprecated Use getAnthropicClient() instead */
export const anthropic = {
  get messages() {
    return getAnthropicClient().messages;
  },
};

export const MODEL = "claude-sonnet-4-5-20250929";

/**
 * Parse JSON from Claude's response, handling markdown fences and surrounding text.
 */
export function parseAgentJSON<T>(text: string): T {
  let cleaned = text.trim();

  // Try 1: Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try 2: Direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try 3: Find the first { ... } or [ ... ] block in the text
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // fall through
      }
    }

    throw new Error(
      `Risposta non JSON da Claude. Inizio risposta: "${cleaned.slice(0, 200)}..."`
    );
  }
}

/**
 * Extract text content from a Claude message response.
 */
export function extractTextContent(
  response: Anthropic.Messages.Message
): string {
  const textBlocks = response.content.filter(
    (block): block is Anthropic.Messages.TextBlock => block.type === "text"
  );
  return textBlocks.map((block) => block.text).join("\n");
}
