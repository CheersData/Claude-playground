import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL, parseAgentJSON } from "../anthropic";
import { INVESTIGATOR_SYSTEM_PROMPT } from "../prompts/investigator";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
} from "../types";

/**
 * Investigator aggressivo: copre TUTTE le clausole critical e high.
 * Usa Sonnet (non Haiku) per query di ricerca più precise.
 *
 * @param legalContext - Contesto normativo dal corpus legislativo (opzionale).
 * @param ragContext - Contesto da analisi precedenti nella knowledge base (opzionale).
 */
export async function runInvestigator(
  classification: ClassificationResult,
  analysis: AnalysisResult,
  legalContext?: string,
  ragContext?: string
): Promise<InvestigationResult> {
  // ALL critical and high clauses are MANDATORY, medium if possible
  const criticalAndHigh = analysis.clauses.filter((c) =>
    ["critical", "high"].includes(c.riskLevel)
  );
  const medium = analysis.clauses.filter((c) => c.riskLevel === "medium");

  if (criticalAndHigh.length === 0 && medium.length === 0) {
    return { findings: [] };
  }

  // Build enriched user message
  const userMessageParts = [
    `Documento: ${classification.documentTypeLabel} (${classification.jurisdiction})`,
    classification.documentSubType
      ? `Sotto-tipo: ${classification.documentSubType}`
      : null,
    classification.relevantInstitutes?.length
      ? `Istituti giuridici: ${classification.relevantInstitutes.join(", ")}`
      : null,
    `Leggi applicabili: ${classification.applicableLaws.map((l) => l.reference).join(", ")}`,
    legalContext ? `\n${legalContext}` : null,
    ragContext ? `\n${ragContext}` : null,
    `\nClausole CRITICAL e HIGH (obbligatorio coprire TUTTE): ${JSON.stringify(criticalAndHigh)}`,
    medium.length > 0
      ? `\nClausole MEDIUM (coprire se possibile): ${JSON.stringify(medium)}`
      : null,
    `\nCerca norme e sentenze per OGNI clausola critical e high. Non saltarne nessuna.`,
  ];

  const userMessage = userMessageParts.filter(Boolean).join("\n");

  // Agentic loop with web search — upgraded to Sonnet for better quality
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let finalText = "";
  const MAX_ITERATIONS = 8; // Increased from 5 to cover all clauses

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL, // Upgraded from MODEL_FAST to MODEL (Sonnet) for better query quality
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

    const textBlocks = response.content
      .filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text"
      )
      .map((block) => block.text);

    if (textBlocks.length > 0) {
      finalText = textBlocks.join("\n");
    }

    if (response.stop_reason === "end_turn") {
      break;
    }

    const hasToolUse = response.content.some(
      (block) => block.type === "tool_use"
    );

    if (!hasToolUse) {
      break;
    }

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
