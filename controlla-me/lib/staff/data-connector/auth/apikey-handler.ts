/**
 * API Key Auth Handler — Inietta una API key come header HTTP.
 *
 * Supporta qualsiasi header (Authorization, X-API-Key, ecc.)
 * con prefisso opzionale (es. "Bearer ").
 *
 * La chiave viene letta dalla variabile d'ambiente specificata in AuthApiKey.envVar.
 */

import type { AuthHandler, AuthApiKey } from "./types";

export class ApiKeyAuthHandler implements AuthHandler {
  readonly strategyType = "api-key" as const;
  private apiKey: string | null = null;

  constructor(private config: AuthApiKey) {}

  async authenticate(): Promise<void> {
    const key = process.env[this.config.envVar];
    if (!key) {
      throw new Error(
        `[AUTH:api-key] Variabile d'ambiente "${this.config.envVar}" non configurata. ` +
          `Impossibile autenticarsi con il connettore.`
      );
    }
    this.apiKey = key;
  }

  isValid(): boolean {
    // API key non scade — valida finché presente
    return this.apiKey !== null;
  }

  async refresh(): Promise<boolean> {
    // Le API key non hanno refresh — rileggi da env var
    const key = process.env[this.config.envVar];
    if (key) {
      this.apiKey = key;
      return true;
    }
    return false;
  }

  async getHeaders(): Promise<Record<string, string>> {
    if (!this.apiKey) {
      await this.authenticate();
    }

    const prefix = this.config.prefix ?? "";
    return {
      [this.config.header]: `${prefix}${this.apiKey}`,
    };
  }
}
