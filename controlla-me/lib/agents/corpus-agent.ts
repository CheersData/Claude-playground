/**
 * Corpus Agent — agente standalone per domande sulla legislazione italiana.
 *
 * Flusso:
 *   Domanda → Question-Prep (riformulazione legale) → Voyage AI embedding
 *     → pgvector search (top 8) → Gemini 2.5 Flash (o Haiku fallback)
 *     → Risposta strutturata
 *
 * Primo agente multi-provider: Gemini come primario, Haiku come fallback.
 */

import { searchArticles, type LegalArticleSearchResult } from "../legal-corpus";
import { searchLegalKnowledge, type SearchResult } from "../vector-store";
import { isVectorDBEnabled } from "../embeddings";
import { generateWithGemini, isGeminiEnabled, parseAgentJSON } from "../gemini";
import { anthropic, MODEL_FAST, extractTextContent } from "../anthropic";
import { CORPUS_AGENT_SYSTEM_PROMPT } from "../prompts/corpus-agent";
import { prepareQuestion } from "./question-prep";

// ─── Tipi ───

export interface CorpusAgentConfig {
  /** LLM provider: "auto" tenta Gemini poi Haiku. Default "auto". */
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
  provider: "gemini" | "haiku";
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

// ─── LLM Calls ───

async function callGemini(
  question: string,
  context: string,
  maxTokens: number
): Promise<{ text: string; durationMs: number }> {
  const prompt = `CONTESTO NORMATIVO:\n${context}\n\nDOMANDA:\n${question}`;
  const result = await generateWithGemini(prompt, {
    systemPrompt: CORPUS_AGENT_SYSTEM_PROMPT,
    maxOutputTokens: maxTokens,
    temperature: 0.2,
    jsonOutput: true,
    agentName: "CORPUS-AGENT",
  });
  return { text: result.text, durationMs: result.durationMs };
}

async function callHaiku(
  question: string,
  context: string,
  maxTokens: number
): Promise<{ text: string; durationMs: number }> {
  const start = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: maxTokens,
    system: CORPUS_AGENT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `CONTESTO NORMATIVO:\n${context}\n\nDOMANDA:\n${question}`,
      },
    ],
  });
  return { text: extractTextContent(response), durationMs: Date.now() - start };
}

// ─── Main ───

/**
 * Risponde a una domanda sulla legislazione italiana usando il corpus pgvector.
 *
 * @throws Error se vector DB non disponibile o entrambi i provider falliscono
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

  // 2. Build context
  const context = formatArticlesForContext(articles, knowledge);

  if (!context) {
    return {
      answer:
        "Non ho trovato articoli di legge pertinenti alla tua domanda nel corpus legislativo disponibile. Prova a riformulare la domanda o a essere più specifico.",
      citedArticles: [],
      confidence: 0,
      followUpQuestions: [],
      provider: "haiku",
      articlesRetrieved: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // 3. LLM call con fallback chain
  let text: string;
  let usedProvider: "gemini" | "haiku";

  if (provider === "haiku") {
    // Forza Haiku
    const result = await callHaiku(question, context, maxTokens);
    text = result.text;
    usedProvider = "haiku";
  } else if (provider === "gemini") {
    // Forza Gemini, nessun fallback
    if (!isGeminiEnabled()) {
      throw new Error("GEMINI_API_KEY non configurata e provider forzato a 'gemini'.");
    }
    const result = await callGemini(question, context, maxTokens);
    text = result.text;
    usedProvider = "gemini";
  } else {
    // Auto: Gemini → Haiku fallback
    if (isGeminiEnabled()) {
      try {
        const result = await callGemini(question, context, maxTokens);
        text = result.text;
        usedProvider = "gemini";
      } catch (err) {
        console.warn(
          `[CORPUS-AGENT] Gemini fallito, fallback a Haiku:`,
          err instanceof Error ? err.message : err
        );
        const result = await callHaiku(question, context, maxTokens);
        text = result.text;
        usedProvider = "haiku";
      }
    } else {
      const result = await callHaiku(question, context, maxTokens);
      text = result.text;
      usedProvider = "haiku";
    }
  }

  // 4. Parse JSON response
  const parsed = parseAgentJSON<{
    answer: string;
    citedArticles?: CitedArticle[];
    confidence?: number;
    followUpQuestions?: string[];
  }>(text);

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
