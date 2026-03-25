"use client";

/**
 * ErrorStates — Clear, helpful error state components for the integration UI.
 *
 * Error types:
 *   - AuthExpired: "Riconnetti [Connector]" with re-auth button
 *   - SyncFailed: specific error message + retry button
 *   - MappingAmbiguous: "Verifica mapping" link
 *   - RateLimited: countdown timer + message
 *   - NoData: helpful suggestions
 *   - GenericError: fallback
 *
 * Design principle: clear, helpful, not scary. Italian labels.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  KeyRound,
  RefreshCw,
  GitMerge,
  Clock,
  FileX2,
  AlertCircle,
  ArrowRight,
  Plug,
  type LucideIcon,
} from "lucide-react";

// ─── Types ───

export type IntegrationErrorType =
  | "auth_expired"
  | "sync_failed"
  | "mapping_ambiguous"
  | "rate_limited"
  | "no_data"
  | "generic";

export interface IntegrationError {
  type: IntegrationErrorType;
  message?: string;
  connectorName?: string;
  connectorId?: string;
  retryAfterSeconds?: number;
  details?: string;
}

interface ErrorStateProps {
  error: IntegrationError;
  onReconnect?: () => void;
  onRetry?: () => void;
  onViewMapping?: () => void;
  compact?: boolean;
}

// ─── Error Config ───

interface ErrorConfig {
  Icon: LucideIcon;
  title: string;
  color: string;
  bg: string;
  border: string;
}

function getErrorConfig(error: IntegrationError): ErrorConfig {
  switch (error.type) {
    case "auth_expired":
      return {
        Icon: KeyRound,
        title: `Riconnetti ${error.connectorName || "il servizio"}`,
        color: "var(--caution)",
        bg: "rgba(255, 250, 194, 0.06)",
        border: "rgba(255, 250, 194, 0.15)",
      };
    case "sync_failed":
      return {
        Icon: RefreshCw,
        title: "Sincronizzazione fallita",
        color: "var(--error)",
        bg: "rgba(229, 141, 120, 0.06)",
        border: "rgba(229, 141, 120, 0.15)",
      };
    case "mapping_ambiguous":
      return {
        Icon: GitMerge,
        title: "Verifica la mappatura dei campi",
        color: "var(--caution)",
        bg: "rgba(255, 250, 194, 0.06)",
        border: "rgba(255, 250, 194, 0.15)",
      };
    case "rate_limited":
      return {
        Icon: Clock,
        title: "Limite API raggiunto",
        color: "var(--info-bright)",
        bg: "rgba(137, 221, 255, 0.06)",
        border: "rgba(137, 221, 255, 0.15)",
      };
    case "no_data":
      return {
        Icon: FileX2,
        title: "Nessun documento trovato",
        color: "var(--fg-muted)",
        bg: "var(--bg-overlay)",
        border: "var(--border-dark-subtle)",
      };
    default:
      return {
        Icon: AlertCircle,
        title: "Si e verificato un errore",
        color: "var(--error)",
        bg: "rgba(229, 141, 120, 0.06)",
        border: "rgba(229, 141, 120, 0.15)",
      };
  }
}

// ─── Countdown hook ───

function useCountdown(seconds: number | undefined) {
  const [remaining, setRemaining] = useState(seconds ?? 0);

  useEffect(() => {
    if (!seconds || seconds <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync countdown with prop change
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return {
    remaining,
    formatted: mins > 0 ? `${mins}m ${secs}s` : `${secs}s`,
    isDone: remaining <= 0,
  };
}

// ─── Error messages by type ───

function getErrorMessage(error: IntegrationError): string {
  switch (error.type) {
    case "auth_expired":
      return (
        error.message ||
        `Il token di accesso per ${error.connectorName || "il servizio"} e scaduto o non valido. Riconnetti per continuare la sincronizzazione.`
      );
    case "sync_failed":
      return error.message || "La sincronizzazione si e interrotta. Riprova o controlla i log per maggiori dettagli.";
    case "mapping_ambiguous":
      return (
        error.message ||
        "Alcuni campi non sono stati mappati automaticamente. Verifica la configurazione della mappatura per evitare perdita di dati."
      );
    case "rate_limited":
      return error.message || "Il limite di richieste API e stato raggiunto. La sincronizzazione riprende automaticamente.";
    case "no_data":
      return (
        error.message ||
        "Non sono stati trovati documenti da sincronizzare. Verifica che il tuo account abbia dati e che i permessi siano corretti."
      );
    default:
      return error.message || "Si e verificato un errore imprevisto. Riprova tra qualche minuto.";
  }
}

// ─── Component ───

export default function ErrorState({
  error,
  onReconnect,
  onRetry,
  onViewMapping,
  compact = false,
}: ErrorStateProps) {
  const config = getErrorConfig(error);
  const { Icon } = config;
  const message = getErrorMessage(error);
  const countdown = useCountdown(error.retryAfterSeconds);

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm"
        style={{
          background: config.bg,
          border: `1px solid ${config.border}`,
        }}
      >
        <Icon className="w-4 h-4 shrink-0" style={{ color: config.color }} />
        <span className="flex-1" style={{ color: "var(--fg-secondary)" }}>
          {config.title}
        </span>
        {error.type === "auth_expired" && onReconnect && (
          <button
            onClick={onReconnect}
            className="text-xs font-semibold transition-colors hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Riconnetti
          </button>
        )}
        {error.type === "sync_failed" && onRetry && (
          <button
            onClick={onRetry}
            className="text-xs font-semibold transition-colors hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Riprova
          </button>
        )}
        {error.type === "rate_limited" && !countdown.isDone && (
          <span className="text-xs font-mono" style={{ color: config.color }}>
            {countdown.formatted}
          </span>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl overflow-hidden"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      {/* Top accent line */}
      <div className="h-[2px]" style={{ background: config.color, opacity: 0.4 }} />

      <div className="p-6">
        {/* Icon + title */}
        <div className="flex items-start gap-4 mb-4">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
            style={{ background: `${config.color}15` }}
          >
            <Icon className="w-6 h-6" style={{ color: config.color }} />
          </div>
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--fg-primary)" }}>
              {config.title}
            </h3>
            <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
              {message}
            </p>
          </div>
        </div>

        {/* Rate limit countdown */}
        {error.type === "rate_limited" && !countdown.isDone && (
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-3 mb-4"
            style={{ background: "var(--bg-overlay)" }}
          >
            <Clock className="w-4 h-4" style={{ color: config.color }} />
            <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
              Riprova tra{" "}
              <span className="font-mono font-semibold" style={{ color: config.color }}>
                {countdown.formatted}
              </span>
            </span>
          </div>
        )}

        {/* No data suggestions */}
        {error.type === "no_data" && (
          <div
            className="rounded-lg p-4 mb-4 space-y-2"
            style={{ background: "var(--bg-overlay)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--fg-muted)" }}>
              Suggerimenti:
            </p>
            <ul className="text-xs space-y-1.5" style={{ color: "var(--fg-secondary)" }}>
              <li className="flex items-start gap-2">
                <span style={{ color: "var(--fg-invisible)" }}>1.</span>
                Verifica di aver selezionato le entita corrette nel wizard
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: "var(--fg-invisible)" }}>2.</span>
                Controlla che l&apos;account collegato abbia dati nel periodo selezionato
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: "var(--fg-invisible)" }}>3.</span>
                Verifica i permessi API nelle impostazioni del servizio
              </li>
            </ul>
          </div>
        )}

        {/* Details (expandable) */}
        {error.details && (
          <details className="mb-4">
            <summary
              className="text-xs cursor-pointer transition-colors"
              style={{ color: "var(--fg-muted)" }}
            >
              Dettagli tecnici
            </summary>
            <pre
              className="text-xs font-mono mt-2 p-3 rounded-lg overflow-x-auto"
              style={{
                background: "var(--bg-base)",
                color: "var(--fg-muted)",
                border: "1px solid var(--border-dark-subtle)",
              }}
            >
              {error.details}
            </pre>
          </details>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {error.type === "auth_expired" && onReconnect && (
            <button
              onClick={onReconnect}
              className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg"
              style={{
                background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                boxShadow: "0 4px 16px rgba(255, 107, 53, 0.25)",
              }}
            >
              <Plug className="w-4 h-4" />
              Riconnetti {error.connectorName || ""}
            </button>
          )}

          {(error.type === "sync_failed" || error.type === "generic") && onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg"
              style={{
                background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                boxShadow: "0 4px 16px rgba(255, 107, 53, 0.25)",
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Riprova ora
            </button>
          )}

          {error.type === "mapping_ambiguous" && onViewMapping && (
            <button
              onClick={onViewMapping}
              className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg"
              style={{
                background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                boxShadow: "0 4px 16px rgba(255, 107, 53, 0.25)",
              }}
            >
              <GitMerge className="w-4 h-4" />
              Verifica mapping
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {error.type === "rate_limited" && countdown.isDone && onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg"
              style={{
                background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                boxShadow: "0 4px 16px rgba(255, 107, 53, 0.25)",
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Riprova ora
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
