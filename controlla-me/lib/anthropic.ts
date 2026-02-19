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

/** Logging wrapper around the Anthropic client */
export const anthropic = {
  get messages() {
    const client = getAnthropicClient();
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async create(params: any): Promise<Anthropic.Messages.Message> {
        const agentName =
          params.system
            ?.toString()
            .match(/Sei l['']agente (\w+)|Tu sei (\w+)|Agente: (\w+)/i)?.[1] ??
          params.system?.toString().slice(0, 30) ??
          "unknown";
        const inputChars = JSON.stringify(params.messages).length;

        console.log(
          `\n${"=".repeat(60)}\n[API] → ${agentName.toUpperCase()} | model: ${params.model} | max_tokens: ${params.max_tokens} | input: ~${inputChars} chars`
        );

        const start = Date.now();
        const response = await client.messages.create(params);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        const textContent = response.content
          .filter(
            (b): b is Anthropic.Messages.TextBlock => b.type === "text"
          )
          .map((b) => b.text)
          .join("\n");

        console.log(
          `[API] ← ${agentName.toUpperCase()} | ${elapsed}s | tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out | stop: ${response.stop_reason}`
        );
        console.log(
          `[API]   Risposta (primi 500 char): ${textContent.slice(0, 500)}${textContent.length > 500 ? "..." : ""}`
        );
        console.log("=".repeat(60));

        return response;
      },
    };
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
