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
        let response: Anthropic.Messages.Message = undefined!;
        const MAX_RETRIES = 6;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            response = await client.messages.create(params);
            break;
          } catch (err: unknown) {
            const isRateLimit =
              err instanceof Error && err.message.includes("rate_limit");
            const status = (err as { status?: number }).status;
            if ((status === 429 || isRateLimit) && attempt < MAX_RETRIES) {
              const waitSec = 60; // sempre 60s - il rate limit e' per minuto
              console.log(
                `[API] ⏳ Rate limit! Attendo ${waitSec}s prima di riprovare (tentativo ${attempt + 1}/${MAX_RETRIES})...`
              );
              await new Promise((r) => setTimeout(r, waitSec * 1000));
              continue;
            }
            throw err;
          }
        }

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        const textContent = response.content
          .filter(
            (b): b is Anthropic.Messages.TextBlock => b.type === "text"
          )
          .map((b) => b.text)
          .join("\n");

        console.log(
          `[API] ← ${agentName.toUpperCase()} | ${elapsed}s | tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out | stop: ${response.stop_reason} | risposta totale: ${textContent.length} chars`
        );
        console.log(
          `[API]   Risposta (primi 8000 char):\n${textContent.slice(0, 8000)}${textContent.length > 8000 ? "\n... [troncato, altri " + (textContent.length - 8000) + " chars]" : ""}`
        );
        console.log("=".repeat(60));

        return response;
      },
    };
  },
};

export const MODEL = "claude-sonnet-4-5-20250929";
export const MODEL_FAST = "claude-haiku-4-5-20251001";

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
