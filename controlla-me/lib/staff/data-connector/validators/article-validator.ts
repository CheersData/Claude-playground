/**
 * Article Validator — Validazione articoli prima dell'ingest.
 * Estende i check da scripts/check-data.ts in formato riusabile.
 */

import type { ParsedArticle } from "../types";

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

const HTML_ENTITIES = [
  "&Egrave;", "&egrave;", "&agrave;", "&ograve;",
  "&ugrave;", "&igrave;", "&amp;", "&nbsp;", "&lt;", "&gt;",
];

const UI_GARBAGE = [
  "articolo successivo", "nascondi", "esporta",
  "aggiornamenti all", "Approfondimenti", "-->",
  "cookie", "javascript",
];

export function validateArticle(article: ParsedArticle): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. Testo presente e non troppo corto
  if (!article.articleText || article.articleText.length < 10) {
    errors.push(
      `Testo troppo corto: ${article.articleText?.length ?? 0} chars`
    );
  }

  // 2. HTML entity detection
  if (article.articleText) {
    for (const ent of HTML_ENTITIES) {
      if (article.articleText.includes(ent)) {
        warnings.push(`Entita HTML non decodificata: ${ent}`);
      }
    }
  }

  // 3. UI garbage detection
  if (article.articleText) {
    const lower = article.articleText.toLowerCase();
    for (const term of UI_GARBAGE) {
      if (lower.includes(term.toLowerCase())) {
        warnings.push(`Spazzatura UI: "${term}"`);
      }
    }
  }

  // 4. Numero articolo
  if (!article.articleNumber || !/^\d/.test(article.articleNumber.trim())) {
    warnings.push(`Numero articolo anomalo: "${article.articleNumber}"`);
  }

  // 5. Gerarchia
  if (!article.hierarchy || Object.keys(article.hierarchy).length === 0) {
    warnings.push("Gerarchia assente");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function validateBatch(articles: ParsedArticle[]): {
  validCount: number;
  warningCount: number;
  errorCount: number;
  details: Array<{ articleNumber: string; result: ValidationResult }>;
} {
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  const details: Array<{ articleNumber: string; result: ValidationResult }> = [];

  for (const article of articles) {
    const result = validateArticle(article);
    details.push({ articleNumber: article.articleNumber, result });
    if (result.valid) validCount++;
    else errorCount++;
    if (result.warnings.length > 0) warningCount++;
  }

  return { validCount, warningCount, errorCount, details };
}
