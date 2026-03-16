"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Check, Lock, Info, Eye, EyeOff, Loader2, AlertTriangle, Key } from "lucide-react";

// ─── Types ───

export type AuthMode = "oauth" | "api_key";

interface OAuthPermission {
  label: string;
}

interface AuthStepProps {
  connectorName: string;
  authMode: AuthMode;
  supportsApiKey?: boolean; // If true, show toggle between OAuth and API key
  oauthPermissions?: OAuthPermission[];
  apiKeyLabel?: string;
  secretKeyLabel?: string;
  helpText?: string;
  apiKey: string;
  secretKey: string;
  onApiKeyChange: (v: string) => void;
  onSecretKeyChange: (v: string) => void;
  onVerify: () => void;
  verifyStatus: "idle" | "verifying" | "success" | "error";
  verifyMessage?: string;
  onOAuthAuthorize?: () => void;
}

// ─── Component ───

export default function AuthStep({
  connectorName,
  authMode,
  supportsApiKey = false,
  oauthPermissions = [],
  apiKeyLabel = "API Key",
  secretKeyLabel = "Secret Key (opzionale)",
  helpText,
  apiKey,
  secretKey,
  onApiKeyChange,
  onSecretKeyChange,
  onVerify,
  verifyStatus,
  verifyMessage,
  onOAuthAuthorize,
}: AuthStepProps) {
  const [showSecret, setShowSecret] = useState(false);
  // For connectors that support both OAuth and API key, allow user to choose
  const [authMethod, setAuthMethod] = useState<"oauth" | "api_key">(authMode);

  const effectiveMode = supportsApiKey ? authMethod : authMode;

  return (
    <div>
      <h2 className="text-2xl font-semibold" style={{ color: "var(--fg-primary)" }}>
        Connetti {connectorName}
      </h2>
      <p className="text-sm mt-2" style={{ color: "var(--fg-secondary)" }}>
        {effectiveMode === "oauth"
          ? "Autorizza l'accesso al tuo account"
          : "Inserisci le credenziali API"}
      </p>

      {/* Method selector toggle (if connector supports both) */}
      {supportsApiKey && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setAuthMethod("oauth")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              authMethod === "oauth"
                ? "text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
            style={{
              background: authMethod === "oauth"
                ? "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))"
                : "var(--bg-overlay)",
              border: `1px solid ${authMethod === "oauth" ? "var(--accent)" : "var(--border-dark)"}`,
            }}
          >
            <Shield className="w-4 h-4 inline mr-2" />
            OAuth
          </button>
          <button
            onClick={() => setAuthMethod("api_key")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              authMethod === "api_key"
                ? "text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
            style={{
              background: authMethod === "api_key"
                ? "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))"
                : "var(--bg-overlay)",
              border: `1px solid ${authMethod === "api_key" ? "var(--accent)" : "var(--border-dark)"}`,
            }}
          >
            <Key className="w-4 h-4 inline mr-2" />
            API Key
          </button>
        </div>
      )}

      <div className="mt-6">
        {effectiveMode === "oauth" ? (
          /* ─── OAuth Card ─── */
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-dark)" }}
          >
            <Shield className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--info)" }} />

            <p className="text-sm font-medium mb-4" style={{ color: "var(--fg-secondary)" }}>
              Controlla.me richiede accesso a:
            </p>

            {/* Permissions list */}
            <div className="text-left max-w-xs mx-auto space-y-2 mb-6">
              {oauthPermissions.map((perm, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" style={{ color: "var(--success)" }} />
                  <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                    {perm.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs mb-6" style={{ color: "var(--fg-muted)" }}>
              Non modifichiamo mai i tuoi dati.
            </p>

            <button
              onClick={onOAuthAuthorize}
              className="w-full rounded-xl py-3 px-8 text-sm font-semibold text-white transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
              }}
            >
              Autorizza con {connectorName}
            </button>

            <div className="flex items-center justify-center gap-2 mt-4">
              <Lock className="w-3.5 h-3.5" style={{ color: "var(--fg-muted)" }} />
              <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                Connessione sicura via OAuth 2.0
              </span>
            </div>
          </div>
        ) : (
          /* ─── API Key Form ─── */
          <div
            className="rounded-xl p-6"
            style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-dark)" }}
          >
            {/* API Key field */}
            <div className="mb-4">
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--fg-secondary)" }}
              >
                {apiKeyLabel} <span style={{ color: "var(--error)" }}>*</span>
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="sk_live_..."
                className="w-full rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--border-dark-subtle)",
                  color: "var(--fg-primary)",
                }}
                aria-label={apiKeyLabel}
              />
            </div>

            {/* Secret Key field */}
            <div className="mb-4">
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--fg-secondary)" }}
              >
                {secretKeyLabel}
              </label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={secretKey}
                  onChange={(e) => onSecretKeyChange(e.target.value)}
                  placeholder="whsec_..."
                  className="w-full rounded-xl px-4 py-3 pr-12 text-sm font-mono outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                  style={{
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-dark-subtle)",
                    color: "var(--fg-primary)",
                  }}
                  aria-label={secretKeyLabel}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--fg-muted)" }}
                  aria-label={showSecret ? "Nascondi" : "Mostra"}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Help text */}
            {helpText && (
              <div
                className="flex items-start gap-2 rounded-lg p-3 mt-3 text-xs"
                style={{ background: "var(--bg-overlay)", color: "var(--fg-muted)" }}
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--info)" }} />
                <span>{helpText}</span>
              </div>
            )}

            {/* Verify button */}
            <button
              onClick={onVerify}
              disabled={!apiKey.trim() || verifyStatus === "verifying"}
              className="w-full mt-4 rounded-xl py-3 px-8 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
              }}
            >
              {verifyStatus === "verifying" ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifica in corso...
                </span>
              ) : (
                "Verifica connessione"
              )}
            </button>
          </div>
        )}

        {/* Status feedback */}
        <AnimatePresence mode="wait">
          {verifyStatus === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 rounded-xl p-4 mt-4 text-sm"
              style={{
                background: "rgba(93, 228, 199, 0.1)",
                border: "1px solid rgba(93, 228, 199, 0.3)",
                color: "var(--success)",
              }}
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{verifyMessage || "Connessione verificata"}</span>
            </motion.div>
          )}

          {verifyStatus === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 rounded-xl p-4 mt-4 text-sm"
              style={{
                background: "rgba(229, 141, 120, 0.1)",
                border: "1px solid rgba(229, 141, 120, 0.3)",
                color: "var(--error)",
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{verifyMessage || "Verifica fallita: chiave API non valida"}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
