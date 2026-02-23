/**
 * Utility condivise per lo script di seed del corpus.
 */

import * as crypto from "crypto";

// ─── Fetch con retry ───

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.log(`  [RETRY] Tentativo ${attempt + 1}/${maxRetries} — attendo ${waitMs / 1000}s...`);
        await sleep(waitMs);
      }
    }
  }

  throw lastError;
}

// ─── Sleep ───

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Hash MD5 per delta loading ───

export function textHash(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex");
}

// ─── Estrazione termini legali dal testo ───

const LEGAL_PATTERNS: Array<[RegExp, string]> = [
  [/vendita\s+a\s+corpo/i, "vendita_a_corpo"],
  [/vendita\s+a\s+misura/i, "vendita_a_misura"],
  [/caparra\s+confirmatoria/i, "caparra_confirmatoria"],
  [/caparra\s+penitenziale/i, "caparra_penitenziale"],
  [/clausola\s+penale/i, "clausola_penale"],
  [/clausola\s+risolutiva/i, "clausola_risolutiva"],
  [/risoluzione\s+(?:del\s+)?contratto/i, "risoluzione_contratto"],
  [/eccessiva\s+onerosit[àa]/i, "eccessiva_onerosità"],
  [/fideiussione/i, "fideiussione"],
  [/ipoteca/i, "ipoteca"],
  [/trascrizione/i, "trascrizione"],
  [/usucapione/i, "usucapione"],
  [/prescrizione/i, "prescrizione"],
  [/simulazione/i, "simulazione"],
  [/annullabilit[àa]/i, "annullabilità"],
  [/nullit[àa]/i, "nullità"],
  [/rescissione/i, "rescissione"],
  [/responsabilit[àa]\s+(?:civile|extracontrattuale)/i, "responsabilità_civile"],
  [/locazione/i, "locazione"],
  [/appalto/i, "appalto"],
  [/mandato/i, "mandato"],
  [/comodato/i, "comodato"],
  [/mutuo/i, "mutuo"],
  [/pegno/i, "pegno"],
  [/surrogazione/i, "surrogazione"],
  [/compensazione/i, "compensazione"],
  [/novazione/i, "novazione"],
  [/garanzia\s+(?:per\s+)?evizione/i, "garanzia_evizione"],
  [/buona\s+fede/i, "buona_fede"],
  [/servit[uù]/i, "servitù"],
  [/usufrutto/i, "usufrutto"],
  [/comunione/i, "comunione"],
  [/condominio/i, "condominio"],
  [/successione/i, "successione"],
  [/testamento/i, "testamento"],
  [/donazione/i, "donazione"],
  [/dati\s+personali/i, "dati_personali"],
  [/trattamento\s+(?:dei\s+)?dati/i, "trattamento_dati"],
  [/consenso\s+(?:al\s+)?trattamento/i, "consenso_trattamento"],
  [/diritto\s+(?:di\s+)?recesso/i, "diritto_recesso"],
  [/clausol[ae]\s+abusiv[ae]/i, "clausola_abusiva"],
  [/squilibrio/i, "squilibrio_contrattuale"],
  [/garanzia\s+legale/i, "garanzia_legale"],
  [/conformit[àa]/i, "conformità"],
  [/modello\s+organizzativo/i, "modello_organizzativo_231"],
  [/responsabilit[àa]\s+(?:dell[ae]?\s+)?(?:ente|enti)/i, "responsabilità_enti"],
  [/permesso\s+(?:di\s+)?costruire/i, "permesso_costruire"],
  [/abuso\s+edilizio/i, "abuso_edilizio"],
];

export function extractLegalTerms(text: string): string[] {
  const terms: string[] = [];
  for (const [pattern, term] of LEGAL_PATTERNS) {
    if (pattern.test(text)) terms.push(term);
  }
  return terms;
}

// ─── Pulizia testo ───

export function cleanText(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// ─── Browser-like headers per scraping ───

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
};
