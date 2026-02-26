import { NextRequest } from "next/server";
import { extractText } from "@/lib/extract-text";
import { runLeaderAgent } from "@/lib/agents/leader";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { prepareQuestion } from "@/lib/agents/question-prep";
import { formatArticlesForContext } from "@/lib/agents/corpus-agent";
import { searchArticles } from "@/lib/legal-corpus";
import { searchLegalKnowledge } from "@/lib/vector-store";
import { isVectorDBEnabled } from "@/lib/embeddings";
import { generate } from "@/lib/ai-sdk/generate";
import { parseAgentJSON } from "@/lib/anthropic";
import { CORPUS_AGENT_SYSTEM_PROMPT } from "@/lib/prompts/corpus-agent";
import { sanitizeDocumentText, sanitizeUserQuestion } from "@/lib/middleware/sanitize";
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

      const sendAgent = (phase: ConsoleAgentPhase, status: ConsolePhaseStatus, extra?: Record<string, unknown>) => {
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
        sendAgent("leader", "running");
        const leaderStart = Date.now();

        const decision = await runLeaderAgent({
          message: message || undefined,
          hasFile,
          fileName,
          textLength: documentText.length,
        });

        const leaderMs = Date.now() - leaderStart;
        sendAgent("leader", "done", {
          summary: `${decision.route} — ${decision.reasoning}`,
          timing: leaderMs,
          decision,
        });

        console.log(
          `[CONSOLE] Leader: ${decision.route} | ${decision.reasoning} | ${leaderMs}ms`
        );

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
            send("error", { message: "Testo insufficiente per l'analisi (minimo 50 caratteri)" });
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

          // Run both pipelines in parallel
          const [corpusResult] = await Promise.allSettled([
            question ? runCorpusQA(question, sendAgent, send) : Promise.resolve(null),
            runDocumentAnalysis(text, decision.userContext, sendAgent, send),
          ]);

          if (corpusResult.status === "rejected") {
            console.error("[CONSOLE] Corpus QA failed in hybrid:", corpusResult.reason);
          }
        }

        send("complete", { route: decision.route });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Errore sconosciuto";
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

// ─── Corpus Q&A Pipeline (granular events) ───

async function runCorpusQA(
  question: string,
  sendAgent: (phase: ConsoleAgentPhase, status: ConsolePhaseStatus, extra?: Record<string, unknown>) => void,
  send: (event: string, data: unknown) => void,
) {
  // 1. Question-Prep
  sendAgent("question-prep", "running");
  const prepStart = Date.now();

  const prep = await prepareQuestion(question);

  sendAgent("question-prep", "done", {
    summary: prep.legalQuery.slice(0, 120),
    timing: Date.now() - prepStart,
  });

  // 2. Vector search
  sendAgent("corpus-search", "running");
  const searchStart = Date.now();

  if (!isVectorDBEnabled()) {
    sendAgent("corpus-search", "error", { summary: "Vector DB non disponibile" });
    send("error", { message: "Vector DB non configurato (VOYAGE_API_KEY mancante)" });
    return;
  }

  const [articles, knowledge] = await Promise.all([
    searchArticles(prep.legalQuery, { threshold: 0.40, limit: 8 }),
    searchLegalKnowledge(prep.legalQuery, { threshold: 0.6, limit: 4 }),
  ]);

  sendAgent("corpus-search", "done", {
    summary: `${articles.length} articoli + ${knowledge.length} knowledge`,
    timing: Date.now() - searchStart,
  });

  // 3. Build context + LLM call
  const context = formatArticlesForContext(articles, knowledge);

  if (!context) {
    sendAgent("corpus-agent", "skipped", { summary: "Nessun articolo pertinente trovato" });
    send("result", {
      type: "corpus-qa",
      answer: "Non ho trovato articoli di legge pertinenti alla tua domanda nel corpus legislativo disponibile.",
      citedArticles: [],
      confidence: 0,
    });
    return;
  }

  sendAgent("corpus-agent", "running");
  const llmStart = Date.now();

  const llmPrompt = `CONTESTO NORMATIVO:\n${context}\n\nDOMANDA:\n${question}`;

  const result = await generate("gemini-2.5-flash", llmPrompt, {
    systemPrompt: CORPUS_AGENT_SYSTEM_PROMPT,
    maxTokens: 4096,
    agentName: "CORPUS-AGENT",
  });

  const parsed = parseAgentJSON<{
    answer?: string;
    citedArticles?: Array<{ id: string; reference: string; source: string; relevance: string }>;
    confidence?: number;
    followUpQuestions?: string[];
  }>(result.text);

  sendAgent("corpus-agent", "done", {
    summary: `confidence: ${parsed.confidence ?? "N/A"}`,
    timing: Date.now() - llmStart,
  });

  send("result", {
    type: "corpus-qa",
    answer: parsed.answer ?? "Errore nella generazione della risposta.",
    citedArticles: parsed.citedArticles ?? [],
    confidence: parsed.confidence ?? 0.5,
    followUpQuestions: parsed.followUpQuestions ?? [],
    articlesRetrieved: articles.length,
    provider: result.provider,
  });
}

// ─── Document Analysis Pipeline (wraps orchestrator) ───

async function runDocumentAnalysis(
  documentText: string,
  userContext: string | null | undefined,
  sendAgent: (phase: ConsoleAgentPhase, status: ConsolePhaseStatus, extra?: Record<string, unknown>) => void,
  send: (event: string, data: unknown) => void,
) {
  const phaseTimings: Record<string, number> = {};
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
          const timing = phaseStarts[phase] ? Date.now() - phaseStarts[phase] : undefined;
          if (timing) phaseTimings[phase] = timing;
          sendAgent(consolePhase, "done", { timing });
        }
      },
      onError: (phase: AgentPhase, error: string) => {
        sendAgent(phase as ConsoleAgentPhase, "error", { summary: error });
      },
      onComplete: () => {
        // Complete event sent by caller
      },
    },
    undefined,
    userContext ?? undefined
  );

  send("result", {
    type: "document-analysis",
    classification: result.classification,
    analysis: result.analysis,
    investigation: result.investigation,
    advice: result.advice,
    sessionId: result.sessionId,
    timings: phaseTimings,
  });
}
