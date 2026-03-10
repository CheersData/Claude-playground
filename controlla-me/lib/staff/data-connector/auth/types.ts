/**
 * Auth Types — Strategie di autenticazione per i connettori.
 *
 * Ogni connettore dichiara la propria AuthStrategy nella DataSource config.
 * AuthHandler implementa la logica per ogni strategia.
 *
 * ADR-1: Definisce le interfacce. ADR-3 implementera il credential vault.
 */

// ─── Auth Strategies ───

/**
 * Nessuna autenticazione (fonti pubbliche: Normattiva, EUR-Lex, StatPearls, ecc.)
 */
export interface AuthNone {
  type: "none";
}

/**
 * API Key iniettata come header HTTP.
 * Esempio: `Authorization: Bearer sk-xxx` oppure `X-API-Key: abc123`
 */
export interface AuthApiKey {
  type: "api-key";
  /** Nome dell'header HTTP (es. "Authorization", "X-API-Key") */
  header: string;
  /** Variabile d'ambiente che contiene la chiave */
  envVar: string;
  /** Prefisso opzionale (es. "Bearer " per Authorization header) */
  prefix?: string;
}

/**
 * HTTP Basic Authentication (username:password in base64).
 * Credenziali lette da env var o dal credential vault (ADR-3).
 */
export interface AuthBasic {
  type: "basic";
  /** Variabile d'ambiente per lo username */
  envVarUser: string;
  /** Variabile d'ambiente per la password */
  envVarPass: string;
}

/**
 * OAuth 2.0 Authorization Code + PKCE (user-facing).
 * Usato per connettori che richiedono autorizzazione dell'utente
 * (Salesforce, HubSpot, QuickBooks).
 */
export interface AuthOAuth2PKCE {
  type: "oauth2-pkce";
  config: OAuth2PKCEConfig;
}

/**
 * OAuth 2.0 Client Credentials (server-to-server).
 * Usato per API che non richiedono contesto utente (SAP B1 Service Layer).
 */
export interface AuthOAuth2Client {
  type: "oauth2-client";
  config: OAuth2ClientConfig;
}

export type AuthStrategy =
  | AuthNone
  | AuthApiKey
  | AuthBasic
  | AuthOAuth2PKCE
  | AuthOAuth2Client;

// ─── OAuth2 Config ───

export interface OAuth2PKCEConfig {
  /** URL di autorizzazione del provider (es. https://login.salesforce.com/services/oauth2/authorize) */
  authorizeUrl: string;
  /** URL per lo scambio token (es. https://login.salesforce.com/services/oauth2/token) */
  tokenUrl: string;
  /** Client ID dell'applicazione OAuth2 */
  clientId: string;
  /** Scopes richiesti (es. ["api", "refresh_token"]) */
  scopes: string[];
  /** Callback URL dell'app (es. https://controlla.me/api/auth/connector-callback) */
  redirectUri: string;
  /** Chiave per il credential vault (ADR-3). Usata per persistere i token. */
  credentialVaultKey: string;
}

export interface OAuth2ClientConfig {
  /** URL per lo scambio token */
  tokenUrl: string;
  /** Variabile d'ambiente per il client ID */
  clientIdEnvVar: string;
  /** Variabile d'ambiente per il client secret */
  clientSecretEnvVar: string;
  /** Scopes richiesti */
  scopes: string[];
}

// ─── Auth Handler Interface ───

/**
 * Interfaccia per gestire l'autenticazione di un connettore.
 * Ogni AuthStrategy ha un handler corrispondente.
 */
export interface AuthHandler {
  /** Esegue l'autenticazione iniziale (es. exchange authorization_code per token) */
  authenticate(): Promise<void>;

  /** Verifica se le credenziali sono ancora valide (token non scaduto) */
  isValid(): boolean;

  /** Tenta il refresh delle credenziali (es. OAuth2 refresh_token) */
  refresh(): Promise<boolean>;

  /** Restituisce gli header HTTP da iniettare in ogni richiesta */
  getHeaders(): Promise<Record<string, string>>;

  /** Tipo di autenticazione gestita */
  readonly strategyType: AuthStrategy["type"];
}

// ─── Credential Vault (ADR-3) ───

/**
 * Entry restituita da listForUser().
 * NON contiene dati sensibili — solo metadata queryabile.
 */
export interface VaultEntry {
  id: string;
  connectorSource: string;
  credentialType: CredentialType;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastRefreshedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tipi di credenziali supportati dalla tabella credential_vault.
 * Corrisponde al CHECK constraint in migration 030.
 */
export type CredentialType = "api_key" | "oauth2_token" | "basic_auth";

/**
 * Interfaccia per il credential vault.
 * Implementata da `lib/credential-vault.ts` (SupabaseCredentialVault).
 *
 * Encryption avviene server-side via pgcrypto (pgp_sym_encrypt/pgp_sym_decrypt)
 * nelle RPC functions vault_store, vault_retrieve, vault_refresh.
 * Il client passa dati in chiaro alle RPC — la chiave AES non esce mai dal DB layer.
 */
export interface CredentialVault {
  /**
   * Recupera credenziali decifrate dal vault.
   * Restituisce null se non trovate o revocate.
   * Aggiorna automaticamente last_used_at per audit trail.
   */
  getCredential(
    userId: string,
    connectorSource: string
  ): Promise<Record<string, string> | null>;

  /**
   * Salva (o aggiorna) credenziali nel vault.
   * Upsert su (user_id, connector_source, credential_type).
   * Se la credenziale era stata revocata, viene riattivata.
   * @returns UUID della riga inserita/aggiornata.
   */
  storeCredential(
    userId: string,
    connectorSource: string,
    credentialType: CredentialType,
    data: Record<string, string>,
    options?: {
      metadata?: Record<string, unknown>;
      expiresAt?: string;
    }
  ): Promise<string>;

  /**
   * Aggiorna credenziali dopo un token refresh (OAuth2).
   * Aggiorna encrypted_data, expires_at, last_refreshed_at.
   * @returns true se aggiornato, false se la riga non esiste o e revocata.
   */
  refreshCredential(
    userId: string,
    connectorSource: string,
    newData: Record<string, string>,
    newExpiresAt?: string
  ): Promise<boolean>;

  /**
   * Revoca (soft delete) una credenziale.
   * Setta revoked_at = now(). La riga resta nel DB per 30 giorni (GDPR TTL)
   * poi viene rimossa da cleanup_integration_data().
   */
  revokeCredential(
    userId: string,
    connectorSource: string,
    credentialType: CredentialType
  ): Promise<boolean>;

  /**
   * Lista tutte le credenziali attive (non revocate) per un utente.
   * NON restituisce dati sensibili — solo metadata.
   */
  listForUser(userId: string): Promise<VaultEntry[]>;
}
