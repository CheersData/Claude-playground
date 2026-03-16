"use client";

import type React from "react";
import { motion } from "framer-motion";
import { Calendar, ArrowRight, Scale, Gavel, TrendingUp, CheckSquare } from "lucide-react";
import FairnessScore from "./FairnessScore";
import RiskCard from "./RiskCard";
import DeepSearchChat from "./DeepSearchChat";
import LawyerCTA from "./LawyerCTA";
import type { AdvisorResult, MultiDimensionalScore } from "@/lib/types";

// ─── Score Breakdown component ───────────────────────────────────────────────

const SCORE_ITEMS: Array<{
  key: keyof MultiDimensionalScore;
  label: string;
  description: string;
  Icon: React.ElementType;
}> = [
  {
    key: "contractEquity",
    label: "Equità Contrattuale",
    description: "Bilanciamento tra le parti",
    Icon: Scale,
  },
  {
    key: "legalCoherence",
    label: "Coerenza Legale",
    description: "Coerenza interna e con il quadro normativo",
    Icon: Gavel,
  },
  {
    key: "practicalCompliance",
    label: "Conformità Pratica",
    description: "Aderenza alla prassi di settore",
    Icon: TrendingUp,
  },
  {
    key: "completeness",
    label: "Completezza",
    description: "Copertura delle situazioni tipiche",
    Icon: CheckSquare,
  },
];

/** Maps score value to the corresponding CSS custom property for score colors */
function getScoreColor(value: number): string {
  if (value >= 9) return "var(--score-excellent)";
  if (value >= 7) return "var(--score-good)";
  if (value >= 5) return "var(--score-moderate)";
  if (value >= 3) return "var(--score-poor)";
  return "var(--score-critical)";
}

/** Shared card classes — tokenized via CSS custom properties */
const CARD_CLASSES = "rounded-[var(--radius-xl)] p-6 mb-5";

function ScoreBreakdown({ scores }: { scores: MultiDimensionalScore }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.18 }}
      className={CARD_CLASSES}
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        border: "1px solid var(--card-border)",
      }}
    >
      <h3 className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--foreground-tertiary)] mb-4">
        Valutazione dettagliata
      </h3>
      <div className="flex flex-col gap-4">
        {SCORE_ITEMS.map(({ key, label, description, Icon }, i) => {
          const value = scores[key];
          const color = getScoreColor(value);
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.08 }}
              className="flex items-center gap-4"
            >
              {/* Icona */}
              <div
                className="w-9 h-9 rounded-[var(--radius-lg)] flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              {/* Label + barra */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-sm font-semibold text-[var(--foreground-secondary)]">
                      {label}
                    </span>
                    <span className="text-xs text-[var(--foreground-tertiary)] ml-2 hidden sm:inline">
                      {description}
                    </span>
                  </div>
                  <span
                    className="text-sm font-bold ml-3 flex-shrink-0"
                    style={{ color }}
                  >
                    {value}
                    <span className="text-xs font-normal text-[var(--foreground-tertiary)]">
                      /10
                    </span>
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--score-bar-bg)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(value / 10) * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.4 + i * 0.1 }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ResultsViewProps {
  result: AdvisorResult;
  fileName: string;
  analysisId?: string;
  onReset: () => void;
}

export default function ResultsView({
  result,
  fileName,
  analysisId,
  onReset,
}: ResultsViewProps) {
  return (
    <div className="max-w-[var(--max-width-results)] mx-auto px-6 pt-28 pb-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-start mb-9 flex-wrap gap-5"
      >
        <div>
          <p className="text-sm text-[var(--foreground-tertiary)] mb-1.5">
            Analisi completata — {fileName}
          </p>
          <h2 className="font-serif text-[var(--text-3xl)]">Ecco cosa abbiamo trovato.</h2>
        </div>
        <FairnessScore score={result.fairnessScore} scores={result.scores} />
      </motion.div>

      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className={CARD_CLASSES}
        style={{
          background: "var(--card-bg)",
          boxShadow: "var(--card-shadow)",
          border: "1px solid var(--card-border)",
        }}
      >
        <h3 className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--foreground-tertiary)] mb-3">
          Riassunto
        </h3>
        <p className="text-[var(--text-md)] leading-[var(--leading-relaxed)] text-[var(--foreground-secondary)]">
          {result.summary}
        </p>
      </motion.div>

      {/* Scoring multidimensionale */}
      {result.scores && <ScoreBreakdown scores={result.scores} />}

      {/* Risks */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25 }}
        className={CARD_CLASSES}
        style={{
          background: "var(--card-bg)",
          boxShadow: "var(--card-shadow)",
          border: "1px solid var(--card-border)",
        }}
      >
        <h3 className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--foreground-tertiary)] mb-4">
          Rischi identificati
        </h3>
        <div className="flex flex-col gap-4">
          {result.risks.map((risk, i) => (
            <RiskCard
              key={i}
              risk={risk}
              index={i}
              analysisId={analysisId}
            />
          ))}
        </div>
      </motion.div>

      {/* Deadlines */}
      {result.deadlines && result.deadlines.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className={CARD_CLASSES}
          style={{
            background: "var(--card-bg)",
            boxShadow: "var(--card-shadow)",
            border: "1px solid var(--card-border)",
          }}
        >
          <h3 className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--foreground-tertiary)] mb-4">
            <Calendar className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            Scadenze chiave
          </h3>
          <div className="flex flex-col gap-3">
            {result.deadlines.map((d, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex gap-4 items-center"
              >
                <span className="text-sm font-bold min-w-[130px] font-mono" style={{ color: "var(--accent)" }}>
                  {d.date}
                </span>
                <span className="text-sm text-[var(--foreground-secondary)]">{d.action}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Actions */}
      {result.actions && result.actions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.55 }}
          className={CARD_CLASSES}
          style={{
            background: "var(--card-bg)",
            boxShadow: "var(--card-shadow)",
            border: "1px solid var(--card-border)",
          }}
        >
          <h3 className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--foreground-tertiary)] mb-4">
            Cosa fare adesso
          </h3>
          <div className="flex flex-col gap-3">
            {result.actions.map((action, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="flex gap-3 items-start"
              >
                <span
                  className="w-6 h-6 rounded-[var(--radius-md)] flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{
                    background: "var(--accent-surface)",
                    border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                    color: "var(--accent)",
                  }}
                >
                  {action.priority || i + 1}
                </span>
                <div>
                  <p className="text-sm text-[var(--foreground-secondary)] leading-[var(--leading-relaxed)]">
                    {action.action}
                  </p>
                  {action.rationale && (
                    <p className="text-xs text-[var(--foreground-tertiary)] mt-1">
                      {action.rationale}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* General Deep Search */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.7 }}
        className={CARD_CLASSES}
        style={{
          background: "var(--card-bg)",
          boxShadow: "var(--card-shadow)",
          border: "1px solid var(--card-border)",
        }}
      >
        <h3 className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--foreground-tertiary)] mb-4">
          Hai altre domande su questo documento?
        </h3>
        <DeepSearchChat
          clauseContext={result.summary}
          existingAnalysis={JSON.stringify(result.risks)}
          analysisId={analysisId}
        />
      </motion.div>

      {/* Lawyer CTA */}
      {result.needsLawyer && (
        <LawyerCTA
          specialization={result.lawyerSpecialization}
          reason={result.lawyerReason}
          analysisId={analysisId}
        />
      )}

      {/* Bottom CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="text-center mt-8"
      >
        <button
          onClick={onReset}
          className="mr-3 px-10 py-4 rounded-full text-base font-bold text-white hover:-translate-y-0.5 transition-all"
          style={{
            background: "linear-gradient(to bottom right, var(--accent), var(--accent-cta-end))",
            boxShadow: "var(--cta-shadow)",
          }}
        >
          Analizza un altro documento
        </button>
        <button className="px-7 py-3 rounded-full text-sm font-medium text-[var(--foreground-secondary)] border border-[var(--border)] hover:border-[var(--border)] hover:text-[var(--foreground)] transition-all">
          <ArrowRight className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Scarica report PDF
        </button>
      </motion.div>
    </div>
  );
}
