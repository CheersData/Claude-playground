"use client";

import { motion } from "framer-motion";
import { Calendar, ArrowRight } from "lucide-react";
import FairnessScore from "./FairnessScore";
import RiskCard from "./RiskCard";
import DeepSearchChat from "./DeepSearchChat";
import LawyerCTA from "./LawyerCTA";
import type { AdvisorResult } from "@/lib/types";

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
          <p className="text-sm text-gray-400 mb-1.5">
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
        className="bg-white shadow-sm border border-gray-200 rounded-2xl p-6 mb-5"
      >
        <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-gray-400 mb-3">
          Riassunto
        </h3>
        <p className="text-[15px] leading-relaxed text-gray-600">
          {result.summary}
        </p>
      </motion.div>

      {/* Risks */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25 }}
        className="bg-white shadow-sm border border-gray-200 rounded-2xl p-6 mb-5"
      >
        <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-gray-400 mb-4">
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
          className="bg-white shadow-sm border border-gray-200 rounded-2xl p-6 mb-5"
        >
          <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-gray-400 mb-4">
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
                <span className="text-sm text-gray-500">{d.action}</span>
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
          className="bg-white shadow-sm border border-gray-200 rounded-2xl p-6 mb-5"
        >
          <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-gray-400 mb-4">
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
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {action.action}
                  </p>
                  {action.rationale && (
                    <p className="text-xs text-gray-400 mt-1">
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
        className="bg-white shadow-sm border border-gray-200 rounded-2xl p-6 mb-5"
      >
        <h3 className="text-[11px] font-bold tracking-[2px] uppercase text-gray-400 mb-4">
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
        <button className="px-7 py-3 rounded-full text-sm font-medium text-gray-600 border border-gray-200 hover:border-gray-300 hover:text-[#1A1A2E] transition-all">
          <ArrowRight className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Scarica report PDF
        </button>
      </motion.div>
    </div>
  );
}
