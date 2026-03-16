"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Check,
  X,
  ArrowRight,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import type { SchemaField, FieldMappingEntry } from "./index";

// ─── Types ──────────────────────────────────────────────────────────

export interface MappingSuggestion {
  id: string;
  sourceFieldId: string;
  sourceFieldName: string;
  sourceFieldType: string;
  targetFieldId: string;
  targetFieldName: string;
  targetFieldType: string;
  confidence: number;
  reason: string;
  /** "name" = exact name match, "similarity" = Levenshtein, "semantic" = LLM */
  method: "name" | "similarity" | "semantic";
}

interface AutoMapSuggestionsProps {
  suggestions: MappingSuggestion[];
  onAccept: (suggestionId: string) => void;
  onReject: (suggestionId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onPreview?: (suggestion: MappingSuggestion) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────

function confidenceColor(c: number): string {
  if (c >= 90) return "var(--success)";
  if (c >= 70) return "var(--caution)";
  return "var(--error)";
}

function confidenceBg(c: number): string {
  if (c >= 90) return "rgba(93, 228, 199, 0.12)";
  if (c >= 70) return "rgba(255, 252, 194, 0.12)";
  return "rgba(229, 141, 120, 0.12)";
}

const METHOD_LABELS: Record<MappingSuggestion["method"], { label: string; color: string }> = {
  name: { label: "Nome esatto", color: "var(--success)" },
  similarity: { label: "Similarita", color: "var(--info)" },
  semantic: { label: "AI Semantico", color: "var(--accent)" },
};

// ─── Component ──────────────────────────────────────────────────────

export default function AutoMapSuggestions({
  suggestions,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onPreview,
}: AutoMapSuggestionsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [sortBy, setSortBy] = useState<"confidence" | "method">("confidence");

  const sorted = useMemo(() => {
    const clone = [...suggestions];
    if (sortBy === "confidence") {
      clone.sort((a, b) => b.confidence - a.confidence);
    } else {
      // Group by method: name > similarity > semantic
      const methodOrder = { name: 0, similarity: 1, semantic: 2 };
      clone.sort(
        (a, b) =>
          methodOrder[a.method] - methodOrder[b.method] ||
          b.confidence - a.confidence,
      );
    }
    return clone;
  }, [suggestions, sortBy]);

  const stats = useMemo(() => {
    const high = suggestions.filter((s) => s.confidence >= 90).length;
    const medium = suggestions.filter((s) => s.confidence >= 70 && s.confidence < 90).length;
    const low = suggestions.filter((s) => s.confidence < 70).length;
    const avgConf =
      suggestions.length > 0
        ? Math.round(suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length)
        : 0;
    return { high, medium, low, avgConf, total: suggestions.length };
  }, [suggestions]);

  const handleAcceptHighConfidence = useCallback(() => {
    for (const s of suggestions) {
      if (s.confidence >= 90) onAccept(s.id);
    }
  }, [suggestions, onAccept]);

  if (suggestions.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 text-left transition-colors"
        style={{ borderBottom: isExpanded ? "1px solid var(--border-dark-subtle)" : "none" }}
        aria-expanded={isExpanded}
        aria-controls="automap-suggestions-content"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
            Suggerimenti AI
          </h3>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: "rgba(255, 107, 53, 0.12)",
              color: "var(--accent)",
            }}
          >
            {stats.total} suggerimenti
          </span>
          {stats.total > 0 && (
            <span
              className="text-[10px]"
              style={{ color: "var(--fg-muted)" }}
            >
              (media {stats.avgConf}%)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: "var(--fg-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--fg-muted)" }} />
          )}
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id="automap-suggestions-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {/* Toolbar */}
            <div
              className="flex items-center justify-between gap-2 px-4 py-2 flex-wrap"
              style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
            >
              {/* Sort + confidence summary */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                    Ordina:
                  </span>
                  <button
                    onClick={() => setSortBy("confidence")}
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors"
                    style={{
                      background: sortBy === "confidence" ? "var(--accent)" : "transparent",
                      color: sortBy === "confidence" ? "#fff" : "var(--fg-muted)",
                      border: `1px solid ${sortBy === "confidence" ? "var(--accent)" : "var(--border-dark-subtle)"}`,
                    }}
                    aria-pressed={sortBy === "confidence"}
                  >
                    Confidenza
                  </button>
                  <button
                    onClick={() => setSortBy("method")}
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors"
                    style={{
                      background: sortBy === "method" ? "var(--accent)" : "transparent",
                      color: sortBy === "method" ? "#fff" : "var(--fg-muted)",
                      border: `1px solid ${sortBy === "method" ? "var(--accent)" : "var(--border-dark-subtle)"}`,
                    }}
                    aria-pressed={sortBy === "method"}
                  >
                    Metodo
                  </button>
                </div>

                {/* Confidence breakdown badges */}
                <div className="flex items-center gap-1">
                  {stats.high > 0 && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: "rgba(93, 228, 199, 0.12)", color: "var(--success)" }}
                    >
                      {stats.high} alta
                    </span>
                  )}
                  {stats.medium > 0 && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: "rgba(255, 252, 194, 0.12)", color: "var(--caution)" }}
                    >
                      {stats.medium} media
                    </span>
                  )}
                  {stats.low > 0 && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: "rgba(229, 141, 120, 0.12)", color: "var(--error)" }}
                    >
                      {stats.low} bassa
                    </span>
                  )}
                </div>
              </div>

              {/* Bulk actions */}
              <div className="flex items-center gap-1.5">
                {stats.high > 0 && (
                  <button
                    onClick={handleAcceptHighConfidence}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors"
                    style={{
                      color: "var(--success)",
                      border: "1px solid rgba(93, 228, 199, 0.3)",
                    }}
                    aria-label="Accetta tutti con alta confidenza"
                  >
                    <Check className="w-2.5 h-2.5" />
                    Alta conf.
                  </button>
                )}
                <button
                  onClick={onRejectAll}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium transition-colors"
                  style={{ color: "var(--error)" }}
                  aria-label="Rifiuta tutti"
                >
                  <X className="w-2.5 h-2.5" />
                  Rifiuta
                </button>
                <button
                  onClick={onAcceptAll}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-white transition-all hover:scale-[1.02]"
                  style={{ background: "linear-gradient(to right, var(--accent), #E85A24)" }}
                  aria-label="Accetta tutti"
                >
                  <Check className="w-2.5 h-2.5" />
                  Accetta tutti
                </button>
              </div>
            </div>

            {/* Suggestion list */}
            <div
              className="max-h-80 overflow-y-auto divide-y"
              style={{ borderColor: "var(--border-dark-subtle)" }}
              role="list"
              aria-label="Lista suggerimenti mapping AI"
            >
              <AnimatePresence mode="popLayout">
                {sorted.map((suggestion) => (
                  <SuggestionRow
                    key={suggestion.id}
                    suggestion={suggestion}
                    onAccept={onAccept}
                    onReject={onReject}
                    onPreview={onPreview}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Individual suggestion row ──────────────────────────────────────

function SuggestionRow({
  suggestion,
  onAccept,
  onReject,
  onPreview,
}: {
  suggestion: MappingSuggestion;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onPreview?: (suggestion: MappingSuggestion) => void;
}) {
  const [showReason, setShowReason] = useState(false);
  const methodCfg = METHOD_LABELS[suggestion.method];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, height: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 py-3"
      style={{ borderColor: "var(--border-dark-subtle)" }}
      role="listitem"
      aria-label={`Suggerimento: ${suggestion.sourceFieldName} verso ${suggestion.targetFieldName}, confidenza ${suggestion.confidence}%`}
    >
      <div className="flex items-center gap-2">
        {/* Source field */}
        <div
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono min-w-0"
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border-dark-subtle)",
          }}
        >
          <span className="truncate" style={{ color: "var(--info)" }}>
            {suggestion.sourceFieldName}
          </span>
          <span
            className="text-[9px] uppercase shrink-0"
            style={{ color: "var(--fg-invisible)" }}
          >
            {suggestion.sourceFieldType}
          </span>
        </div>

        {/* Arrow */}
        <ArrowRight className="w-3 h-3 shrink-0" style={{ color: "var(--fg-invisible)" }} />

        {/* Target field */}
        <div
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono min-w-0"
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border-dark-subtle)",
          }}
        >
          <span className="truncate" style={{ color: "var(--success)" }}>
            {suggestion.targetFieldName}
          </span>
          <span
            className="text-[9px] uppercase shrink-0"
            style={{ color: "var(--fg-invisible)" }}
          >
            {suggestion.targetFieldType}
          </span>
        </div>

        {/* Confidence */}
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0 tabular-nums"
          style={{
            background: confidenceBg(suggestion.confidence),
            color: confidenceColor(suggestion.confidence),
          }}
        >
          {suggestion.confidence < 70 && (
            <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />
          )}
          {suggestion.confidence}%
        </span>

        {/* Method badge */}
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold shrink-0"
          style={{ color: methodCfg.color }}
        >
          {methodCfg.label}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          {/* Reason toggle */}
          <button
            onClick={() => setShowReason(!showReason)}
            className="rounded-lg p-1 transition-colors"
            style={{ color: "var(--fg-muted)" }}
            aria-label="Mostra motivazione"
            aria-expanded={showReason}
          >
            <Eye className="w-3 h-3" />
          </button>

          {/* Reject */}
          <button
            onClick={() => onReject(suggestion.id)}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: "var(--error)" }}
            aria-label={`Rifiuta suggerimento per ${suggestion.sourceFieldName}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Accept */}
          <button
            onClick={() => onAccept(suggestion.id)}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: "var(--success)" }}
            aria-label={`Accetta suggerimento per ${suggestion.sourceFieldName}`}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Reason detail */}
      <AnimatePresence>
        {showReason && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="text-[11px] mt-2 pl-1 leading-relaxed overflow-hidden"
            style={{ color: "var(--fg-muted)" }}
          >
            {suggestion.reason}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
