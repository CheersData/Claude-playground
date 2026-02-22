import { anthropic, MODEL, MODEL_FAST, parseAgentJSON } from "../anthropic";
import { INVESTIGATOR_SYSTEM_PROMPT } from "../prompts/investigator";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
} from "../types";

export async function runInvestigator(
  classification: ClassificationResult,
  analysis: AnalysisResult
): Promise<InvestigationResult> {
  // Filter only problematic clauses (medium risk or higher)
  const problematicClauses = analysis.clauses.filter((c) =>
    ["critical", "high", "medium"].includes(c.riskLevel)
  );

  if (problematicClauses.length === 0) {
    return { findings: [] };
  }

  const userMessage = `Documento: ${classification.documentTypeLabel} (${classification.jurisdiction})
Leggi: ${classification.applicableLaws.map((l) => l.reference).join(", ")}

Clausole da investigare: ${JSON.stringify(problematicClauses)}

Cerca norme e sentenze. Priorità: critical e high prima.`;

  // web_search_20250305 is a server-side tool: the API executes searches
  // internally within a single call and injects results automatically.
  // No client-side agentic loop is needed. We only loop to handle
  // max_tokens truncation (continuation of a cut-off response).
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let finalText = "";
  const MAX_CONTINUATIONS = 3;

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 16000,
      system: INVESTIGATOR_SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
        },
      ],
      messages,
    });

    // Collect text blocks from the response
    const textContent = response.content
      .filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text"
      )
      .map((block) => block.text)
      .join("\n");

    if (textContent) {
      finalText += (finalText ? "\n" : "") + textContent;
    }

    // Model finished naturally — done
    if (response.stop_reason === "end_turn") {
      break;
    }

    // Output was truncated — continue with text-only context to avoid
    // tool_use ID uniqueness conflicts from server-side tool blocks
    // (server_tool_use / web_search_tool_result contain IDs that would
    // collide if sent back and the server generates new ones).
    if (response.stop_reason === "max_tokens" && textContent) {
      messages.push({ role: "assistant", content: textContent });
      messages.push({
        role: "user",
        content: "Continua esattamente dal punto in cui ti sei fermato. Completa il JSON.",
      });
      continue;
    }

    // Any other stop_reason (tool_use from hallucinated tool, etc.) — stop
    break;
  }

  return parseAgentJSON<InvestigationResult>(finalText);
}

/**
 * Run investigator for a specific deep search question.
 */
export async function runDeepSearch(
  clauseContext: string,
  existingAnalysis: string,
  userQuestion: string
): Promise<{ response: string; sources: Array<{ url: string; title: string; excerpt: string }> }> {
  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: `## CONTESTO CLAUSOLA
${clauseContext}

## ANALISI GIÀ EFFETTUATA
${existingAnalysis}

## DOMANDA DELL'UTENTE
${userQuestion}

Cerca norme e sentenze specifiche per rispondere alla domanda dell'utente. Rispondi con un JSON:
{
  "response": "La tua risposta dettagliata in italiano semplice",
  "sources": [{ "url": "...", "title": "...", "excerpt": "..." }]
}`,
    },
  ];

  let finalText = "";
  const MAX_CONTINUATIONS = 3;

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: INVESTIGATOR_SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
        },
      ],
      messages,
    });

    const textContent = response.content
      .filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text"
      )
      .map((block) => block.text)
      .join("\n");

    if (textContent) {
      finalText += (finalText ? "\n" : "") + textContent;
    }

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "max_tokens" && textContent) {
      messages.push({ role: "assistant", content: textContent });
      messages.push({
        role: "user",
        content: "Continua esattamente dal punto in cui ti sei fermato. Completa il JSON.",
      });
      continue;
    }

    break;
  }

  return parseAgentJSON(finalText);
}
