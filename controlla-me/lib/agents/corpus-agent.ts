/**
 * Corpus Agent — agente standalone per domande sulla legislazione italiana.
 *
 * Flusso:
 *   Domanda → Question-Prep (riformulazione legale) → Voyage AI embedding
 *     → pgvector search (top 8) → runAgent("corpus-agent") con fallback
 *     → Risposta strutturata
 *
 * Usa il AI SDK: primary/fallback configurati in lib/models.ts AGENT_MODELS.
 */

import { searchArticles, type LegalArticleSearchResult } from "../legal-corpus";
import { searchLegalKnowledge, type SearchResult } from "../vector-store";
import { isVectorDBEnabled } from "../embeddings";
import { runAgent } from "../ai-sdk/agent-runner";
import { generate } from "../ai-sdk/generate";
import { parseAgentJSON } from "../anthropic";
import { CORPUS_AGENT_SYSTEM_PROMPT } from "../prompts/corpus-agent";
import { prepareQuestion } from "./question-prep";

// ─── Tipi ───

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

function formatArticlesForContext(
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
    threshold = 0.40,
    maxArticles = 8,
    skipQuestionPrep = false,
  } = config;

  const startTime = Date.now();

  // Prerequisito: vector DB deve essere attivo
  if (!isVectorDBEnabled()) {
    throw new Error("Vector DB non disponibile. VOYAGE_API_KEY non configurata.");
  }

  // 1. Question-Prep: riformula la domanda in linguaggio giuridico per la ricerca
  let searchQuery = question;
  if (!skipQuestionPrep) {
    const prep = await prepareQuestion(question);
    searchQuery = prep.legalQuery;
    console.log(
      `[CORPUS-AGENT] Prep: "${question.slice(0, 50)}..." → "${searchQuery.slice(0, 80)}..." | ${prep.provider} | ${prep.durationMs}ms`
    );
  }

  // 2. Retrieval parallelo: articoli legislativi + knowledge base
  console.log(`[CORPUS-AGENT] Ricerca per: "${searchQuery.slice(0, 80)}..."`);

  const [articles, knowledge] = await Promise.all([
    searchArticles(searchQuery, { threshold, limit: maxArticles }),
    searchLegalKnowledge(searchQuery, { threshold: 0.6, limit: 4 }),
  ]);

  console.log(
    `[CORPUS-AGENT] Recuperati ${articles.length} articoli + ${knowledge.length} knowledge entries`
  );

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

  // 4. LLM call
  const llmPrompt = `CONTESTO NORMATIVO:\n${context}\n\nDOMANDA:\n${question}`;
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
