"use client";

import type React from "react";
import { motion } from "framer-motion";
import { Calendar, ArrowRight, Scale, Gavel, TrendingUp } from "lucide-react";
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
    key: "legalCompliance",
    label: "Aderenza legale",
    description: "Conformità al quadro normativo vigente",
    Icon: Gavel,
  },
  {
    key: "contractBalance",
    label: "Equilibrio contratto",
    description: "Bilanciamento tra le parti contrattuali",
    Icon: Scale,
  },
  {
    key: "industryPractice",
    label: "Prassi di settore",
    description: "Conformità agli standard di mercato",
    Icon: TrendingUp,
  },
];

function getScoreColor(value: number): string {
  if (value >= 7) return "#2ECC40";
  if (value >= 5) return "#FF851B";
  return "#FF4136";
}

function ScoreBreakdown({ scores }: { scores: MultiDimensionalScore }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.18 }}
      className="bg-white shadow-sm border border-border rounded-2xl p-6 mb-5"
    >
      <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-foreground-tertiary mb-4">
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
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${color}14` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              {/* Label + barra */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-sm font-semibold text-foreground-secondary">
                      {label}
                    </span>
                    <span className="text-xs text-foreground-tertiary ml-2 hidden sm:inline">
                      {description}
                    </span>
                  </div>
                  <span
                    className="text-sm font-bold ml-3 flex-shrink-0"
                    style={{ color }}
                  >
                    {value}
                    <span className="text-xs font-normal text-foreground-tertiary">
                      /10
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
    <div className="max-w-[720px] mx-auto px-6 pt-28 pb-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-start mb-9 flex-wrap gap-5"
      >
        <div>
          <p className="text-sm text-foreground-tertiary mb-1.5">
            Analisi completata — {fileName}
          </p>
          <h2 className="font-serif text-3xl">Ecco cosa abbiamo trovato.</h2>
        </div>
        <FairnessScore score={result.fairnessScore} scores={result.scores} />
      </motion.div>

      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-white shadow-sm border border-border rounded-2xl p-6 mb-5"
      >
        <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-foreground-tertiary mb-3">
          Riassunto
        </h3>
        <p className="text-[15px] leading-relaxed text-foreground-secondary">
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
        className="bg-white shadow-sm border border-border rounded-2xl p-6 mb-5"
      >
        <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-foreground-tertiary mb-4">
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
          className="bg-white shadow-sm border border-border rounded-2xl p-6 mb-5"
        >
          <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-foreground-tertiary mb-4">
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
                <span className="text-sm font-bold text-accent min-w-[130px] font-mono">
                  {d.date}
                </span>
                <span className="text-sm text-foreground-secondary">{d.action}</span>
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
          className="bg-white shadow-sm border border-border rounded-2xl p-6 mb-5"
        >
          <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-foreground-tertiary mb-4">
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
                <span className="w-6 h-6 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0 mt-0.5">
                  {action.priority || i + 1}
                </span>
                <div>
                  <p className="text-sm text-foreground-secondary leading-relaxed">
                    {action.action}
                  </p>
                  {action.rationale && (
                    <p className="text-xs text-foreground-tertiary mt-1">
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
        className="bg-white shadow-sm border border-border rounded-2xl p-6 mb-5"
      >
        <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-foreground-tertiary mb-4">
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
          className="mr-3 px-10 py-4 rounded-full text-base font-bold text-white bg-gradient-to-br from-accent to-[#E8451A] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(255,107,53,0.35)] transition-all"
        >
          Analizza un altro documento
        </button>
        <button className="px-7 py-3 rounded-full text-sm font-medium text-foreground-secondary border border-border hover:border-border hover:text-foreground transition-all">
          <ArrowRight className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Scarica report PDF
        </button>
      </motion.div>
    </div>
  );
}
