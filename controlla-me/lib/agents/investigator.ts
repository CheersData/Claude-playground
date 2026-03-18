import Anthropic from "@anthropic-ai/sdk";
import { anthropic, parseAgentJSON } from "../anthropic";
import { AGENT_MODELS, MODELS } from "../models";
import { INVESTIGATOR_SYSTEM_PROMPT } from "../prompts/investigator";
import { searchLegalKnowledge } from "../vector-store";
import { searchArticles } from "../legal-corpus";
import { isVectorDBEnabled } from "../embeddings";
import { logAgentCost } from "../company/cost-logger";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
} from "../types";

// Read model from centralized config instead of hardcoded constant
// ARCH-refactor: salviamo anche la ModelKey per il cost tracking (parity con agent-runner)
const INVESTIGATOR_MODEL_KEY = AGENT_MODELS["investigator"].primary;
const INVESTIGATOR_MODEL = MODELS[INVESTIGATOR_MODEL_KEY].model;

// ─── Self-Retrieval ───

/**
 * Recupera contesto RAG per clausola specifica dal vector DB.
 * Combina: knowledge base (analisi passate) + corpus legislativo.
 * Limitato a 3 clausole x 3 risultati ciascuna per evitare token bloat.
 */
async function selfRetrieveForClauses(
  clauses: Array<{ title: string; issue: string; originalText?: string | null }>,
  maxClauses = 3,
  maxResultsPerClause = 3
): Promise<string> {
  if (!isVectorDBEnabled()) return "";

  const topClauses = clauses.slice(0, maxClauses);
  const sections: string[] = [];

  await Promise.all(
    topClauses.map(async (clause) => {
      const query = `${clause.title}: ${clause.originalText?.slice(0, 150) ?? clause.issue}`;

      const [knowledgeResults, articleResults] = await Promise.all([
        searchLegalKnowledge(query, {
          limit: maxResultsPerClause,
          threshold: 0.50,
        }).catch((err) => { console.error("[Investigator] searchLegalKnowledge failed:", err); return []; }),
        searchArticles(query, {
          threshold: 0.45,
          limit: maxResultsPerClause,
        }).catch((err) => { console.error("[Investigator] searchArticles failed:", err); return []; }),
      ]);

      const parts: string[] = [];

      if (knowledgeResults?.length > 0) {
        parts.push(
          knowledgeResults
            .map(
              (r) =>
                `[${r.category?.toUpperCase()}] ${r.title} (${(r.similarity * 100).toFixed(0)}%, visto ${r.timesSeen ?? 1}x)\n${r.content.slice(0, 300)}`
            )
            .join("\n")
        );
      }

      if (articleResults?.length > 0) {
        parts.push(
          articleResults
            .map(
              (a) =>
                `[CORPUS] ${a.lawSource} ${a.articleReference}${a.articleTitle ? ` — ${a.articleTitle}` : ""}\n${a.articleText.slice(0, 300)}`
            )
            .join("\n")
        );
      }

      if (parts.length > 0) {
        sections.push(`── Clausola: ${clause.title} ──\n${parts.join("\n")}`);
      }
    })
  );

  if (sections.length === 0) return "";

  const result = `\n╔══════════════════════════════════════════════╗
║  SELF-RETRIEVAL: norme e pattern per clausola ║
╚══════════════════════════════════════════════╝\n${sections.join("\n\n")}\n╔══════════════════════════════════════════════╗
║  FINE SELF-RETRIEVAL                         ║
╚══════════════════════════════════════════════╝\n`;

  console.log(
    `[INVESTIGATOR] Self-retrieval: ${topClauses.length} clausole | ${sections.length} sezioni | ${result.length} chars`
  );

  return result;
}

/**
 * Investigator aggressivo: copre TUTTE le clausole critical e high.
 * Usa web_search Anthropic — richiede Claude, non migra a runAgent().
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
  // Guard: analysis or analysis.clauses may be undefined/null when the analyzer
  // returns malformed JSON or is disabled — gracefully return empty findings.
  const clauses = Array.isArray(analysis?.clauses) ? analysis.clauses : [];
  const criticalAndHigh = clauses.filter((c) =>
    ["critical", "high"].includes(c.riskLevel)
  );
  const medium = clauses.filter((c) => c.riskLevel === "medium");

  if (criticalAndHigh.length === 0 && medium.length === 0) {
    return { findings: [] };
  }

  // P2: Self-retrieval — Investigator queries vector DB autonomously for each critical/high clause
  // This supplements the legalContext/ragContext from the orchestrator with per-clause precision.
  let selfRAGContext = "";
  try {
    selfRAGContext = await selfRetrieveForClauses(criticalAndHigh);
  } catch (err) {
    // Non-fatal: self-retrieval failure doesn't block the investigator
    console.error(
      `[INVESTIGATOR] Errore self-retrieval: ${err instanceof Error ? err.message : "Unknown"}`
    );
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
    `Leggi applicabili: ${(classification.applicableLaws ?? []).map((l) => l.reference).join(", ")}`,
    legalContext ? `\n${legalContext}` : null,
    ragContext ? `\n${ragContext}` : null,
    selfRAGContext ? `\n${selfRAGContext}` : null,
    `\nClausole CRITICAL e HIGH (obbligatorio coprire TUTTE): ${JSON.stringify(criticalAndHigh)}`,
    medium.length > 0
      ? `\nClausole MEDIUM (coprire se possibile): ${JSON.stringify(medium)}`
      : null,
    `\nCerca norme e sentenze per OGNI clausola critical e high. Non saltarne nessuna.`,
  ];

  const userMessage = userMessageParts.filter(Boolean).join("\n");

  // Agentic loop with web search
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let finalText = "";
  const MAX_ITERATIONS = 5; // CLAUDE.md: max 5 tool_use loop
  // ARCH-refactor: cumulative token tracking per cost parity con agent-runner
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const t0 = Date.now();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: INVESTIGATOR_MODEL,
      max_tokens: AGENT_MODELS["investigator"].maxTokens,
      system: INVESTIGATOR_SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
        },
      ],
      messages,
    });

    // Accumula token per cost tracking
    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Guard: response.content may be undefined in edge cases (malformed API response)
    const contentBlocks = response.content ?? [];

    const textBlocks = contentBlocks
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

    const hasToolUse = contentBlocks.some(
      (block) => block.type === "tool_use"
    );

    if (!hasToolUse) {
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] =
      contentBlocks
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

  // ARCH-refactor: fire-and-forget cost log (parity con runAgent in agent-runner.ts)
  logAgentCost({
    agentName: "investigator",
    modelKey: INVESTIGATOR_MODEL_KEY,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    durationMs: Date.now() - t0,
    usedFallback: false,
  }).catch((err) => { console.error("[Investigator] pipeline complete callback failed:", err); });

  return parseAgentJSON<InvestigationResult>(finalText);
}

/**
 * Run investigator for a specific deep search question.
 *
 * @param conversationHistory - Previous messages in the conversation (optional).
 *   When provided, the LLM receives the full conversation context so it can
 *   answer follow-up questions without the user repeating themselves.
 */
export async function runDeepSearch(
  clauseContext: string,
  existingAnalysis: string,
  userQuestion: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<{ response: string; sources: Array<{ url: string; title: string; excerpt: string }> }> {
  // Build conversation-aware prompt
  let historyBlock = "";
  if (conversationHistory && conversationHistory.length > 0) {
    const formatted = conversationHistory
      .map((m) => `[${m.role === "user" ? "UTENTE" : "ASSISTENTE"}]: ${m.content}`)
      .join("\n\n");
    historyBlock = `\n## CONVERSAZIONE PRECEDENTE\n${formatted}\n`;
  }

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: `## CONTESTO CLAUSOLA
${clauseContext}

## ANALISI GIÀ EFFETTUATA
${existingAnalysis}
${historyBlock}
## DOMANDA DELL'UTENTE
${userQuestion}

Cerca norme e sentenze specifiche per rispondere alla domanda dell'utente.${conversationHistory?.length ? " Tieni conto della conversazione precedente per dare risposte coerenti e non ripetitive." : ""} Rispondi con un JSON:
{
  "response": "La tua risposta dettagliata in italiano semplice",
  "sources": [{ "url": "...", "title": "...", "excerpt": "..." }]
}`,
    },
  ];

  let finalText = "";
  const MAX_ITERATIONS = 5; // CLAUDE.md: max 5 tool_use loop

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: INVESTIGATOR_MODEL,
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

    // Guard: response.content may be undefined in edge cases (malformed API response)
    const deepContentBlocks = response.content ?? [];

    const textBlocks = deepContentBlocks
      .filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text"
      )
      .map((block) => block.text);

    if (textBlocks.length > 0) {
      finalText = textBlocks.join("\n");
    }

    if (response.stop_reason === "end_turn") break;

    const hasToolUse = deepContentBlocks.some(
      (block) => block.type === "tool_use"
    );
    if (!hasToolUse) break;

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] =
      deepContentBlocks
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
