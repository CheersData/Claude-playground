/**
 * Similarity Engine — L2: Levenshtein distance per mapping campi.
 *
 * Normalizza e confronta nomi di campo usando la distanza di Levenshtein.
 * Ritorna il miglior match se la similarita supera la soglia (default 0.8).
 *
 * Modulo standalone estratto dal rule-engine per riuso nel MappingEngine.
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

// ─── Levenshtein Distance ───

/**
 * Calcola la distanza di Levenshtein tra due stringhe.
 * Complessita: O(m*n) dove m e n sono le lunghezze delle stringhe.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // sostituzione
          matrix[i][j - 1] + 1,     // inserimento
          matrix[i - 1][j] + 1      // cancellazione
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ─── Normalizzazione ───

/**
 * Normalizza un nome di campo per confronto:
 * - Lowercase
 * - camelCase -> snake_case
 * - Tutti i separatori -> underscore
 * - Rimuove underscore multipli/trailing
 */
function normalizeForComparison(fieldName: string): string {
  return fieldName
    // camelCase -> snake_case: "firstName" -> "first_name"
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    // Caratteri non alfanumerici -> underscore
    .replace(/[^a-z0-9]/g, "_")
    // Underscore multipli -> singolo
    .replace(/_+/g, "_")
    // Rimuovi leading/trailing underscore
    .replace(/^_|_$/g, "");
}

// ─── Similarity ───

/**
 * Similarita normalizzata tra due stringhe (0.0 - 1.0).
 * 1.0 = identiche, 0.0 = completamente diverse.
 */
function computeSimilarity(source: string, target: string): number {
  const maxLen = Math.max(source.length, target.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(source, target);
  return 1.0 - distance / maxLen;
}

// ─── Public API ───

/**
 * Trova il miglior match per un campo sorgente tra i campi target conosciuti.
 *
 * Normalizza entrambi i nomi prima del confronto per gestire
 * differenze di case, separatori e convenzioni (camelCase vs snake_case).
 *
 * @param sourceField - Nome del campo sorgente (qualsiasi formato)
 * @param knownTargetFields - Lista dei nomi colonne target disponibili
 * @param threshold - Soglia minima di similarita (default 0.8)
 * @returns Miglior match con score, o null se sotto soglia
 */
export function resolveBySimilarity(
  sourceField: string,
  knownTargetFields: string[],
  threshold = 0.8
): { field: string; score: number } | null {
  const normalizedSource = normalizeForComparison(sourceField);
  let best: { field: string; score: number } | null = null;

  for (const targetField of knownTargetFields) {
    const normalizedTarget = normalizeForComparison(targetField);
    const similarity = computeSimilarity(normalizedSource, normalizedTarget);

    if (similarity >= threshold && (!best || similarity > best.score)) {
      best = {
        field: targetField,
        score: Math.round(similarity * 100) / 100, // 2 decimali
      };
    }
  }

  return best;
}

/**
 * Batch resolve: trova il miglior match per ciascun campo sorgente.
 * Evita di assegnare lo stesso target a due sorgenti diverse.
 *
 * @param sourceFields - Lista dei campi sorgente da risolvere
 * @param knownTargetFields - Lista dei nomi colonne target disponibili
 * @param threshold - Soglia minima di similarita (default 0.8)
 * @returns Mappa sourceField -> { field, score } per i campi risolti
 */
export function resolveBatchBySimilarity(
  sourceFields: string[],
  knownTargetFields: string[],
  threshold = 0.8
): Map<string, { field: string; score: number }> {
  const result = new Map<string, { field: string; score: number }>();
  const usedTargets = new Set<string>();

  // Calcola tutti i match e ordinali per score decrescente
  const allMatches: Array<{ source: string; target: string; score: number }> = [];

  for (const source of sourceFields) {
    const normalizedSource = normalizeForComparison(source);
    for (const target of knownTargetFields) {
      const normalizedTarget = normalizeForComparison(target);
      const score = computeSimilarity(normalizedSource, normalizedTarget);
      if (score >= threshold) {
        allMatches.push({ source, target, score });
      }
    }
  }

  // Ordina per score decrescente: i match migliori hanno priorita
  allMatches.sort((a, b) => b.score - a.score);

  for (const match of allMatches) {
    if (!result.has(match.source) && !usedTargets.has(match.target)) {
      result.set(match.source, { field: match.target, score: match.score });
      usedTargets.add(match.target);
    }
  }

  return result;
}
