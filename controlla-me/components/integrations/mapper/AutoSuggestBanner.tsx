"use client";

import { motion } from "framer-motion";
import { Sparkles, Check, X, Loader2 } from "lucide-react";

interface AutoSuggestBannerProps {
  /** Number of AI-suggested mappings ready to accept */
  suggestedCount: number;
  /** Total fields that were auto-matched */
  autoMappedCount: number;
  /** Total fields */
  totalFields: number;
  /** Whether AI suggestion is loading */
  isLoading?: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onReview: () => void;
}

export default function AutoSuggestBanner({
  suggestedCount,
  autoMappedCount,
  totalFields,
  isLoading,
  onAcceptAll,
  onRejectAll,
  onReview,
}: AutoSuggestBannerProps) {
  if (suggestedCount === 0 && !isLoading) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
      style={{
        background: "linear-gradient(135deg, rgba(255, 107, 53, 0.08), rgba(167, 139, 250, 0.08))",
        border: "1px solid rgba(255, 107, 53, 0.2)",
      }}
      role="status"
      aria-live="polite"
    >
      {/* Icon */}
      {isLoading ? (
        <Loader2
          className="w-4 h-4 shrink-0 animate-spin"
          style={{ color: "var(--accent)" }}
        />
      ) : (
        <Sparkles className="w-4 h-4 shrink-0" style={{ color: "var(--accent)" }} />
      )}

      {/* Message */}
      <div className="flex-1 min-w-0">
        {isLoading ? (
          <span style={{ color: "var(--fg-secondary)" }}>
            AI sta analizzando gli schema per suggerire i mapping...
          </span>
        ) : (
          <>
            <span style={{ color: "var(--fg-primary)" }}>
              <strong>{suggestedCount}</strong> mapping suggeriti dall&apos;AI
            </span>
            <span className="ml-2" style={{ color: "var(--fg-muted)" }}>
              ({autoMappedCount}/{totalFields} campi già mappati)
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      {!isLoading && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onReview}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              color: "var(--fg-primary)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            Rivedi
          </button>
          <button
            onClick={onRejectAll}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ color: "var(--error)" }}
            aria-label="Rifiuta tutti i suggerimenti"
          >
            <X className="w-3 h-3" />
            Rifiuta
          </button>
          <button
            onClick={onAcceptAll}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(to right, var(--accent), #E85A24)",
            }}
            aria-label="Accetta tutti i suggerimenti"
          >
            <Check className="w-3 h-3" />
            Accetta tutti
          </button>
        </div>
      )}
    </motion.div>
  );
}
