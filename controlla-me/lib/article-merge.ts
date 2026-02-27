/**
 * Smart Article Merge v2 — Cap per batch + query-relevance boost.
 *
 * I batch per istituto arrivano già ordinati per similarità vettoriale alla query
 * (via searchArticlesByInstitute → match_legal_articles con cosine distance).
 *
 * Problema risolto: con la v1, istituti grandi (locazione: 79, obbligazione: 161)
 * riempivano il cap (30) spingendo fuori articoli critici da istituti rilevanti.
 *
 * Strategia v2:
 * 1. Peso per batch: se il nome istituto appare nella legalQuery → peso 2x
 * 2. Cap proporzionale al peso (minimo 10 per batch)
 * 3. Dedup via Map (key → articolo con similarity più alta)
 * 4. Semantic primary + mechanism fill
 * 5. Sort globale per similarity → gli articoli migliori emergono
 * 6. Cap finale: 30 specific, 35 systematic
 */

import type { LegalArticleSearchResult } from "./legal-corpus";

export interface MergeInput {
  instituteBatches: LegalArticleSearchResult[][];
  /** Nomi degli istituti, parallelo a instituteBatches */
  instituteNames?: string[];
  /** Query legale riformulata — usata per calcolare il peso dei batch */
  legalQuery?: string;
  semanticPrimary: LegalArticleSearchResult[];
  semanticMechanism: LegalArticleSearchResult[];
  questionType: "specific" | "systematic";
}

export interface MergeResult {
  articles: LegalArticleSearchResult[];
  instituteCount: number;
}

const MIN_PER_BATCH = 10;
const QUERY_MATCH_WEIGHT = 2.0;
const DEFAULT_WEIGHT = 1.0;

export function mergeArticleResults(input: MergeInput): MergeResult {
  const finalLimit = input.questionType === "systematic" ? 35 : 30;
  const batches = input.instituteBatches;
  const names = input.instituteNames ?? [];
  const query = (input.legalQuery ?? "").toLowerCase();
  const instituteCount = batches.reduce((sum, b) => sum + b.length, 0);

  // ─── 1. Calcola peso per batch ───
  // Se l'istituto è menzionato nella legalQuery → peso 2x (è il tema centrale)
  const weights = batches.map((_, i) => {
    if (!query || !names[i]) return DEFAULT_WEIGHT;
    const inst = names[i].toLowerCase().replace(/_/g, " ");
    // Match anche parziale: "prescrizione" in "prescrizione risarcimento danni"
    const tokens = inst.split(" ");
    const match = tokens.some((t) => t.length >= 4 && query.includes(t));
    return match ? QUERY_MATCH_WEIGHT : DEFAULT_WEIGHT;
  });

  // ─── 2. Cap proporzionale al peso ───
  // Budget per gli istituti = ~85% del cap (il resto per semantic)
  const instituteBudget = Math.ceil(finalLimit * 0.85);
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const caps = weights.map((w) => {
    if (totalWeight === 0) return MIN_PER_BATCH;
    return Math.max(MIN_PER_BATCH, Math.ceil((instituteBudget * w) / totalWeight));
  });

  // ─── 3. Dedup via Map: key → articolo (tiene similarity più alta) ───
  const seen = new Map<string, LegalArticleSearchResult>();

  const add = (art: LegalArticleSearchResult): boolean => {
    const key = `${art.lawSource}:${art.articleReference}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, art);
      return true;
    }
    if (art.similarity > existing.similarity) {
      seen.set(key, art);
    }
    return false;
  };

  // ─── 4. Institute batches: top N per batch ───
  for (let i = 0; i < batches.length; i++) {
    const cap = caps[i];
    let added = 0;
    for (const art of batches[i]) {
      if (added >= cap) break;
      if (add(art)) added++;
    }
  }

  // ─── 5. Semantic fill: primary + mechanism ───
  for (const art of input.semanticPrimary) {
    add(art);
  }
  for (const art of input.semanticMechanism) {
    add(art);
  }

  // ─── 6. Sort globale per similarity + cap finale ───
  const all = Array.from(seen.values());
  all.sort((a, b) => b.similarity - a.similarity);

  return {
    articles: all.slice(0, finalLimit),
    instituteCount,
  };
}
