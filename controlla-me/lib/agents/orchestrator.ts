import { runClassifier } from "./classifier";
import { runAnalyzer } from "./analyzer";
import { runInvestigator } from "./investigator";
import { runAdvisor } from "./advisor";
import {
  createSession,
  loadSession,
  savePhaseResult,
  savePhaseTiming,
  findSessionByDocument,
} from "../analysis-cache";
import {
  retrieveLegalContext,
  formatLegalContextForPrompt,
} from "../legal-corpus";
import {
  buildRAGContext,
  indexDocument,
  indexAnalysisKnowledge,
} from "../vector-store";
import { isVectorDBEnabled } from "../embeddings";
import { isAgentEnabled } from "../tiers";
import { onPipelineComplete } from "../company/hooks";
import { broadcastConsoleAgent } from "../agent-broadcast";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
  AgentPhase,
  PhaseStatus,
} from "../types";

export interface OrchestratorCallbacks {
  onProgress: (phase: AgentPhase, status: PhaseStatus, data?: unknown) => void;
  onError: (phase: AgentPhase, error: string) => void;
  onComplete: (result: AdvisorResult) => void;
}

export interface OrchestratorResult {
  classification: ClassificationResult | null;
  analysis: AnalysisResult | null;
  investigation: InvestigationResult | null;
  advice: AdvisorResult | null;
  sessionId: string;
}

export async function runOrchestrator(
  documentText: string,
  callbacks: OrchestratorCallbacks,
  resumeSessionId?: string,
  userContext?: string
): Promise<OrchestratorResult> {
  // Try to resume an existing session or find one for this document
  let sessionId: string;
  let cached = resumeSessionId ? await loadSession(resumeSessionId) : null;

  if (!cached) {
    cached = await findSessionByDocument(documentText);
  }

  if (cached) {
    sessionId = cached.sessionId;
    console.log(
      `[ORCHESTRATOR] Ripresa sessione ${sessionId} — ` +
        `classifier: ${cached.classification ? "CACHED" : "da fare"} | ` +
        `analyzer: ${cached.analysis ? "CACHED" : "da fare"} | ` +
        `investigator: ${cached.investigation ? "CACHED" : "da fare"} | ` +
        `advisor: ${cached.advice ? "CACHED" : "da fare"}`
    );
  } else {
    sessionId = await createSession(documentText);
    console.log(`[ORCHESTRATOR] Nuova sessione ${sessionId}`);
  }

  const result: OrchestratorResult = {
    classification: cached?.classification ?? null,
    analysis: cached?.analysis ?? null,
    investigation: cached?.investigation ?? null,
    advice: cached?.advice ?? null,
    sessionId,
  };

  // Helper to track timing for a phase
  const trackPhase = async (startTime: number, phase: Parameters<typeof savePhaseTiming>[1]) => {
    const endTime = Date.now();
    await savePhaseTiming(sessionId, phase, {
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      durationMs: endTime - startTime,
    });
  };

  // Step 1: Classifier
  if (!isAgentEnabled("classifier")) {
    console.log(`[ORCHESTRATOR] Classifier: DISABLED`);
    result.classification = {
      documentType: "contract",
      documentTypeLabel: "Contratto generico",
      documentSubType: null,
      parties: [],
      jurisdiction: "Italia",
      applicableLaws: [],
      relevantInstitutes: [],
      legalFocusAreas: [],
      keyDates: [],
      summary: "Classificazione non eseguita (agente disabilitato)",
      confidence: 0,
    };
    callbacks.onProgress("classifier", "skipped", result.classification);
  } else if (result.classification) {
    console.log(`[ORCHESTRATOR] Classifier: SKIP (cached)`);
    callbacks.onProgress("classifier", "done", result.classification);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("classifier", "running");
      const classifierInput = userContext
        ? `CONTESTO UTENTE: ${userContext}\n\nDOCUMENTO:\n${documentText}`
        : documentText;
      result.classification = await runClassifier(classifierInput);
      await savePhaseResult(sessionId, "classification", result.classification);
      await trackPhase(t0, "classifier");
      callbacks.onProgress("classifier", "done", result.classification);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError("classifier", message);
      throw new Error(`Classifier failed: ${message}`);
    }
  }

  // Step 1.5: Knowledge Retrieval (RAG) — between Classifier and Analyzer
  // This is the key innovation: we fetch legal context from the vector DB
  // to guide the Analyzer with VERIFIED norms instead of relying on model memory.
  let legalContext = "";
  let ragContext = "";

  broadcastConsoleAgent("retrieval", "running", { task: "Retrieval: contesto normativo per Analyzer" });

  // Enrich retrieval params for HR documents — map subtypes to specific labor law sources and institutes
  const enrichedLaws = [...result.classification.applicableLaws];
  const enrichedInstitutes = [...(result.classification.relevantInstitutes ?? [])];
  const isHrDocument = detectHrDocument(result.classification);

  if (isHrDocument) {
    const hrEnrichment = getHrRetrievalEnrichment(result.classification.documentSubType);
    // Add HR-specific law sources (dedup by reference)
    const existingRefs = new Set(enrichedLaws.map(l => l.reference));
    for (const law of hrEnrichment.laws) {
      if (!existingRefs.has(law.reference)) {
        enrichedLaws.push(law);
      }
    }
    // Add HR-specific institutes (dedup)
    const existingInstitutes = new Set(enrichedInstitutes);
    for (const inst of hrEnrichment.institutes) {
      if (!existingInstitutes.has(inst)) {
        enrichedInstitutes.push(inst);
      }
    }
    console.log(
      `[ORCHESTRATOR] HR document detected (${result.classification.documentSubType}) — ` +
      `enriched with ${hrEnrichment.laws.length} law sources, ${hrEnrichment.institutes.length} institutes`
    );
  }

  try {
    // Retrieve from the legal corpus (actual law articles)
    const legalResult = await retrieveLegalContext({
      applicableLaws: enrichedLaws,
      relevantInstitutes: enrichedInstitutes,
      clauseTexts: [], // Will be populated after analysis for investigator
    });

    legalContext = formatLegalContextForPrompt(legalResult);

    if (legalContext) {
      console.log(
        `[ORCHESTRATOR] Contesto normativo recuperato: ${legalContext.length} chars`
      );
    }

    // Retrieve from the knowledge base (past analyses)
    if (isVectorDBEnabled()) {
      const queryForRAG = [
        result.classification.documentTypeLabel,
        result.classification.documentSubType,
        ...(result.classification.relevantInstitutes ?? []),
      ]
        .filter(Boolean)
        .join(" ");

      ragContext = await buildRAGContext(queryForRAG, {
        maxChars: 2000,
        categories: ["clause_pattern", "risk_pattern"],
      });

      if (ragContext) {
        console.log(
          `[ORCHESTRATOR] Contesto RAG recuperato: ${ragContext.length} chars`
        );
      }
    }

    const contextChars = (legalContext?.length ?? 0) + (ragContext?.length ?? 0);
    broadcastConsoleAgent("retrieval", "done", {
      task: `Retrieval: ${contextChars} chars contesto normativo`,
    });
  } catch (error) {
    // Knowledge retrieval failure is non-fatal
    const errMsg = error instanceof Error ? error.message : "Unknown";
    console.error(
      `[ORCHESTRATOR] Errore retrieval contesto: ${errMsg}`
    );
    broadcastConsoleAgent("retrieval", "error", { task: `Retrieval fallito: ${errMsg}` });
  }

  // Step 2: Analyzer (now receives legal context from vector DB)
  if (!isAgentEnabled("analyzer")) {
    console.log(`[ORCHESTRATOR] Analyzer: DISABLED`);
    result.analysis = {
      clauses: [],
      missingElements: [],
      overallRisk: "low",
      positiveAspects: [],
    };
    callbacks.onProgress("analyzer", "skipped", result.analysis);
  } else if (result.analysis) {
    console.log(`[ORCHESTRATOR] Analyzer: SKIP (cached)`);
    callbacks.onProgress("analyzer", "done", result.analysis);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("analyzer", "running");
      result.analysis = await runAnalyzer(
        documentText,
        result.classification,
        legalContext || undefined
      );
      await savePhaseResult(sessionId, "analysis", result.analysis);
      await trackPhase(t0, "analyzer");
      callbacks.onProgress("analyzer", "done", result.analysis);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError("analyzer", message);
      throw new Error(`Analyzer failed: ${message}`);
    }
  }

  // Step 2.5: Retrieve additional legal context for problematic clauses
  // Now that we have the analysis, we can do semantic search with clause texts
  let investigatorLegalContext = legalContext;
  broadcastConsoleAgent("retrieval", "running", { task: "Retrieval: contesto clausole per Investigator" });
  try {
    if (isVectorDBEnabled() && result.analysis?.clauses?.length > 0) {
      const problematicTexts = result.analysis.clauses
        .filter((c) => ["critical", "high", "medium"].includes(c.riskLevel))
        .map((c) => `${c.title}: ${c.originalText?.slice(0, 200) ?? c.issue}`)
        .slice(0, 5);

      if (problematicTexts.length > 0) {
        const clauseContext = await retrieveLegalContext({
          applicableLaws: enrichedLaws,
          relevantInstitutes: enrichedInstitutes,
          clauseTexts: problematicTexts,
        });

        investigatorLegalContext = formatLegalContextForPrompt(clauseContext);
      }
    }
    broadcastConsoleAgent("retrieval", "done", {
      task: `Retrieval: contesto clausole pronto (${investigatorLegalContext.length} chars)`,
    });
  } catch {
    // Non-fatal
    broadcastConsoleAgent("retrieval", "error", { task: "Retrieval clausole fallito (non bloccante)" });
  }

  // Step 3: Investigator (now receives legal context + RAG context)
  if (!isAgentEnabled("investigator")) {
    console.log(`[ORCHESTRATOR] Investigator: DISABLED`);
    result.investigation = { findings: [] } as InvestigationResult;
    callbacks.onProgress("investigator", "skipped", result.investigation);
  } else if (result.investigation) {
    console.log(`[ORCHESTRATOR] Investigator: SKIP (cached)`);
    callbacks.onProgress("investigator", "done", result.investigation);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("investigator", "running");
      result.investigation = await runInvestigator(
        result.classification,
        result.analysis,
        investigatorLegalContext || undefined,
        ragContext || undefined
      );
      await savePhaseResult(sessionId, "investigation", result.investigation);
      await trackPhase(t0, "investigator");
      callbacks.onProgress("investigator", "done", result.investigation);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError("investigator", message);
      // Investigator failure is non-fatal — continue with empty findings
      result.investigation = { findings: [] };
      await savePhaseResult(sessionId, "investigation", result.investigation);
      await trackPhase(t0, "investigator");
      callbacks.onProgress("investigator", "done", result.investigation);
    }
  }

  // Step 4: Advisor (now receives RAG context for market calibration)
  if (!isAgentEnabled("advisor")) {
    console.log(`[ORCHESTRATOR] Advisor: DISABLED`);
    callbacks.onProgress("advisor", "skipped");
  } else if (result.advice) {
    console.log(`[ORCHESTRATOR] Advisor: SKIP (cached)`);
    callbacks.onProgress("advisor", "done", result.advice);
    callbacks.onComplete(result.advice);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("advisor", "running");
      result.advice = await runAdvisor(
        result.classification,
        result.analysis,
        result.investigation,
        ragContext || undefined
      );
      await savePhaseResult(sessionId, "advice", result.advice);
      await trackPhase(t0, "advisor");
      callbacks.onProgress("advisor", "done", result.advice);
      callbacks.onComplete(result.advice);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError("advisor", message);
      throw new Error(`Advisor failed: ${message}`);
    }
  }

  // Step 5: Company hooks — fire-and-forget task creation
  const phasesCompleted = [
    result.classification && "classifier",
    result.analysis && "analyzer",
    result.investigation && "investigator",
    result.advice && "advisor",
  ].filter(Boolean) as string[];
  // BUG-FIX: totalDurationMs era sempre 0 o ~1.7B (Date.now() - 0 vs Date.now() - Date.now())
  // Ora non lo calcoliamo qui — i phase timing individuali sono già salvati in savePhaseTiming
  onPipelineComplete({ sessionId, totalDurationMs: 0, phasesCompleted }).catch((err) => console.error("[ORCHESTRATOR] onPipelineComplete failed:", err?.message || err));

  // Step 6: Auto-index in vector DB (background, non-blocking)
  // Every completed analysis enriches the collective intelligence.
  if (
    result.classification &&
    result.analysis &&
    result.investigation &&
    result.advice
  ) {
    broadcastConsoleAgent("retrieval", "running", { task: "Auto-index: salvataggio conoscenza nel vector DB" });
    autoIndexAnalysis(
      sessionId,
      documentText,
      result.classification,
      result.analysis,
      result.investigation,
      result.advice
    )
      .then(() => {
        broadcastConsoleAgent("retrieval", "done", { task: "Auto-index completato" });
      })
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : "Unknown";
        console.error(`[ORCHESTRATOR] Errore auto-indexing: ${errMsg}`);
        broadcastConsoleAgent("retrieval", "error", { task: `Auto-index fallito: ${errMsg}` });
      });
  }

  return result;
}

/**
 * Auto-index a completed analysis in the vector DB.
 * Runs in background (fire-and-forget) to not slow down the response.
 */
async function autoIndexAnalysis(
  sessionId: string,
  documentText: string,
  classification: ClassificationResult,
  analysis: AnalysisResult,
  investigation: InvestigationResult,
  advice: AdvisorResult
): Promise<void> {
  if (!isVectorDBEnabled()) return;

  const t0 = Date.now();

  // Index document chunks (for finding similar documents in the future)
  const docResult = await indexDocument(sessionId, documentText, classification);

  // Index knowledge (laws, court cases, clause patterns, risk patterns)
  const knowledgeResult = await indexAnalysisKnowledge(
    sessionId,
    classification,
    analysis,
    investigation,
    advice
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[ORCHESTRATOR] Auto-indexing completato in ${elapsed}s | ` +
      `chunk: ${docResult?.chunksIndexed ?? 0} | ` +
      `knowledge: ${knowledgeResult?.entriesIndexed ?? 0}`
  );
}

// ─── HR Document Detection & Retrieval Enrichment ───

/** HR document subtypes recognized by the classifier */
const HR_SUBTYPES = new Set([
  "subordinato_tempo_indeterminato", "subordinato_tempo_determinato",
  "contratto_lavoro_subordinato", "contratto_co_co_co",
  "contratto_somministrazione", "contratto_apprendistato",
  "contratto_lavoro_tempo_determinato", "contratto_lavoro_part_time",
  "contratto_lavoro_dirigente",
  "collaborazione_coordinata", "co_co_co", "somministrazione",
  "apprendistato", "part_time", "lavoro_intermittente", "lavoro_a_chiamata",
  "distacco", "lavoro_agile_smart_working", "stage_tirocinio",
  "contratto_dirigente", "contratto_domestico",
  "lettera_licenziamento", "lettera_dimissioni", "dimissioni_volontarie",
  "patto_non_concorrenza", "accordo_non_concorrenza",
  "contestazione_disciplinare", "accordo_smart_working",
  "cedolino_busta_paga", "regolamento_aziendale",
  "cessione_contratto_lavoro", "lavoro_autonomo", "lavoro_autonomo_occasionale",
]);

/** HR-related legalFocusAreas that signal an HR document */
const HR_FOCUS_AREAS = new Set([
  "diritto_del_lavoro", "previdenza_sociale", "sicurezza_sul_lavoro",
  "diritto_sindacale", "contratti_flessibili", "dirigenza",
  "contrattazione_collettiva", "formazione_professionale",
  "tutela_lavoratore_parasubordinato", "somministrazione_lavoro",
  "licenziamento", "retribuzione", "fiscalita_lavoro", "potere_direttivo",
]);

/**
 * Detect whether a classified document is HR-related.
 * Checks documentSubType, documentType keywords, and legalFocusAreas.
 */
function detectHrDocument(classification: ClassificationResult): boolean {
  // Check subtype
  if (classification.documentSubType && HR_SUBTYPES.has(classification.documentSubType)) {
    return true;
  }

  // Check documentType for HR keywords
  const docTypeLower = (classification.documentType ?? "").toLowerCase();
  if (
    docTypeLower.includes("lavoro") ||
    docTypeLower.includes("employment") ||
    docTypeLower.includes("licenziamento") ||
    docTypeLower.includes("dimissioni") ||
    docTypeLower.includes("busta_paga") ||
    docTypeLower.includes("cedolino")
  ) {
    return true;
  }

  // Check legalFocusAreas
  const focusAreas = classification.legalFocusAreas ?? [];
  return focusAreas.some(area => HR_FOCUS_AREAS.has(area));
}

/** Law source + institutes mapping per HR subtype */
interface HrEnrichment {
  laws: Array<{ reference: string; name: string }>;
  institutes: string[];
}

/**
 * Core labor law sources — always included for any HR document.
 * These map to the 572 HR articles already loaded in the corpus.
 */
const HR_CORE_LAWS: Array<{ reference: string; name: string }> = [
  { reference: "L. 300/1970", name: "Statuto dei Lavoratori" },
  { reference: "D.Lgs. 81/2015", name: "Jobs Act — Contratti di lavoro" },
  { reference: "D.Lgs. 23/2015", name: "Jobs Act — Tutele crescenti" },
  { reference: "D.Lgs. 81/2008", name: "Sicurezza sul lavoro" },
  { reference: "D.Lgs. 276/2003", name: "Riforma Biagi" },
  { reference: "D.Lgs. 148/2015", name: "Ammortizzatori sociali" },
];

/** Core HR institutes — always included for any HR document */
const HR_CORE_INSTITUTES: string[] = [
  "tutela_lavoratore_subordinato",
  "trattamento_fine_rapporto",
  "contrattazione_collettiva",
  "mobbing",
];

/**
 * Returns additional law sources and institutes to query based on the HR document subtype.
 * This enrichment ensures retrieval pulls the right labor law articles for each specific
 * type of HR document (e.g., a dismissal letter gets licenziamento-specific institutes,
 * an apprenticeship contract gets formazione-specific ones).
 */
function getHrRetrievalEnrichment(documentSubType: string | null): HrEnrichment {
  const laws = [...HR_CORE_LAWS];
  const institutes = [...HR_CORE_INSTITUTES];

  // Subtype-specific enrichment
  const subtypeMap: Record<string, { extraLaws?: Array<{ reference: string; name: string }>; extraInstitutes: string[] }> = {
    // ── Contratti subordinati ──
    subordinato_tempo_indeterminato: {
      extraInstitutes: ["periodo_di_prova", "mansioni_inquadramento", "ferie_permessi_rol", "straordinario_orario_lavoro", "patto_non_concorrenza_lavoro"],
    },
    subordinato_tempo_determinato: {
      extraInstitutes: ["contratto_tempo_determinato", "periodo_di_prova", "mansioni_inquadramento", "ferie_permessi_rol"],
    },
    contratto_lavoro_subordinato: {
      extraInstitutes: ["periodo_di_prova", "mansioni_inquadramento", "ferie_permessi_rol", "straordinario_orario_lavoro", "sicurezza_sul_lavoro"],
    },
    contratto_lavoro_tempo_determinato: {
      extraInstitutes: ["contratto_tempo_determinato", "periodo_di_prova", "mansioni_inquadramento", "ferie_permessi_rol", "preavviso_licenziamento_dimissioni"],
    },
    contratto_lavoro_part_time: {
      extraInstitutes: ["part_time", "straordinario_orario_lavoro", "ferie_permessi_rol", "mansioni_inquadramento"],
    },
    contratto_lavoro_dirigente: {
      extraInstitutes: ["patto_non_concorrenza_lavoro", "licenziamento_giustificato_motivo", "tfr_trattamento_fine_rapporto", "periodo_di_prova", "mobbing"],
    },

    // ── Collaborazioni e somministrazione ──
    contratto_co_co_co: {
      extraInstitutes: ["collaborazione_coordinata", "tutela_lavoratore_subordinato", "mansioni_inquadramento"],
    },
    collaborazione_coordinata: {
      extraInstitutes: ["collaborazione_coordinata", "tutela_lavoratore_subordinato"],
    },
    co_co_co: {
      extraInstitutes: ["collaborazione_coordinata", "tutela_lavoratore_subordinato"],
    },
    contratto_somministrazione: {
      extraInstitutes: ["somministrazione_lavoro", "appalto_genuino", "distacco_lavoratore", "tutela_lavoratore_subordinato"],
    },
    somministrazione: {
      extraInstitutes: ["somministrazione_lavoro", "appalto_genuino", "distacco_lavoratore"],
    },

    // ── Apprendistato ──
    contratto_apprendistato: {
      extraInstitutes: ["apprendistato", "periodo_di_prova", "mansioni_inquadramento", "sicurezza_sul_lavoro"],
    },
    apprendistato: {
      extraInstitutes: ["apprendistato", "periodo_di_prova", "mansioni_inquadramento"],
    },

    // ── Licenziamento e dimissioni ──
    lettera_licenziamento: {
      extraInstitutes: ["licenziamento_giusta_causa", "licenziamento_giustificato_motivo", "tutele_crescenti", "preavviso_licenziamento_dimissioni", "tfr_trattamento_fine_rapporto", "sanzioni_disciplinari"],
    },
    lettera_dimissioni: {
      extraInstitutes: ["dimissioni", "preavviso_licenziamento_dimissioni", "tfr_trattamento_fine_rapporto"],
    },
    dimissioni_volontarie: {
      extraInstitutes: ["dimissioni", "preavviso_licenziamento_dimissioni", "tfr_trattamento_fine_rapporto"],
    },

    // ── Non concorrenza ──
    accordo_non_concorrenza: {
      extraInstitutes: ["patto_non_concorrenza_lavoro", "periodo_di_prova"],
    },
    patto_non_concorrenza: {
      extraInstitutes: ["patto_non_concorrenza_lavoro"],
    },

    // ── Dirigenti ──
    contratto_dirigente: {
      extraInstitutes: ["patto_non_concorrenza_lavoro", "licenziamento_giustificato_motivo", "tfr_trattamento_fine_rapporto", "periodo_di_prova"],
    },

    // ── Busta paga e regolamento ──
    cedolino_busta_paga: {
      extraInstitutes: ["straordinario_orario_lavoro", "ferie_permessi_rol", "tfr_trattamento_fine_rapporto", "mansioni_inquadramento"],
    },
    regolamento_aziendale: {
      extraInstitutes: ["sanzioni_disciplinari", "controllo_a_distanza", "sicurezza_sul_lavoro", "straordinario_orario_lavoro", "ferie_permessi_rol"],
    },

    // ── Smart working e flessibili ──
    lavoro_agile_smart_working: {
      extraLaws: [{ reference: "L. 81/2017", name: "Lavoro agile" }],
      extraInstitutes: ["lavoro_agile", "straordinario_orario_lavoro", "sicurezza_sul_lavoro"],
    },
    accordo_smart_working: {
      extraLaws: [{ reference: "L. 81/2017", name: "Lavoro agile" }],
      extraInstitutes: ["lavoro_agile", "straordinario_orario_lavoro"],
    },
    part_time: {
      extraInstitutes: ["part_time", "straordinario_orario_lavoro", "ferie_permessi_rol"],
    },
    lavoro_intermittente: {
      extraInstitutes: ["lavoro_intermittente", "ferie_permessi_rol"],
    },

    // ── Distacco e disciplinare ──
    distacco: {
      extraInstitutes: ["distacco_lavoratore", "appalto_genuino", "sicurezza_sul_lavoro"],
    },
    contestazione_disciplinare: {
      extraInstitutes: ["sanzioni_disciplinari", "licenziamento_giusta_causa", "reintegrazione_posto_lavoro"],
    },
  };

  const mapping = documentSubType ? subtypeMap[documentSubType] : undefined;
  if (mapping) {
    if (mapping.extraLaws) {
      laws.push(...mapping.extraLaws);
    }
    institutes.push(...mapping.extraInstitutes);
  }

  return { laws, institutes };
}
