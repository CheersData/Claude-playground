/**
 * Vector Store — RAG pipeline per controlla.me
 *
 * Gestisce:
 * 1. Chunking intelligente dei documenti
 * 2. Indicizzazione embeddings in Supabase pgvector
 * 3. Ricerca semantica (similarity search)
 * 4. Auto-indicizzazione dei risultati di analisi nella knowledge base
 *
 * Architettura:
 *   document_chunks  → chunk del testo originale (per trovare documenti simili)
 *   legal_knowledge  → norme, sentenze, pattern (intelligenza collettiva)
 */

import { knowledge } from "./db";
import {
  generateEmbedding,
  generateEmbeddings,
  isVectorDBEnabled,
  truncateForEmbedding,
} from "./embeddings";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
} from "./types";

// ─── Chunking ───

interface TextChunk {
  content: string;
  index: number;
  metadata: Record<string, unknown>;
}

const CHUNK_SIZE = 1000; // ~250 tokens
const CHUNK_OVERLAP = 200;

/**
 * Spezza il testo in chunk con overlap, cercando di tagliare su confini naturali
 * (paragrafi, frasi) invece che a metà parola.
 */
export function chunkText(
  text: string,
  metadata: Record<string, unknown> = {}
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    // Se non siamo alla fine, cerca un punto di taglio naturale
    if (end < text.length) {
      // Cerca fine paragrafo (\n\n) vicino alla fine del chunk
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + CHUNK_SIZE * 0.5) {
        end = paragraphBreak + 2;
      } else {
        // Cerca fine frase (. ! ?) seguita da spazio
        const sentenceEnd = text.slice(start, end).search(/[.!?]\s+[A-Z\u00C0-\u024F]/g);
        if (sentenceEnd > CHUNK_SIZE * 0.5) {
          end = start + sentenceEnd + 2;
        } else {
          // Cerca fine di riga
          const lineBreak = text.lastIndexOf("\n", end);
          if (lineBreak > start + CHUNK_SIZE * 0.5) {
            end = lineBreak + 1;
          }
        }
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length > 20) {
      chunks.push({
        content,
        index,
        metadata: { ...metadata, charStart: start, charEnd: end },
      });
      index++;
    }

    // Avanza con overlap
    start = end - CHUNK_OVERLAP;
    if (start <= chunks[chunks.length - 1]?.metadata?.charStart as number) {
      start = end; // Previeni loop infinito
    }
  }

  return chunks;
}

// ─── Indicizzazione Documenti ───

/**
 * Indicizza un documento analizzato nel vector DB.
 * Spezza il testo in chunk, genera embeddings, salva in Supabase.
 */
export async function indexDocument(
  analysisId: string,
  documentText: string,
  classification: ClassificationResult
): Promise<{ chunksIndexed: number } | null> {
  if (!isVectorDBEnabled()) {
    console.log("[VECTOR] Voyage API non configurata — skip indicizzazione documento");
    return null;
  }

  const startTime = Date.now();

  // Chunking con metadati del documento
  const chunks = chunkText(documentText, {
    documentType: classification.documentType,
    documentTypeLabel: classification.documentTypeLabel,
    jurisdiction: classification.jurisdiction,
    parties: classification.parties.map((p) => p.role).join(", "),
  });

  if (chunks.length === 0) return { chunksIndexed: 0 };

  // Genera embeddings per tutti i chunk in batch
  const texts = chunks.map((c) => truncateForEmbedding(c.content));
  const embeddings = await generateEmbeddings(texts);

  if (!embeddings) {
    console.error("[VECTOR] Errore generazione embeddings documento");
    return null;
  }

  // Salva via DAL
  const chunkRows = chunks.map((chunk, i) => ({
    analysisId,
    chunkIndex: chunk.index,
    content: chunk.content,
    metadata: chunk.metadata,
    embedding: embeddings[i],
  }));

  await knowledge.indexDocumentChunks(analysisId, chunkRows);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[VECTOR] Documento indicizzato | ${chunks.length} chunk | ${elapsed}s | analysis_id: ${analysisId}`
  );

  return { chunksIndexed: chunks.length };
}

// ─── Indicizzazione Knowledge Base ───

interface KnowledgeEntry {
  category: "law_reference" | "court_case" | "clause_pattern" | "risk_pattern";
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * Estrae e indicizza conoscenza legale dai risultati dell'analisi.
 * Questa è la parte "rivoluzionaria": ogni analisi arricchisce la knowledge base.
 */
export async function indexAnalysisKnowledge(
  analysisId: string,
  classification: ClassificationResult,
  analysis: AnalysisResult,
  investigation: InvestigationResult,
  advice: AdvisorResult
): Promise<{ entriesIndexed: number } | null> {
  if (!isVectorDBEnabled()) {
    console.log("[VECTOR] Voyage API non configurata — skip indicizzazione knowledge");
    return null;
  }

  const startTime = Date.now();
  const entries: KnowledgeEntry[] = [];

  // 1. Estrarre pattern di clausole dall'analisi
  for (const clause of analysis.clauses) {
    entries.push({
      category: "clause_pattern",
      title: `${clause.title} [${classification.documentTypeLabel}]`,
      content: [
        `Clausola: ${clause.title}`,
        `Tipo documento: ${classification.documentTypeLabel}`,
        `Giurisdizione: ${classification.jurisdiction}`,
        `Livello rischio: ${clause.riskLevel}`,
        `Problema: ${clause.issue}`,
        `Potenziale violazione: ${clause.potentialViolation}`,
        `Standard di mercato: ${clause.marketStandard}`,
        `Raccomandazione: ${clause.recommendation}`,
        clause.originalText ? `Testo originale: ${clause.originalText.slice(0, 500)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        clauseId: clause.id,
        riskLevel: clause.riskLevel,
        documentType: classification.documentType,
        jurisdiction: classification.jurisdiction,
      },
    });
  }

  // 2. Estrarre riferimenti normativi dall'investigazione
  for (const finding of investigation.findings) {
    for (const law of finding.laws) {
      entries.push({
        category: "law_reference",
        title: law.reference,
        content: [
          `Norma: ${law.reference}`,
          `Testo: ${law.fullText}`,
          `In vigore: ${law.isInForce ? "Sì" : "No"}`,
          law.lastModified ? `Ultima modifica: ${law.lastModified}` : "",
          `Contesto: applicata a clausola in ${classification.documentTypeLabel}`,
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          reference: law.reference,
          isInForce: law.isInForce,
          sourceUrl: law.sourceUrl,
          documentType: classification.documentType,
          clauseId: finding.clauseId,
        },
      });
    }

    // 3. Estrarre sentenze dall'investigazione
    for (const courtCase of finding.courtCases) {
      entries.push({
        category: "court_case",
        title: courtCase.reference,
        content: [
          `Sentenza: ${courtCase.reference}`,
          `Tribunale: ${courtCase.court}`,
          `Data: ${courtCase.date}`,
          `Sintesi: ${courtCase.summary}`,
          `Rilevanza: ${courtCase.relevance}`,
          `Contesto: citata per ${classification.documentTypeLabel}`,
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          reference: courtCase.reference,
          court: courtCase.court,
          date: courtCase.date,
          sourceUrl: courtCase.sourceUrl,
          documentType: classification.documentType,
          clauseId: finding.clauseId,
        },
      });
    }
  }

  // 4. Estrarre pattern di rischio dall'advisor
  for (const risk of advice.risks) {
    entries.push({
      category: "risk_pattern",
      title: `${risk.title} [${risk.severity}]`,
      content: [
        `Rischio: ${risk.title}`,
        `Severità: ${risk.severity}`,
        `Dettaglio: ${risk.detail}`,
        `Base legale: ${risk.legalBasis}`,
        risk.courtCase ? `Sentenza: ${risk.courtCase}` : "",
        `Tipo documento: ${classification.documentTypeLabel}`,
        `Score equità: ${advice.fairnessScore}/10`,
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        severity: risk.severity,
        legalBasis: risk.legalBasis,
        documentType: classification.documentType,
        fairnessScore: advice.fairnessScore,
      },
    });
  }

  if (entries.length === 0) return { entriesIndexed: 0 };

  // Genera embeddings per tutte le entry
  const texts = entries.map((e) => truncateForEmbedding(e.content));
  const embeddings = await generateEmbeddings(texts);

  if (!embeddings) {
    console.error("[VECTOR] Errore generazione embeddings knowledge");
    return null;
  }

  // Upsert nella knowledge base via DAL
  let indexed = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const ok = await knowledge.upsertKnowledge({
      category: entry.category,
      title: entry.title,
      content: entry.content,
      metadata: entry.metadata,
      embedding: embeddings[i],
      sourceAnalysisId: analysisId,
    });

    if (ok) indexed++;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[VECTOR] Knowledge indicizzata | ${indexed}/${entries.length} entry | ${elapsed}s | analysis_id: ${analysisId}`
  );

  return { entriesIndexed: indexed };
}

// ─── Ricerca Semantica ───

export interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  category?: string;
  title?: string;
  timesSeen?: number;
}

/**
 * Cerca documenti simili nel vector DB.
 */
export async function searchSimilarDocuments(
  query: string,
  options: { threshold?: number; limit?: number } = {}
): Promise<SearchResult[]> {
  if (!isVectorDBEnabled()) return [];

  const { threshold = 0.7, limit = 5 } = options;

  const embedding = await generateEmbedding(query, "query");
  if (!embedding) return [];

  return knowledge.searchDocumentChunks(embedding, { threshold, limit });
}

/**
 * Cerca nella knowledge base legale.
 * Questa è la funzione chiave per arricchire gli agenti con contesto RAG.
 */
export async function searchLegalKnowledge(
  query: string,
  options: {
    category?: "law_reference" | "court_case" | "clause_pattern" | "risk_pattern";
    threshold?: number;
    limit?: number;
  } = {}
): Promise<SearchResult[]> {
  if (!isVectorDBEnabled()) return [];

  const { category, threshold = 0.65, limit = 5 } = options;

  const embedding = await generateEmbedding(query, "query");
  if (!embedding) return [];

  return knowledge.searchKnowledge(embedding, { category, threshold, limit });
}

/**
 * Ricerca combinata: cerca sia tra documenti che nella knowledge base.
 * Restituisce risultati unificati e ordinati per similarità.
 */
export async function searchAll(
  query: string,
  options: { threshold?: number; limit?: number } = {}
): Promise<{ documents: SearchResult[]; knowledge: SearchResult[] }> {
  if (!isVectorDBEnabled()) return { documents: [], knowledge: [] };

  const { threshold = 0.65, limit = 5 } = options;

  // Esegui entrambe le ricerche in parallelo
  const [documents, knowledge] = await Promise.all([
    searchSimilarDocuments(query, { threshold, limit }),
    searchLegalKnowledge(query, { threshold, limit }),
  ]);

  return { documents, knowledge };
}

/**
 * Costruisci contesto RAG per gli agenti a partire da una query.
 * Formatta i risultati in un blocco di testo da iniettare nei prompt.
 */
export async function buildRAGContext(
  query: string,
  options: {
    maxChars?: number;
    categories?: Array<"law_reference" | "court_case" | "clause_pattern" | "risk_pattern">;
  } = {}
): Promise<string> {
  if (!isVectorDBEnabled()) return "";

  const { maxChars = 3000, categories } = options;

  const results = await searchLegalKnowledge(query, {
    threshold: 0.6,
    limit: 8,
  });

  if (results.length === 0) return "";

  // Filtra per categorie se specificato
  const filtered = categories
    ? results.filter((r) => r.category && categories.includes(r.category as "law_reference" | "court_case" | "clause_pattern" | "risk_pattern"))
    : results;

  if (filtered.length === 0) return "";

  let context = "─── CONTESTO DA ANALISI PRECEDENTI ───\n";
  let charCount = context.length;

  for (const result of filtered) {
    const entry = `\n[${result.category?.toUpperCase()}] ${result.title} (similarità: ${(result.similarity * 100).toFixed(0)}%, visto ${result.timesSeen ?? 1}x)\n${result.content}\n`;

    if (charCount + entry.length > maxChars) break;

    context += entry;
    charCount += entry.length;
  }

  context += "\n─── FINE CONTESTO ───\n";

  console.log(
    `[VECTOR] Contesto RAG generato | ${filtered.length} risultati | ${charCount} chars`
  );

  return context;
}
