/**
 * AuthenticatedBaseConnector — Sottoclasse di BaseConnector con autenticazione.
 *
 * Estende BaseConnector aggiungendo:
 * - Iniezione automatica degli auth header in ogni richiesta (fetchWithRetry)
 * - Gestione 401 con auto-refresh del token
 * - Rate limiting configurabile per provider (override del default 1s)
 *
 * I connettori business (Salesforce, SAP, HubSpot, ecc.) estendono questa classe
 * invece di BaseConnector.
 *
 * I connettori esistenti (Normattiva, EUR-Lex, StatPearls, ecc.) continuano
 * a usare BaseConnector — zero breaking changes.
 *
 * ADR-1: Implementazione. ADR-3 fornira il credential vault per OAuth2.
 */

import { BaseConnector } from "./base";
import { createAuthHandler } from "../auth";
import type { AuthHandler, AuthHandlerOptions } from "../auth";
import type { AuthStrategy } from "../auth/types";
import type { DataSource } from "../types";

export abstract class AuthenticatedBaseConnector<
  T = unknown,
> extends BaseConnector<T> {
  protected authHandler: AuthHandler;

  constructor(
    source: DataSource,
    log: (msg: string) => void = console.log,
    authOptions: AuthHandlerOptions = {}
  ) {
    super(source, log);

    // Leggi la strategia dalla DataSource, default: nessuna auth
    const strategy: AuthStrategy = source.auth ?? { type: "none" };
    this.authHandler = createAuthHandler(strategy, authOptions);
  }

  // ─── Auth lifecycle ───

  /**
   * Autentica il connettore prima di iniziare le richieste.
   * Chiamato automaticamente alla prima fetchWithRetry() se non gia fatto.
   */
  async authenticate(): Promise<void> {
    this.log(`[AUTH] Autenticazione con strategia "${this.authHandler.strategyType}"...`);
    await this.authHandler.authenticate();
    this.log(`[AUTH] Autenticazione completata.`);
  }

  /**
   * Verifica se il connettore ha credenziali valide.
   */
  isAuthenticated(): boolean {
    return this.authHandler.isValid();
  }

  // ─── Override fetchWithRetry con auth header injection ───

  protected async fetchWithRetry(
    url: string,
    options?: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    // Auto-authenticate se non ancora fatto
    if (!this.authHandler.isValid()) {
      try {
        if (this.authHandler.strategyType !== "none") {
          await this.authHandler.authenticate();
        }
      } catch (authErr) {
        // Se l'auth iniziale fallisce, tenta refresh
        this.log(`[AUTH] Autenticazione iniziale fallita, tentativo refresh...`);
        const refreshed = await this.authHandler.refresh();
        if (!refreshed) {
          throw authErr;
        }
      }
    }

    // Refresh se token scaduto (prima della richiesta)
    if (!this.authHandler.isValid() && this.authHandler.strategyType !== "none") {
      this.log(`[AUTH] Token scaduto, refresh pre-richiesta...`);
      const refreshed = await this.authHandler.refresh();
      if (!refreshed) {
        throw new Error(
          `[AUTH] Token scaduto e refresh fallito per "${this.source.id}". ` +
            `L'utente deve ri-autorizzare il connettore.`
        );
      }
    }

    // Inietta auth headers
    const authHeaders = await this.authHandler.getHeaders();
    const mergedOptions: RequestInit = {
      ...options,
      headers: {
        ...authHeaders,
        ...Object.fromEntries(
          new Headers(options?.headers ?? {}).entries()
        ),
      },
    };

    const response = await super.fetchWithRetry(url, mergedOptions, maxRetries);

    // Se 401, tenta refresh una volta e riprova
    if (response.status === 401 && this.authHandler.strategyType !== "none") {
      this.log(`[AUTH] Risposta 401 da ${url}, tentativo refresh token...`);
      const refreshed = await this.authHandler.refresh();
      if (refreshed) {
        const newHeaders = await this.authHandler.getHeaders();
        const retryOptions: RequestInit = {
          ...options,
          headers: {
            ...newHeaders,
            ...Object.fromEntries(
              new Headers(options?.headers ?? {}).entries()
            ),
          },
        };
        return super.fetchWithRetry(url, retryOptions, maxRetries);
      }

      throw new Error(
        `[AUTH] OAuth token expired and refresh failed for "${this.source.id}". ` +
          `User must re-authorize.`
      );
    }

    return response;
  }

  // ─── Rate limit configurabile ───

  /**
   * Override del rate limit pause di default (1s).
   * Legge la configurazione da DataSource.rateLimit se presente.
   */
  protected async rateLimitPause(): Promise<void> {
    const rateLimit = this.source.rateLimit;
    if (rateLimit?.requestsPerSecond) {
      // Pausa calcolata: 1000ms / requestsPerSecond
      const pauseMs = Math.ceil(1000 / rateLimit.requestsPerSecond);
      await this.sleep(pauseMs);
    } else if (rateLimit?.requestsPerMinute) {
      // Pausa calcolata: 60000ms / requestsPerMinute
      const pauseMs = Math.ceil(60_000 / rateLimit.requestsPerMinute);
      await this.sleep(pauseMs);
    } else {
      // Default: 1 secondo (come BaseConnector)
      await super.rateLimitPause();
    }
  }
}
