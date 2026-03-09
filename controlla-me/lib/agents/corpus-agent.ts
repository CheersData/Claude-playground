/**
 * Corpus Agent — agente standalone per domande sulla legislazione italiana.
 *
 * Flusso (enhanced retrieval — stessa pipeline della console /ops):
 *   Domanda → Question-Prep (riformulazione legale + istituti)
 *     → Triple retrieval parallelo:
 *       1. Institute-ranked search (embedding + filtro per istituto)
 *       2. Semantic primary (multi-query expansion)
 *       3. Mechanism search (dual-axis se applicabile)
 *     → Smart merge (cap proporzionale + dedup + global sort)
 *     → runAgent("corpus-agent") con fallback → Risposta strutturata
 *
 * Usa il AI SDK: primary/fallback configurati in lib/models.ts AGENT_MODELS.
 */

import { searchArticles, searchArticlesByInstitute, type LegalArticleSearchResult } from "../legal-corpus";
import { searchLegalKnowledge, type SearchResult } from "../vector-store";
import { isVectorDBEnabled, generateEmbedding } from "../embeddings";
import { mergeArticleResults } from "../article-merge";
import { runAgent } from "../ai-sdk/agent-runner";
import { generate } from "../ai-sdk/generate";
import { parseAgentJSON } from "../anthropic";
import { CORPUS_AGENT_SYSTEM_PROMPT } from "../prompts/corpus-agent";
import { prepareQuestion, type QuestionPrepResult } from "./question-prep";

// ─── Tipi ───

export type CorpusStep = "question-prep" | "retrieval" | "analysis";

export interface CorpusProgressCallbacks {
  onStepStart?: (step: CorpusStep) => void;
  onStepDone?: (step: CorpusStep, data: Record<string, unknown>) => void;
}

export interface CorpusAgentConfig {
  /** LLM provider: "auto" usa AGENT_MODELS con fallback. Default "auto". */
  provider?: "auto" | "gemini" | "haiku";
  /** Max output tokens. Default 4096. */
  maxTokens?: number;
  /** Similarity threshold per la ricerca. Default 0.40. */
  threshold?: number;
  /** Max articoli da recuperare. Default 8. */
  maxArticles?: number;
  /** Salta il question-prep (usa la domanda originale per la ricerca). Default false. */
  skipQuestionPrep?: boolean;
  /** Callbacks for per-step progress reporting to the UI */
  onProgress?: CorpusProgressCallbacks;
}

interface CitedArticle {
  id: string;
  reference: string;
  source: string;
  relevance: string;
}

export interface CorpusAgentResult {
  answer: string;
  citedArticles: CitedArticle[];
  confidence: number;
  followUpQuestions: string[];
  provider: string;
  articlesRetrieved: number;
  durationMs: number;
}

// ─── Context Building ───

export function formatArticlesForContext(
  articles: LegalArticleSearchResult[],
  knowledge: SearchResult[]
): string {
  const sections: string[] = [];

  if (articles.length > 0) {
    sections.push("══ ARTICOLI DI LEGGE ══");
    for (const a of articles) {
      sections.push(
        `[ID: ${a.id}] ${a.lawSource} — ${a.articleReference}${a.articleTitle ? ` — ${a.articleTitle}` : ""} (pertinenza: ${(a.similarity * 100).toFixed(0)}%)\n${a.articleText}`
      );
    }
  }

  if (knowledge.length > 0) {
    sections.push("\n══ CONOSCENZA GIURIDICA ══");
    for (const k of knowledge) {
      sections.push(
        `[${k.category?.toUpperCase()}] ${k.title} (pertinenza: ${(k.similarity * 100).toFixed(0)}%)\n${k.content}`
      );
    }
  }

  return sections.join("\n\n");
}

// ─── Parsed Response Type ───

interface CorpusParsedResponse {
  answer: string;
  citedArticles?: CitedArticle[];
  confidence?: number;
  followUpQuestions?: string[];
}

// ─── Main ───

/**
 * Risponde a una domanda sulla legislazione italiana usando il corpus pgvector.
 *
 * @throws Error se vector DB non disponibile o tutti i provider falliscono
 */
export async function askCorpusAgent(
  question: string,
  config: CorpusAgentConfig = {}
): Promise<CorpusAgentResult> {
  const {
    provider = "auto",
    maxTokens = 4096,
    threshold = 0.38,
    maxArticles = 10,
    skipQuestionPrep = false,
    onProgress,
  } = config;

  const startTime = Date.now();

  // Prerequisito: vector DB deve essere attivo
  if (!isVectorDBEnabled()) {
    throw new Error("Vector DB non disponibile. VOYAGE_API_KEY non configurata.");
  }

  // 1. Question-Prep: riformula la domanda in linguaggio giuridico + identifica istituti
  onProgress?.onStepStart?.("question-prep");
  let prep: Omit<QuestionPrepResult, "provider" | "durationMs"> & { provider?: string; durationMs?: number };
  if (!skipQuestionPrep) {
    prep = await prepareQuestion(question);
    console.log(
      `[CORPUS-AGENT] Prep: "${question.slice(0, 50)}..." → "${prep.legalQuery.slice(0, 80)}..."${prep.mechanismQuery ? ` | mechanism: "${prep.mechanismQuery.slice(0, 60)}"` : ""} | institutes: [${prep.suggestedInstitutes.join(", ")}] | ${prep.provider} | ${prep.durationMs}ms`
    );
    onProgress?.onStepDone?.("question-prep", {
      _corpusStep: "question-prep",
      questionType: prep.questionType,
      questionTypeLabel: prep.legalQuery,
      legalQuery: prep.legalQuery,
      mechanismQuery: prep.mechanismQuery,
      keywords: prep.keywords,
      legalAreas: prep.legalAreas,
      suggestedInstitutes: prep.suggestedInstitutes,
      applicableLaws: [],
      provider: prep.provider,
      durationMs: prep.durationMs,
    });
  } else {
    prep = {
      legalQuery: question,
      mechanismQuery: null,
      keywords: [],
      legalAreas: [],
      suggestedInstitutes: [],
      targetArticles: null,
      questionType: "specific" as const,
      needsProceduralLaw: false,
      needsCaseLaw: false,
      scopeNotes: null,
    };
    onProgress?.onStepDone?.("question-prep", {
      _corpusStep: "question-prep",
      questionType: "specific",
      questionTypeLabel: question,
      legalQuery: question,
      keywords: [],
      legalAreas: [],
      suggestedInstitutes: [],
      applicableLaws: [],
    });
  }

  // 2. Enhanced retrieval: institute-ranked + semantic + mechanism + knowledge
  onProgress?.onStepStart?.("retrieval");
  console.log(`[CORPUS-AGENT] Ricerca potenziata per: "${prep.legalQuery.slice(0, 80)}..."${prep.mechanismQuery ? ` + mechanism: "${prep.mechanismQuery.slice(0, 60)}"` : ""} | institutes: [${prep.suggestedInstitutes.join(", ")}]`);

  // Normalizza istituti: il modello può restituire "vendita a corpo" invece di "vendita_a_corpo"
  const normalizedInstitutes = prep.suggestedInstitutes.map((inst) =>
    inst.trim().replace(/\s+/g, "_").toLowerCase()
  );

  // Genera embedding della query una sola volta — usato per ranking vettoriale per istituto
  const queryEmbedding = normalizedInstitutes.length > 0
    ? await generateEmbedding(prep.legalQuery, "query")
    : null;

  // Ricerca parallela: istituti ranked + semantic primary + mechanism + knowledge
  const perInstituteLimit = prep.questionType === "systematic" ? 35 : 30;
  const institutePromises = queryEmbedding
    ? normalizedInstitutes.map((inst) =>
        searchArticlesByInstitute(inst, queryEmbedding, perInstituteLimit)
      )
    : [];

  const [primaryResults, mechanismResults, knowledge, ...instituteResults] = await Promise.all([
    // Semantic primary: NESSUN filtro istituto — safety net per quando question-prep sbaglia
    // Se gli istituti sono sbagliati, la ricerca semantica pura trova comunque gli articoli giusti
    searchArticles(prep.legalQuery, {
      threshold,
      limit: maxArticles,
    }),
    prep.mechanismQuery
      ? searchArticles(prep.mechanismQuery, { threshold, limit: 6 })
      : Promise.resolve([] as LegalArticleSearchResult[]),
    searchLegalKnowledge(prep.legalQuery, { threshold: 0.55, limit: 6 }),
    ...institutePromises,
  ]);

  // Smart merge: cap proporzionale per istituto + semantic fill + global sort
  const { articles, instituteCount } = mergeArticleResults({
    instituteBatches: instituteResults,
    instituteNames: normalizedInstitutes,
    legalQuery: prep.legalQuery,
    semanticPrimary: primaryResults,
    semanticMechanism: mechanismResults,
    questionType: prep.questionType,
  });

  console.log(
    `[CORPUS-AGENT] Recuperati ${articles.length} articoli (${instituteCount} da istituti, ${primaryResults.length} semantic, ${mechanismResults.length} mechanism) + ${knowledge.length} knowledge`
  );

  onProgress?.onStepDone?.("retrieval", {
    _corpusStep: "retrieval",
    articlesFound: articles.length,
    knowledgeFound: knowledge.length,
    institutes: normalizedInstitutes,
    mechanismQuery: prep.mechanismQuery,
    topArticles: articles.slice(0, 5).map(a => ({
      reference: a.articleReference,
      source: a.lawSource,
      similarity: a.similarity,
    })),
  });

  // 3. Build context
  const context = formatArticlesForContext(articles, knowledge);

  if (!context) {
    return {
      answer:
        "Non ho trovato articoli di legge pertinenti alla tua domanda nel corpus legislativo disponibile. Prova a riformulare la domanda o a essere più specifico.",
      citedArticles: [],
      confidence: 0,
      followUpQuestions: [],
      provider: "none",
      articlesRetrieved: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // 4. LLM call — con hint strutturali dal question-prep
  onProgress?.onStepStart?.("analysis");

  const typeHint = prep.questionType === "systematic"
    ? "\n\nTIPO DOMANDA: sistematica — struttura la risposta come tassonomia di casi (vedi istruzioni DOMANDE SISTEMATICHE)."
    : "";

  const scopeHints: string[] = [];
  if (prep.needsProceduralLaw) {
    scopeHints.push("ATTENZIONE: La domanda richiede norme di procedura PENALE (c.p.p.) NON presenti nel corpus. Il Codice di Procedura Civile (c.p.c.) È invece disponibile. Segnala esplicitamente questa limitazione.");
  }
  if (prep.needsCaseLaw) {
    scopeHints.push("ATTENZIONE: La domanda richiede giurisprudenza NON disponibile. Segnala la limitazione e indica in missingArticles le fonti giurisprudenziali necessarie.");
  }
  if (prep.scopeNotes) {
    scopeHints.push(`NOTA AMBITO: ${prep.scopeNotes}`);
  }
  const scopeBlock = scopeHints.length > 0
    ? `\n\n${scopeHints.join("\n")}`
    : "";

  const llmPrompt = `CONTESTO NORMATIVO:\n${context}${typeHint}${scopeBlock}\n\nDOMANDA:\n${question}`;
  let parsed: CorpusParsedResponse;
  let usedProvider: string;

  if (provider === "haiku") {
    // Forza Haiku
    const result = await generate("claude-haiku-4.5", llmPrompt, {
      systemPrompt: CORPUS_AGENT_SYSTEM_PROMPT,
      maxTokens,
      agentName: "CORPUS-AGENT",
    });
    parsed = parseAgentJSON<CorpusParsedResponse>(result.text);
    usedProvider = "anthropic";
  } else if (provider === "gemini") {
    // Forza Gemini
    const result = await generate("gemini-2.5-flash", llmPrompt, {
      systemPrompt: CORPUS_AGENT_SYSTEM_PROMPT,
      maxTokens,
      agentName: "CORPUS-AGENT",
    });
    parsed = parseAgentJSON<CorpusParsedResponse>(result.text);
    usedProvider = "gemini";
  } else {
    // Auto: usa runAgent con fallback automatico da AGENT_MODELS
    const result = await runAgent<CorpusParsedResponse>(
      "corpus-agent",
      llmPrompt,
      { systemPrompt: CORPUS_AGENT_SYSTEM_PROMPT }
    );
    parsed = result.parsed;
    usedProvider = result.provider;
  }

  const totalMs = Date.now() - startTime;
  console.log(
    `[CORPUS-AGENT] Completato | provider: ${usedProvider} | confidence: ${parsed.confidence ?? "N/A"} | ${(totalMs / 1000).toFixed(1)}s`
  );

  return {
    answer: parsed.answer ?? "Errore nella generazione della risposta.",
    citedArticles: parsed.citedArticles ?? [],
    confidence: parsed.confidence ?? 0.5,
    followUpQuestions: parsed.followUpQuestions ?? [],
    provider: usedProvider,
    articlesRetrieved: articles.length,
    durationMs: totalMs,
  };
}
