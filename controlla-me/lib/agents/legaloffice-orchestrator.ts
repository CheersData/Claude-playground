/**
 * Orchestratore Q&A del Legal Office.
 *
 * Logica pura (no Next.js) — chiamata dalla API route /api/legaloffice/orchestrator.
 * Segue il pattern di /lib/agents/orchestrator.ts per la pipeline documento.
 *
 * Flusso:
 *  1. Leader decide route e agenti da attivare
 *  2. Ogni agente viene eseguito in sequenza con callback onAgentStart/onAgentDone
 *  3. Leader compone la risposta finale (usa output advisor o investigator direttamente)
 */

import {
  runLegalOfficeRouter,
  runQAClassifier,
  runQAAnalyzer,
  runQAInvestigator,
  runQAAdvisor,
  type LegalOfficeLeaderDecision,
  type QAClassificationResult,
  type QAAnalysisResult,
  type QAAdvisorResult,
  type QAInvestigatorResult,
} from "./legaloffice-qa-agents";
import { askCorpusAgent } from "./corpus-agent";
import { retrieveLegalContext, formatLegalContextForPrompt } from "@/lib/legal-corpus";
import { buildRAGContext } from "@/lib/vector-store";
import { isVectorDBEnabled } from "@/lib/embeddings";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  message: string;
  phaseResults: Record<string, unknown>;
  tier?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface OrchestratorCallbacks {
  onAgentStart: (phase: string, modelInfo?: Record<string, unknown>) => void;
  onAgentDone: (
    phase: string,
    output: unknown,
    summary?: string,
    timing?: number
  ) => void;
  onError: (phase: string, error: string) => void;
  onComplete: (
    leaderAnswer: string,
    agentOutputs: Record<string, unknown>,
    decision: LegalOfficeLeaderDecision
  ) => void;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runLegalOfficeOrchestrator(
  input: OrchestratorInput,
  callbacks: OrchestratorCallbacks
): Promise<void> {
  const { message, phaseResults, conversationHistory = [] } = input;
  const hasDocumentContext = Object.keys(phaseResults).length > 0;
  const agentOutputs: Record<string, unknown> = {};

  // ── Step 1: Leader routing ──────────────────────────────────────────────────

  callbacks.onAgentStart("leader");
  const t0 = Date.now();

  let decision: LegalOfficeLeaderDecision;

  try {
    decision = await runLegalOfficeRouter(message, hasDocumentContext, phaseResults, conversationHistory);
  } catch {
    // Fallback routing se il leader non risponde
    decision = {
      route: "qa-standard",
      agents: ["investigator", "advisor"],
      question: message,
      reasoning: "Fallback routing (leader non disponibile)",
    };
  }

  callbacks.onAgentDone(
    "leader",
    { route: decision.route, agents: decision.agents, reasoning: decision.reasoning },
    `Route: ${decision.route}`,
    Date.now() - t0
  );

  // Clarification — il leader chiede più info, non attiva agenti
  if (decision.route === "clarification" && decision.clarificationQuestion) {
    callbacks.onComplete(decision.clarificationQuestion, {}, decision);
    return;
  }

  // ── Step 1.5: Corpus Agent — path primario per TUTTE le Q&A ────────────────
  // Usa la stessa pipeline del corpus-agent della homepage "I miei dubbi":
  //   question-prep → RAG (8 articoli + 4 knowledge) → corpus-agent (prompt 170 righe)
  // Produce risposte drammaticamente migliori rispetto al pipeline multi-agente:
  // - Question-prep converte colloquiale → legale per miglior RAG recall
  // - Prompt corpus-agent ha anti-allucinazione, citazioni verificate, "In pratica" obbligatorio
  // - 1 sola chiamata LLM anziché 4-5 → più veloce e più coerente
  //
  // COPRE TUTTE LE ROUTE tranne clarification: qa-simple, qa-standard, qa-full,
  // document-followup. Anche con un documento già analizzato, le domande passano
  // dal corpus agent per avere articoli citati e risposte verificate.
  //
  // Se fallisce (vector DB non disponibile, ecc.), cade nel pipeline multi-agente standard.

  if (decision.route !== "clarification") {
    // IMPORTANTE: passare sempre la domanda ORIGINALE dell'utente al corpus agent.
    // Il Leader Router riformula in "linguaggio giuridico" (decision.question), ma
    // askCorpusAgent() ha già il suo question-prep che converte colloquiale → legale.
    // Passare decision.question causava DOPPIA riformulazione → query degradata → risposte sbagliate.
    const question = message;

    try {
      const tCorpus = Date.now();
      let lastStepTime = tCorpus;

      const corpusResult = await askCorpusAgent(question, {
        onProgress: {
          onStepStart: (step) => {
            const phaseMap: Record<string, string> = {
              "question-prep": "comprensione",
              "retrieval": "corpus-search",
              "analysis": "advisor",
            };
            callbacks.onAgentStart(phaseMap[step]);
          },
          onStepDone: (step, data) => {
            const now = Date.now();
            const timing = now - lastStepTime;
            lastStepTime = now;

            if (step === "question-prep") {
              const query = (data.legalQuery as string) || "";
              callbacks.onAgentDone(
                "comprensione",
                data,
                query.length > 60 ? query.slice(0, 57) + "…" : query || "Preparazione completata",
                timing
              );
            } else if (step === "retrieval") {
              const arts = (data.articlesFound as number) || 0;
              const know = (data.knowledgeFound as number) || 0;
              callbacks.onAgentDone(
                "corpus-search",
                data,
                `${arts} articoli · ${know} fonti giuridiche`,
                timing
              );
            }
          },
        },
      });

      // Map corpus-agent result → advisor output per la sidebar (consulente = step finale)
      const advisorOutput = {
        answer: corpusResult.answer,
        confidence: corpusResult.confidence,
        citedArticles: corpusResult.citedArticles,
        articlesRetrieved: corpusResult.articlesRetrieved,
        needsLawyer: false,
      };

      agentOutputs.advisor = advisorOutput;

      // Includi dati corpus strutturati per UI rich rendering
      agentOutputs.corpusResult = {
        citedArticles: corpusResult.citedArticles,
        confidence: corpusResult.confidence,
        followUpQuestions: corpusResult.followUpQuestions,
        articlesRetrieved: corpusResult.articlesRetrieved,
        missingArticles: [],
      };

      callbacks.onAgentDone(
        "advisor",
        advisorOutput,
        `${corpusResult.articlesRetrieved} articoli · conf. ${(corpusResult.confidence * 100).toFixed(0)}%`,
        Date.now() - lastStepTime
      );

      // Leader answer = testo corpus (follow-up gestite dalla UI)
      const leaderAnswer = corpusResult.answer;

      callbacks.onComplete(leaderAnswer, agentOutputs, decision);
      return;
    } catch (err) {
      // Corpus-agent non disponibile → fallback al pipeline multi-agente standard
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        "[LEGALOFFICE-QA] ⚠️ CORPUS-AGENT FALLITO — fallback multi-agente:",
        errMsg
      );
      // Notifica il client che il corpus agent ha fallito (visibilità per debug)
      callbacks.onError("corpus-agent", `Corpus agent non disponibile: ${errMsg}. Uso pipeline standard.`);
    }
  }

  // ── Step 2: Agenti in sequenza (pipeline multi-agente standard) ───────────

  const question = decision.question?.trim() || message;
  let classifierOutput: QAClassificationResult | null = null;
  let analyzerOutput: QAAnalysisResult | null = null;
  let legalContext = "";
  let ragContext = "";

  for (const agentId of decision.agents) {
    const tAgent = Date.now();
    callbacks.onAgentStart(agentId);

    try {
      switch (agentId) {
        case "classifier": {
          classifierOutput = await runQAClassifier(question);
          agentOutputs.classifier = classifierOutput;
          callbacks.onAgentDone(
            "classifier",
            classifierOutput,
            classifierOutput.questionTypeLabel || classifierOutput.questionType,
            Date.now() - tAgent
          );

          // ── RAG retrieval dopo il Classificatore ────────────────────────────
          // Stessa logica del pipeline documento (orchestrator.ts step 1.5).
          // Non bloccante: se il corpus non è disponibile, continua senza contesto.
          try {
            // Costruisce clauseTexts arricchito con gli istituti in linguaggio naturale
            // (equivalente a question-prep del corpus chat — converte snake_case in leggibile
            // per migliorare la ricerca semantica: "vendita_a_corpo" → "vendita a corpo")
            const institutesAsText = (classifierOutput.relevantInstitutes || [])
              .map((i: string) => i.replace(/_/g, " "))
              .join(", ");
            const enrichedClauseTexts = [
              question,
              ...(institutesAsText ? [institutesAsText] : []),
            ];

            const corpusResult = await retrieveLegalContext({
              applicableLaws: classifierOutput.applicableLaws || [],
              relevantInstitutes: classifierOutput.relevantInstitutes || [],
              clauseTexts: enrichedClauseTexts,
              maxArticles: 10,
            });
            legalContext = formatLegalContextForPrompt(corpusResult, 5000);
            if (legalContext) {
              console.log(`[LEGALOFFICE-QA] Corpus: ${legalContext.length} chars`);
            }
            if (isVectorDBEnabled()) {
              const ragQuery = [
                classifierOutput.questionTypeLabel,
                ...(classifierOutput.relevantInstitutes || []),
              ].filter(Boolean).join(" ");
              ragContext = await buildRAGContext(ragQuery, {
                maxChars: 1500,
                categories: ["law_reference", "clause_pattern"],
              });
            }
          } catch (ragErr) {
            console.error("[LEGALOFFICE-QA] Corpus retrieval non disponibile:", ragErr instanceof Error ? ragErr.message : ragErr);
          }
          break;
        }

        case "analyzer": {
          analyzerOutput = await runQAAnalyzer(question, classifierOutput);
          agentOutputs.analyzer = analyzerOutput;
          callbacks.onAgentDone(
            "analyzer",
            analyzerOutput,
            `Rischio ${analyzerOutput.riskAssessment}`,
            Date.now() - tAgent
          );
          break;
        }

        case "investigator": {
          const invResult: QAInvestigatorResult = await runQAInvestigator(
            question,
            classifierOutput,
            analyzerOutput,
            conversationHistory,
            legalContext || undefined,
            ragContext || undefined
          );
          agentOutputs.investigator = invResult;
          const sourcesCount = (invResult.sources || []).length;
          callbacks.onAgentDone(
            "investigator",
            invResult,
            sourcesCount > 0
              ? `${sourcesCount} riferiment${sourcesCount !== 1 ? "i" : "o"} normativ${sourcesCount !== 1 ? "i" : "o"}`
              : "Analisi normativa completata",
            Date.now() - tAgent
          );
          break;
        }

        case "advisor": {
          const advisorResult: QAAdvisorResult = await runQAAdvisor(
            question,
            agentOutputs
          );
          agentOutputs.advisor = advisorResult;
          callbacks.onAgentDone(
            "advisor",
            advisorResult,
            advisorResult.needsLawyer ? "Consiglio avvocato" : "Parere disponibile",
            Date.now() - tAgent
          );
          break;
        }
      }
    } catch (err) {
      // Non-fatal: logga l'errore e continua con il prossimo agente
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[LEGALOFFICE-ORCHESTRATOR] Agente ${agentId} fallito:`, errMsg);
      callbacks.onError(agentId, errMsg);
    }
  }

  // ── Step 3: Risposta finale del Leader ─────────────────────────────────────
  // Usa direttamente l'output del consulente se disponibile (zero LLM call extra).
  // Fallback su investigatore, poi su messaggio generico.

  let leaderAnswer = "";

  const advisorOut = agentOutputs.advisor as QAAdvisorResult | undefined;
  const investigatorOut = agentOutputs.investigator as QAInvestigatorResult | undefined;

  if (advisorOut?.answer) {
    leaderAnswer = advisorOut.answer;

    if (advisorOut.actionPoints?.length > 0) {
      const actions = advisorOut.actionPoints
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 3)
        .map(ap => `• ${ap.action}`)
        .join("\n");
      leaderAnswer += `\n\n${actions}`;
    }

    if (advisorOut.needsLawyer && advisorOut.lawyerReason) {
      leaderAnswer += `\n\n⚠️ ${advisorOut.lawyerReason}`;
    }
  } else if (investigatorOut?.response) {
    leaderAnswer = investigatorOut.response;
  } else {
    leaderAnswer =
      "Ho completato la ricerca. Non ho trovato informazioni sufficienti per rispondere con certezza. Puoi fornire più dettagli?";
  }

  callbacks.onComplete(leaderAnswer, agentOutputs, decision);
}
