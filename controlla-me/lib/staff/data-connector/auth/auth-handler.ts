/**
 * Auth Handler Factory — Crea l'handler giusto in base alla AuthStrategy.
 *
 * Pattern factory: la pipeline chiama createAuthHandler(strategy) e ottiene
 * un oggetto AuthHandler pronto all'uso, senza sapere quale implementazione
 * viene usata sotto.
 *
 * Esporta anche un NoneAuthHandler per le fonti pubbliche (noop).
 */

import type { AuthStrategy, AuthHandler, CredentialVault } from "./types";
import { ApiKeyAuthHandler } from "./apikey-handler";
import { BasicAuthHandler } from "./basic-handler";
import { OAuth2PKCEHandler, OAuth2ClientHandler } from "./oauth2-handler";

// ─── None Handler (noop per fonti pubbliche) ───

class NoneAuthHandler implements AuthHandler {
  readonly strategyType = "none" as const;

  async authenticate(): Promise<void> {
    // Nessuna autenticazione necessaria
  }

  isValid(): boolean {
    return true; // Sempre valido — nessun token da verificare
  }

  async refresh(): Promise<boolean> {
    return true; // Niente da refreshare
  }

  async getHeaders(): Promise<Record<string, string>> {
    return {}; // Nessun header aggiuntivo
  }
}

// ─── Factory Options ───

export interface AuthHandlerOptions {
  /** Istanza del credential vault (necessaria per OAuth2 PKCE) — ADR-3 */
  vault?: CredentialVault | null;
  /** User ID per isolamento credenziali nel vault (necessario per OAuth2 PKCE) */
  userId?: string | null;
}

// ─── Factory ───

/**
 * Crea l'AuthHandler corretto in base alla strategia dichiarata nella DataSource.
 *
 * @param strategy - Tipo di autenticazione (da DataSource.auth)
 * @param options - Opzioni aggiuntive (vault, userId per OAuth2)
 * @returns AuthHandler pronto per authenticate() + getHeaders()
 */
export function createAuthHandler(
  strategy: AuthStrategy,
  options: AuthHandlerOptions = {}
): AuthHandler {
  switch (strategy.type) {
    case "none":
      return new NoneAuthHandler();

    case "api-key":
      return new ApiKeyAuthHandler(strategy);

    case "basic":
      return new BasicAuthHandler(strategy);

    case "oauth2-pkce":
      return new OAuth2PKCEHandler(
        strategy,
        options.vault ?? null,
        options.userId ?? null
      );

    case "oauth2-client":
      return new OAuth2ClientHandler(strategy);

    default: {
      // Exhaustive check — TypeScript errore se manca un case
      const _exhaustive: never = strategy;
      throw new Error(
        `[AUTH] Strategia di autenticazione non supportata: ${JSON.stringify(_exhaustive)}`
      );
    }
  }
}

// ─── Re-export ───

export { NoneAuthHandler };
export type { AuthHandler, AuthStrategy, CredentialVault } from "./types";
