/**
 * OAuth2 Auth Handlers — PKCE (user-facing) e Client Credentials (server-to-server).
 *
 * NOTA: Questi handler richiedono il credential vault (ADR-3) per persistere i token.
 * Senza vault, lanciano un errore chiaro che indica la dipendenza.
 *
 * Il flow PKCE completo richiede:
 * 1. Redirect utente al provider (authorizeUrl) — gestito da una route API separata
 * 2. Callback con authorization_code — gestito da /api/auth/connector-callback
 * 3. Exchange code per token — gestito qui in authenticate()
 * 4. Refresh automatico — gestito qui in refresh()
 *
 * Il flow Client Credentials:
 * 1. POST al tokenUrl con client_id + client_secret → token
 * 2. Refresh: stessa chiamata (il token viene ri-emesso)
 */

import type {
  AuthHandler,
  AuthOAuth2PKCE,
  AuthOAuth2Client,
  CredentialVault,
} from "./types";

// ─── OAuth2 PKCE Handler ───

export class OAuth2PKCEHandler implements AuthHandler {
  readonly strategyType = "oauth2-pkce" as const;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: number = 0; // Unix timestamp ms

  constructor(
    private config: AuthOAuth2PKCE,
    private vault: CredentialVault | null = null,
    private userId: string | null = null
  ) {}

  async authenticate(): Promise<void> {
    // In produzione, i token vengono salvati nel vault dal callback OAuth2.
    // Qui li leggiamo dal vault.
    if (!this.vault || !this.userId) {
      throw new Error(
        "[AUTH:oauth2-pkce] Credential vault non disponibile. " +
          "Il connettore OAuth2 PKCE richiede ADR-3 (credential vault) per funzionare. " +
          "Implementare lib/credential-vault.ts e passare l'istanza al connettore."
      );
    }

    const connectorId = this.config.config.credentialVaultKey;
    const creds = await this.vault.getCredential(this.userId, connectorId);

    if (!creds) {
      throw new Error(
        `[AUTH:oauth2-pkce] Nessuna credenziale trovata nel vault per connettore "${connectorId}". ` +
          `L'utente deve completare il flow OAuth2 prima di usare questo connettore.`
      );
    }

    this.accessToken = creds.accessToken ?? null;
    this.refreshToken = creds.refreshToken ?? null;
    this.expiresAt = creds.expiresAt ? parseInt(creds.expiresAt, 10) : 0;
  }

  isValid(): boolean {
    if (!this.accessToken) return false;
    // Buffer di 60 secondi prima della scadenza
    return Date.now() < this.expiresAt - 60_000;
  }

  async refresh(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }

    const { tokenUrl, clientId } = this.config.config;

    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
        client_id: clientId,
      });

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      this.accessToken = data.access_token;
      if (data.refresh_token) {
        this.refreshToken = data.refresh_token;
      }
      this.expiresAt = data.expires_in
        ? Date.now() + data.expires_in * 1000
        : Date.now() + 3600_000; // default 1h

      // Persisti nel vault
      if (this.vault && this.userId) {
        await this.vault.refreshCredential(
          this.userId,
          this.config.config.credentialVaultKey,
          {
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            expiresAt: String(this.expiresAt),
          },
          new Date(this.expiresAt).toISOString()
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  async getHeaders(): Promise<Record<string, string>> {
    if (!this.accessToken) {
      await this.authenticate();
    }
    return {
      Authorization: `Bearer ${this.accessToken}`,
    };
  }
}

// ─── OAuth2 Client Credentials Handler ───

export class OAuth2ClientHandler implements AuthHandler {
  readonly strategyType = "oauth2-client" as const;
  private accessToken: string | null = null;
  private expiresAt: number = 0;

  constructor(private config: AuthOAuth2Client) {}

  async authenticate(): Promise<void> {
    const clientId = process.env[this.config.config.clientIdEnvVar];
    const clientSecret = process.env[this.config.config.clientSecretEnvVar];

    if (!clientId || !clientSecret) {
      const missing: string[] = [];
      if (!clientId) missing.push(this.config.config.clientIdEnvVar);
      if (!clientSecret) missing.push(this.config.config.clientSecretEnvVar);
      throw new Error(
        `[AUTH:oauth2-client] Variabili d'ambiente mancanti: ${missing.join(", ")}. ` +
          `Impossibile ottenere un access token.`
      );
    }

    const { tokenUrl, scopes } = this.config.config;

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    if (scopes.length > 0) {
      body.set("scope", scopes.join(" "));
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `[AUTH:oauth2-client] Token request fallita: HTTP ${response.status} — ${text.slice(0, 200)}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };

    this.accessToken = data.access_token;
    this.expiresAt = data.expires_in
      ? Date.now() + data.expires_in * 1000
      : Date.now() + 3600_000; // default 1h
  }

  isValid(): boolean {
    if (!this.accessToken) return false;
    return Date.now() < this.expiresAt - 60_000;
  }

  async refresh(): Promise<boolean> {
    // Client credentials: ri-autentica (stessa chiamata)
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }

  async getHeaders(): Promise<Record<string, string>> {
    if (!this.accessToken) {
      await this.authenticate();
    }
    return {
      Authorization: `Bearer ${this.accessToken}`,
    };
  }
}
