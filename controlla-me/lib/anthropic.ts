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
 * Parse JSON from Claude's response, stripping markdown code fences if present.
 */
export function parseAgentJSON<T>(text: string): T {
  let cleaned = text.trim();

  // Strip markdown code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  return JSON.parse(cleaned);
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
