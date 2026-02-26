/**
 * BaseConnector — Classe astratta con logica condivisa: retry, rate limit, logging.
 *
 * NOTA: User-Agent browser obbligatorio per Normattiva (WAF del Poligrafico).
 * Lo impostiamo su tutte le richieste per uniformita.
 */

import type {
  ConnectorInterface,
  ConnectResult,
  FetchResult,
  DataSource,
} from "../types";

/** WAF Normattiva blocca richieste senza User-Agent browser */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export abstract class BaseConnector<T = unknown>
  implements ConnectorInterface<T>
{
  constructor(
    protected source: DataSource,
    protected log: (msg: string) => void = console.log
  ) {}

  abstract connect(): Promise<ConnectResult>;
  abstract fetchAll(options?: { limit?: number }): Promise<FetchResult<T>>;
  abstract fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<T>>;

  // ─── Utility condivise ───

  protected async fetchWithRetry(
    url: string,
    options?: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const mergedHeaders = {
          "User-Agent": BROWSER_UA,
          ...Object.fromEntries(
            new Headers(options?.headers ?? {}).entries()
          ),
        };
        const response = await fetch(url, {
          ...options,
          headers: mergedHeaders,
        });
        return response;
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          const waitMs = Math.pow(2, attempt + 1) * 1000;
          this.log(
            `[RETRY] ${this.source.id} | tentativo ${attempt + 1}/${maxRetries} | attendo ${waitMs / 1000}s`
          );
          await this.sleep(waitMs);
        }
      }
    }

    throw lastError;
  }

  protected async fetchJSON<R = unknown>(
    url: string,
    options?: RequestInit
  ): Promise<R> {
    const response = await this.fetchWithRetry(url, options);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status} da ${url}: ${text.slice(0, 200)}`
      );
    }
    return response.json() as Promise<R>;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Rate-limited pause tra le richieste */
  protected async rateLimitPause(): Promise<void> {
    await this.sleep(1000);
  }

  protected cleanText(text: string): string {
    return text
      .replace(/&egrave;/gi, "è")
      .replace(/&agrave;/gi, "à")
      .replace(/&ograve;/gi, "ò")
      .replace(/&ugrave;/gi, "ù")
      .replace(/&igrave;/gi, "ì")
      .replace(/&Egrave;/gi, "È")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#039;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }
}
