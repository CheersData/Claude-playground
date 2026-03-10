/**
 * Basic Auth Handler — HTTP Basic Authentication (RFC 7617).
 *
 * Codifica username:password in base64 e inietta l'header Authorization.
 * Le credenziali vengono lette dalle variabili d'ambiente specificate in AuthBasic.
 */

import type { AuthHandler, AuthBasic } from "./types";

export class BasicAuthHandler implements AuthHandler {
  readonly strategyType = "basic" as const;
  private encodedCredentials: string | null = null;

  constructor(private config: AuthBasic) {}

  async authenticate(): Promise<void> {
    const username = process.env[this.config.envVarUser];
    const password = process.env[this.config.envVarPass];

    if (!username || !password) {
      const missing: string[] = [];
      if (!username) missing.push(this.config.envVarUser);
      if (!password) missing.push(this.config.envVarPass);
      throw new Error(
        `[AUTH:basic] Variabili d'ambiente mancanti: ${missing.join(", ")}. ` +
          `Impossibile autenticarsi con il connettore.`
      );
    }

    // Base64 encode (Node.js Buffer, non btoa che non gestisce UTF-8 correttamente)
    this.encodedCredentials = Buffer.from(
      `${username}:${password}`,
      "utf-8"
    ).toString("base64");
  }

  isValid(): boolean {
    return this.encodedCredentials !== null;
  }

  async refresh(): Promise<boolean> {
    // Basic auth non ha refresh — rileggi da env var
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }

  async getHeaders(): Promise<Record<string, string>> {
    if (!this.encodedCredentials) {
      await this.authenticate();
    }

    return {
      Authorization: `Basic ${this.encodedCredentials}`,
    };
  }
}
