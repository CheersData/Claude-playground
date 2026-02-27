import { NextRequest } from "next/server";
import { extractText } from "@/lib/extract-text";
import { runLeaderAgent } from "@/lib/agents/leader";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { prepareQuestion } from "@/lib/agents/question-prep";
import { formatArticlesForContext } from "@/lib/agents/corpus-agent";
import { searchArticles, searchArticlesByInstitute } from "@/lib/legal-corpus";
import { searchLegalKnowledge } from "@/lib/vector-store";
import { mergeArticleResults } from "@/lib/article-merge";
import { isVectorDBEnabled, generateEmbedding } from "@/lib/embeddings";
import { runAgent } from "@/lib/ai-sdk/agent-runner";
import { runDeepSearch } from "@/lib/agents/investigator";
import { CORPUS_AGENT_SYSTEM_PROMPT } from "@/lib/prompts/corpus-agent";
import { sanitizeDocumentText, sanitizeUserQuestion } from "@/lib/middleware/sanitize";
import { MODELS, AGENT_MODELS, type ModelKey } from "@/lib/models";
import type { ConsoleAgentPhase, ConsolePhaseStatus, AgentPhase, PhaseStatus } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller may be closed
        }
      };

      const sendAgent = (
        phase: ConsoleAgentPhase,
        status: ConsolePhaseStatus,
        extra?: Record<string, unknown>
      ) => {
        send("agent", { phase, status, ...extra });
      };

      try {
        // Parse FormData
        const formData = await req.formData();
        const rawMessage = formData.get("message") as string | null;
        const file = formData.get("file") as File | null;

        const message = rawMessage ? sanitizeUserQuestion(rawMessage) : "";
        const hasFile = !!file;
        const fileName = file?.name;

        // Extract text from file if present
        let documentText = "";
        if (file) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const rawText = await extractText(buffer, file.type, file.name);
          documentText = sanitizeDocumentText(rawText);
        }

        // ── LEADER ──
        sendAgent("leader", "running", { modelInfo: getModelInfo("leader") });
        const leaderStart = Date.now();

        const decision = await runLeaderAgent({
          message: message || undefined,
          hasFile,
          fileName,
          textLength: documentText.length,
        });

        const leaderMs = Date.now() - leaderStart;
        sendAgent("leader", "done", {
          summary: `Route: ${decision.route}`,
          timing: leaderMs,
          modelInfo: getModelInfo("leader"),
          output: {
            route: decision.route,
            reasoning: decision.reasoning,
            question: decision.question,
          },
          decision,
        });

        console.log(
          `[CONSOLE] Leader: ${decision.route} | ${decision.reasoning} | ${leaderMs}ms`
        );

        // ── ROUTE: clarification ──
        if (decision.route === "clarification") {
          send("clarification", {
            question: decision.clarificationQuestion ?? "Puoi darmi più dettagli?",
            reasoning: decision.reasoning,
          });
          send("complete", { route: "clarification" });
          return;
        }

        // ── ROUTE: corpus-qa ──
        if (decision.route === "corpus-qa") {
          const question = decision.question || message;

          if (!question) {
            send("error", { message: "Nessuna domanda fornita" });
            return;
          }

          await runCorpusQA(question, sendAgent, send);
        }

        // ── ROUTE: document-analysis ──
        else if (decision.route === "document-analysis") {
          const text = documentText || message;

          if (!text || text.trim().length < 50) {
            send("error", {
              message: "Testo insufficiente per l'analisi (minimo 50 caratteri)",
            });
            return;
          }

          await runDocumentAnalysis(text, decision.userContext, sendAgent, send);
        }

        // ── ROUTE: hybrid ──
        else if (decision.route === "hybrid") {
          const question = decision.question || message;
          const text = documentText || message;

          if (!text || text.trim().length < 50) {
            send("error", { message: "Testo insufficiente per l'analisi" });
            return;
          }

          const [corpusResult] = await Promise.allSettled([
            question
              ? runCorpusQA(question, sendAgent, send)
              : Promise.resolve(null),
            runDocumentAnalysis(text, decision.userContext, sendAgent, send),
          ]);

          if (corpusResult.status === "rejected") {
            console.error(
              "[CONSOLE] Corpus QA failed in hybrid:",
              corpusResult.reason
            );
          }
        }

        send("complete", { route: decision.route });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Errore sconosciuto";
        send("error", { message });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ─── Model Info helper ───

function getModelInfo(agent: string): { displayName: string; tier: "free" | "budget" | "premium" } {
  const agentKey = agent as keyof typeof AGENT_MODELS;
  if (!(agentKey in AGENT_MODELS)) return { displayName: agent, tier: "free" };
  const modelKey = AGENT_MODELS[agentKey].primary;
  const model = MODELS[modelKey];
  if (!model) return { displayName: agent, tier: "free" };
  const tier = getModelTier(modelKey);
  return { displayName: model.displayName, tier };
}

function getModelTier(key: ModelKey): "free" | "budget" | "premium" {
  const m = MODELS[key];
  // Free: Gemini Flash, all Groq, Cerebras, Mistral Small/Ministral, DeepSeek, GPT-4.1 Nano, GPT-5 Nano
  if (m.provider === "groq" || m.provider === "cerebras") return "free";
  if (key === "gemini-2.5-flash") return "free";
  if (key === "mistral-small-3" || key === "ministral-8b" || key === "ministral-3b") return "free";
  if (key === "gpt-4.1-nano" || key === "gpt-5-nano") return "free";
  // Budget: Haiku, Gemini Pro, GPT-4o Mini, GPT-4.1 Mini, Mistral Medium, GPT-5 Mini
  if (key === "claude-haiku-4.5") return "budget";
  if (key === "gemini-2.5-pro") return "budget";
  if (key === "gpt-4o-mini" || key === "gpt-4.1-mini" || key === "gpt-5-mini") return "budget";
  if (key === "mistral-medium-3") return "budget";
  // Premium: everything else (Sonnet, GPT-4o, GPT-4.1, GPT-5, Mistral Large, DeepSeek R1)
  return "premium";
}

// ─── Corpus Q&A Pipeline (granular events + output per agent) ───

async function runCorpusQA(
  question: string,
  sendAgent: (
    phase: ConsoleAgentPhase,
    status: ConsolePhaseStatus,
    extra?: Record<string, unknown>
  ) => void,
  send: (event: string, data: unknown) => void,
) {
  // 1. Question-Prep — identifica istituti giuridici + query legale
  sendAgent("question-prep", "running", { modelInfo: getModelInfo("question-prep") });
  const prepStart = Date.now();

  const prep = await prepareQuestion(question);

  // Auto-enable deep search when question needs case law (giurisprudenza)
  const deep = prep.needsCaseLaw;

  const scopeFlags: string[] = [];
  if (prep.needsProceduralLaw) scopeFlags.push("c.p.c.");
  if (prep.needsCaseLaw) scopeFlags.push("giurisprudenza");

  sendAgent("question-prep", "done", {
    summary: prep.targetArticles
      ? `Target: ${prep.targetArticles}`
      : prep.questionType === "systematic"
        ? "Domanda sistematica (tassonomia)"
        : prep.mechanismQuery
          ? "Domanda riformulata (2 assi)"
          : "Domanda riformulata",
    timing: Date.now() - prepStart,
    modelInfo: getModelInfo("question-prep"),
    output: {
      originalQuestion: question,
      legalQuery: prep.legalQuery,
      mechanismQuery: prep.mechanismQuery,
      suggestedInstitutes: prep.suggestedInstitutes,
      targetArticles: prep.targetArticles,
      questionType: prep.questionType,
      needsProceduralLaw: prep.needsProceduralLaw,
      needsCaseLaw: prep.needsCaseLaw,
      scopeNotes: prep.scopeNotes,
      keywords: prep.keywords,
    },
  });

  // 2. Corpus search — institute lookup + semantic search combinati
  sendAgent("corpus-search", "running", { modelInfo: { displayName: "pgvector", tier: "free" as const } });
  const searchStart = Date.now();

  if (!isVectorDBEnabled()) {
    sendAgent("corpus-search", "error", {
      summary: "Vector DB non disponibile",
    });
    send("error", {
      message: "Vector DB non configurato (VOYAGE_API_KEY mancante)",
    });
    return;
  }

  // Normalizza istituti: il modello può restituire "vendita a corpo" invece di "vendita_a_corpo"
  const normalizedInstitutes = prep.suggestedInstitutes.map((inst) =>
    inst.trim().replace(/\s+/g, "_").toLowerCase()
  );

  // Genera embedding della query una sola volta — usato per ranking vettoriale per istituto
  const queryEmbedding = await generateEmbedding(prep.legalQuery, "query");

  // Ricerca parallela: istituti ranked + semantic primary + mechanism + knowledge
  const perInstituteLimit = prep.questionType === "systematic" ? 35 : 30;
  const institutePromises = queryEmbedding
    ? normalizedInstitutes.map((inst) =>
        searchArticlesByInstitute(inst, queryEmbedding, perInstituteLimit)
      )
    : [];

  const searchPromises = [
    searchArticles(prep.legalQuery, {
      threshold: 0.4,
      limit: 8,
      institutes: normalizedInstitutes.length > 0
        ? normalizedInstitutes
        : undefined,
    }),
    prep.mechanismQuery
      ? searchArticles(prep.mechanismQuery, { threshold: 0.4, limit: 6 })
      : Promise.resolve([]),
  ] as const;

  const [primaryResults, mechanismResults, knowledge, ...instituteResults] = await Promise.all([
    ...searchPromises,
    searchLegalKnowledge(prep.legalQuery, { threshold: 0.6, limit: 4 }),
    ...institutePromises,
  ]);

  // Merge: cap per batch + query-relevance boost + global sort
  const { articles, instituteCount } = mergeArticleResults({
    instituteBatches: instituteResults,
    instituteNames: normalizedInstitutes,
    legalQuery: prep.legalQuery,
    semanticPrimary: primaryResults,
    semanticMechanism: mechanismResults,
    questionType: prep.questionType,
  });
  const mechanismCount = mechanismResults.length;

  sendAgent("corpus-search", "done", {
    summary: `${articles.length} articoli (${instituteCount} istituto, ${primaryResults.length} tema${mechanismCount > 0 ? `, ${mechanismCount} meccanismo` : ""})`,
    timing: Date.now() - searchStart,
    modelInfo: { displayName: "pgvector", tier: "free" as const },
    output: {
      articles: articles.map((a) => ({
        reference: a.articleReference,
        source: a.lawSource,
        title: a.articleTitle,
        similarity: `${(a.similarity * 100).toFixed(0)}%`,
      })),
      institutes: normalizedInstitutes,
      mechanismQuery: prep.mechanismQuery,
      knowledgeEntries: knowledge.length,
    },
  });

  // 3. Build context + optional deep search
  const context = formatArticlesForContext(articles, knowledge);

  if (!context) {
    sendAgent("corpus-agent", "skipped", {
      summary: "Nessun articolo pertinente trovato",
      output: { reason: "Nessun articolo con similarità sufficiente" },
    });
    return;
  }

  // 3.5 Deep Search (optional) — Investigator with web_search for case law
  let investigatorContext = "";
  if (deep && articles.length > 0) {
    try {
      sendAgent("investigator", "running", { modelInfo: getModelInfo("investigator") });
      const invStart = Date.now();

      const clauseContext = articles
        .slice(0, 5)
        .map((a) => `${a.articleReference} (${a.lawSource}): ${a.articleTitle}`)
        .join("\n");

      const deepResult = await runDeepSearch(clauseContext, "", question);

      sendAgent("investigator", "done", {
        summary: `${deepResult.sources?.length ?? 0} fonti trovate`,
        timing: Date.now() - invStart,
        modelInfo: getModelInfo("investigator"),
        output: {
          response: deepResult.response,
          sources: deepResult.sources ?? [],
        },
      });

      if (deepResult.response) {
        investigatorContext = `\n\nGIURISPRUDENZA E APPROFONDIMENTI:\n${deepResult.response}`;
        if (deepResult.sources?.length) {
          investigatorContext += `\n\nFONTI WEB:\n${deepResult.sources.map((s) => `- ${s.title}: ${s.excerpt}`).join("\n")}`;
        }
      }
    } catch (err) {
      console.error("[CONSOLE] Investigator failed:", err);
      sendAgent("investigator", "error", {
        summary: err instanceof Error ? err.message : "Errore investigator",
        modelInfo: getModelInfo("investigator"),
      });
      // Non fatale: continua senza giurisprudenza
    }
  }

  sendAgent("corpus-agent", "running", { modelInfo: getModelInfo("corpus-agent") });
  const llmStart = Date.now();

  const typeHint = prep.questionType === "systematic"
    ? "\n\nTIPO DOMANDA: sistematica — struttura la risposta come tassonomia di casi (vedi istruzioni DOMANDE SISTEMATICHE)."
    : "";

  // Build scope limitation hints
  const scopeHints: string[] = [];
  if (prep.needsProceduralLaw) {
    scopeHints.push("ATTENZIONE: La domanda richiede norme processuali (c.p.c.) NON presenti nel corpus. Segnala esplicitamente questa limitazione.");
  }
  if (prep.needsCaseLaw && !investigatorContext) {
    scopeHints.push("ATTENZIONE: La domanda richiede giurisprudenza NON disponibile. Segnala la limitazione e indica in missingArticles le fonti giurisprudenziali necessarie.");
  }
  if (prep.scopeNotes) {
    scopeHints.push(`NOTA AMBITO: ${prep.scopeNotes}`);
  }
  const scopeBlock = scopeHints.length > 0
    ? `\n\n${scopeHints.join("\n")}`
    : "";

  const llmPrompt = `CONTESTO NORMATIVO:\n${context}${investigatorContext}${typeHint}${scopeBlock}\n\nDOMANDA:\n${question}`;

  // Usa runAgent con fallback automatico (fix JSON parse)
  const { parsed, provider } = await runAgent<{
    answer?: string;
    citedArticles?: Array<{
      id: string;
      reference: string;
      source: string;
      relevance: string;
    }>;
    missingArticles?: string[];
    confidence?: number;
    followUpQuestions?: string[];
  }>("corpus-agent", llmPrompt, {
    systemPrompt: CORPUS_AGENT_SYSTEM_PROMPT,
  });

  const answer = parsed.answer ?? "Errore nella generazione della risposta.";
  const citedArticles = parsed.citedArticles ?? [];
  const missingArticles = parsed.missingArticles ?? [];
  const confidence = parsed.confidence ?? 0.5;

  sendAgent("corpus-agent", "done", {
    summary: `Confidence: ${(confidence * 100).toFixed(0)}%${missingArticles.length > 0 ? ` | ${missingArticles.length} art. mancanti` : ""}`,
    timing: Date.now() - llmStart,
    modelInfo: getModelInfo("corpus-agent"),
    output: {
      answer,
      citedArticles,
      missingArticles,
      confidence,
      followUpQuestions: parsed.followUpQuestions ?? [],
      provider,
      hasDeepSearch: deep && investigatorContext.length > 0,
    },
  });
}

// ─── Document Analysis Pipeline (wraps orchestrator + sends output) ───

async function runDocumentAnalysis(
  documentText: string,
  userContext: string | null | undefined,
  sendAgent: (
    phase: ConsoleAgentPhase,
    status: ConsolePhaseStatus,
    extra?: Record<string, unknown>
  ) => void,
  send: (event: string, data: unknown) => void
) {
  const phaseStarts: Record<string, number> = {};

  const result = await runOrchestrator(
    documentText,
    {
      onProgress: (phase: AgentPhase, status: PhaseStatus, data?: unknown) => {
        const consolePhase = phase as ConsoleAgentPhase;
        if (status === "running") {
          phaseStarts[phase] = Date.now();
          sendAgent(consolePhase, "running");
        } else if (status === "done") {
          const timing = phaseStarts[phase]
            ? Date.now() - phaseStarts[phase]
            : undefined;
          // Send the actual output data for each phase
          sendAgent(consolePhase, "done", {
            timing,
            output: data ?? null,
          });
        }
      },
      onError: (phase: AgentPhase, error: string) => {
        sendAgent(phase as ConsoleAgentPhase, "error", { summary: error });
      },
      onComplete: () => {
        // noop
      },
    },
    undefined,
    userContext ?? undefined
  );

  // Final result event
  send("result", {
    type: "document-analysis",
    advice: result.advice,
    sessionId: result.sessionId,
  });
}
