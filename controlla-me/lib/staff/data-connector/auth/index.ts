/**
 * Auth Module — Barrel export per il sistema di autenticazione dei connettori.
 *
 * Uso:
 *   import { createAuthHandler, type AuthStrategy } from "../auth";
 */

export { createAuthHandler, NoneAuthHandler } from "./auth-handler";
export type { AuthHandlerOptions } from "./auth-handler";
export { ApiKeyAuthHandler } from "./apikey-handler";
export { BasicAuthHandler } from "./basic-handler";
export { OAuth2PKCEHandler, OAuth2ClientHandler } from "./oauth2-handler";

// Re-export tutti i tipi
export type {
  AuthStrategy,
  AuthNone,
  AuthApiKey,
  AuthBasic,
  AuthOAuth2PKCE,
  AuthOAuth2Client,
  OAuth2PKCEConfig,
  OAuth2ClientConfig,
  AuthHandler,
  CredentialVault,
} from "./types";
