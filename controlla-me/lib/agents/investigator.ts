import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL, parseAgentJSON } from "../anthropic";
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

  const userMessage = `## TIPO DI DOCUMENTO
${classification.documentTypeLabel} (${classification.jurisdiction})

## LEGGI DI RIFERIMENTO
${classification.applicableLaws.map((l) => `- ${l.reference}: ${l.name}`).join("\n")}

## CLAUSOLE PROBLEMATICHE DA INVESTIGARE
${JSON.stringify(problematicClauses, null, 2)}

Per ogni clausola problematica, cerca norme vigenti e sentenze pertinenti. Concentrati sulle clausole con riskLevel "critical" e "high" prima.`;

  // Use an agentic loop to handle tool use for web search
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let finalText = "";
  const MAX_ITERATIONS = 10;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: INVESTIGATOR_SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
        },
      ],
      messages,
    });

    // Collect all text blocks from the response
    const textBlocks = response.content
      .filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text"
      )
      .map((block) => block.text);

    if (textBlocks.length > 0) {
      finalText = textBlocks.join("\n");
    }

    // If the model has stopped (no more tool use), break
    if (response.stop_reason === "end_turn") {
      break;
    }

    // If there are tool use blocks, we need to continue the loop
    // The web_search tool is handled by the API automatically,
    // but we add the assistant response and continue
    const hasToolUse = response.content.some(
      (block) => block.type === "tool_use"
    );

    if (!hasToolUse) {
      break;
    }

    // Add assistant's response to messages
    messages.push({ role: "assistant", content: response.content });

    // Add tool results for each tool use block
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] =
      response.content
        .filter(
          (block): block is Anthropic.Messages.ToolUseBlock =>
            block.type === "tool_use"
        )
        .map((block) => ({
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: "Search completed.",
        }));

    messages.push({ role: "user", content: toolResults });
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
  const MAX_ITERATIONS = 8;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: INVESTIGATOR_SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
        },
      ],
      messages,
    });

    const textBlocks = response.content
      .filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text"
      )
      .map((block) => block.text);

    if (textBlocks.length > 0) {
      finalText = textBlocks.join("\n");
    }

    if (response.stop_reason === "end_turn") break;

    const hasToolUse = response.content.some(
      (block) => block.type === "tool_use"
    );
    if (!hasToolUse) break;

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] =
      response.content
        .filter(
          (block): block is Anthropic.Messages.ToolUseBlock =>
            block.type === "tool_use"
        )
        .map((block) => ({
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: "Search completed.",
        }));

    messages.push({ role: "user", content: toolResults });
  }

  return parseAgentJSON(finalText);
}
