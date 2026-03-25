"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sliders,
  ChevronDown,
  ChevronUp,
  Mic2,
  StickyNote,
  TrendingUp,
  TrendingDown,
  Disc3,
} from "lucide-react";

/* ── Types ── */

export interface ArrangementSuggestion {
  area: string;
  priority: number;
  suggestion: string;
  rationale: string;
  reference?: string;
}

export interface ArrangementPlan {
  overall_direction: string;
  suggestions: ArrangementSuggestion[];
  vocal_direction: string;
  production_notes: string;
  commercial_viability_delta: number;
  confidence: number;
}

interface ArrangementPlanCardProps {
  plan: ArrangementPlan;
}

/* ── Constants ── */

const MUSIC_CORAL = "#FF6B6B";
const MUSIC_GOLD = "#FFC832";

/* ── Priority indicator ── */

function PriorityDots({ priority }: { priority: number }) {
  const clamped = Math.min(Math.max(priority, 1), 10);
  const filled = Math.round(clamped / 2);
  const color =
    clamped >= 8 ? MUSIC_CORAL : clamped >= 5 ? MUSIC_GOLD : "#4ECDC4";

  return (
    <div className="flex items-center gap-1" title={`Priorita: ${clamped}/10`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: i < filled ? color : "rgba(255,255,255,0.1)",
          }}
        />
      ))}
    </div>
  );
}

/* ── Area badge ── */

const AREA_COLORS: Record<string, string> = {
  structure: "#4ECDC4",
  melody: "#A78BFA",
  harmony: "#FFC832",
  rhythm: "#FF6B35",
  production: "#FF6B6B",
  vocals: "#4ECDC4",
  arrangement: "#A78BFA",
  mix: "#FFC832",
  lyrics: "#FF6B35",
};

function AreaBadge({ area }: { area: string }) {
  const color = AREA_COLORS[area.toLowerCase()] || "#A78BFA";
  return (
    <span
      className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
        color,
      }}
    >
      {area}
    </span>
  );
}

/* ── Delta indicator ── */

function DeltaIndicator({ delta }: { delta: number }) {
  const isPositive = delta > 0;
  const color = isPositive ? "#4ade80" : MUSIC_CORAL;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const sign = isPositive ? "+" : "";

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
      }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="text-sm font-bold tabular-nums" style={{ color }}>
        {sign}{delta.toFixed(1)}
      </span>
      <span className="text-[10px] text-[var(--foreground-tertiary)]">
        viabilita commerciale
      </span>
    </div>
  );
}

/* ── Suggestion item ── */

function SuggestionItem({
  suggestion,
  index,
}: {
  suggestion: ArrangementSuggestion;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.06 }}
      className="rounded-xl overflow-hidden"
      style={{
        background: "color-mix(in srgb, var(--card-bg) 80%, transparent)",
        border: "1px solid var(--card-border)",
      }}
    >
      <div className="px-4 py-3">
        {/* Top row: area badge + priority */}
        <div className="flex items-center justify-between mb-2">
          <AreaBadge area={suggestion.area} />
          <PriorityDots priority={suggestion.priority} />
        </div>

        {/* Suggestion text */}
        <p className="text-sm text-[var(--foreground)] leading-relaxed mb-1.5">
          {suggestion.suggestion}
        </p>

        {/* Reference if available */}
        {suggestion.reference && (
          <div className="flex items-center gap-1.5 mb-1">
            <Disc3 className="w-3 h-3 text-[var(--foreground-tertiary)]" />
            <span className="text-xs text-[var(--foreground-tertiary)] italic">
              Ref: {suggestion.reference}
            </span>
          </div>
        )}

        {/* Rationale toggle */}
        {suggestion.rationale && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-[var(--foreground-tertiary)] hover:text-[var(--foreground-secondary)] transition-colors mt-1"
          >
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            {expanded ? "Nascondi motivazione" : "Mostra motivazione"}
          </button>
        )}
      </div>

      {/* Rationale (collapsible) */}
      <AnimatePresence>
        {expanded && suggestion.rationale && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 py-3 text-xs text-[var(--foreground-secondary)] leading-relaxed"
              style={{
                borderTop: "1px solid var(--card-border)",
                background: "color-mix(in srgb, var(--card-bg) 50%, transparent)",
              }}
            >
              {suggestion.rationale}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Component ── */

export default function ArrangementPlanCard({ plan }: ArrangementPlanCardProps) {
  const sortedSuggestions = [...plan.suggestions].sort(
    (a, b) => b.priority - a.priority
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="rounded-[var(--radius-xl)] p-6"
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        border: "1px solid var(--card-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `color-mix(in srgb, ${MUSIC_CORAL} 12%, transparent)` }}
        >
          <Sliders className="w-4.5 h-4.5" style={{ color: MUSIC_CORAL }} />
        </div>
        <h3 className="text-xs font-bold tracking-widest uppercase text-[var(--foreground-tertiary)]">
          Piano di Riarrangiamento
        </h3>
      </div>

      {/* Overall direction */}
      <p className="text-base text-[var(--foreground-secondary)] leading-relaxed mb-5">
        {plan.overall_direction}
      </p>

      {/* Commercial viability delta + confidence */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DeltaIndicator delta={plan.commercial_viability_delta} />
        <span className="text-xs text-[var(--foreground-tertiary)]">
          Confidenza: {Math.round(plan.confidence * 100)}%
        </span>
      </div>

      {/* Suggestions */}
      {sortedSuggestions.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--foreground-tertiary)] mb-3">
            Suggerimenti ({sortedSuggestions.length})
          </p>
          <div className="flex flex-col gap-3">
            {sortedSuggestions.map((s, i) => (
              <SuggestionItem key={`${s.area}-${i}`} suggestion={s} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Vocal direction */}
      {plan.vocal_direction && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-5 rounded-xl px-4 py-3"
          style={{
            background: "color-mix(in srgb, #4ECDC4 5%, transparent)",
            border: "1px solid color-mix(in srgb, #4ECDC4 12%, transparent)",
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Mic2 className="w-3.5 h-3.5" style={{ color: "#4ECDC4" }} />
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "#4ECDC4" }}>
              Direzione vocale
            </span>
          </div>
          <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">
            {plan.vocal_direction}
          </p>
        </motion.div>
      )}

      {/* Production notes */}
      {plan.production_notes && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-xl px-4 py-3"
          style={{
            background: "color-mix(in srgb, #FFC832 5%, transparent)",
            border: "1px solid color-mix(in srgb, #FFC832 12%, transparent)",
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <StickyNote className="w-3.5 h-3.5" style={{ color: MUSIC_GOLD }} />
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: MUSIC_GOLD }}>
              Note di produzione
            </span>
          </div>
          <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">
            {plan.production_notes}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
