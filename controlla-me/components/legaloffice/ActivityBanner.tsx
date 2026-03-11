"use client";

import { motion } from "framer-motion";
import type { LegalOfficePhase } from "@/lib/types";

const PHASE_LABELS: Record<LegalOfficePhase, string> = {
  comprensione:    "La Comprensione sta analizzando la domanda…",
  classifier:      "Il Classificatore sta analizzando il documento…",
  analyzer:        "L'Analista sta esaminando le clausole…",
  "corpus-search": "La Ricerca Corpus sta consultando gli articoli legislativi…",
  investigator:    "L'Investigatore sta ricercando la normativa…",
  advisor:         "Il Consulente sta elaborando la valutazione finale…",
};

const PHASE_LABELS_QA: Record<LegalOfficePhase, string> = {
  comprensione:    "La Comprensione sta riformulando in linguaggio giuridico…",
  classifier:      "Il Classificatore sta analizzando la questione legale…",
  analyzer:        "L'Analista sta esaminando le implicazioni giuridiche…",
  "corpus-search": "La Ricerca Corpus sta consultando gli articoli legislativi…",
  investigator:    "L'Investigatore sta cercando normativa e giurisprudenza…",
  advisor:         "Il Consulente sta formulando il parere…",
};

const PHASE_COLORS: Record<LegalOfficePhase, string> = {
  comprensione:    "#06B6D4",
  classifier:      "#4ECDC4",
  analyzer:        "#FF6B6B",
  "corpus-search": "#818CF8",
  investigator:    "#A78BFA",
  advisor:         "#FFC832",
};

const PHASE_ORDER: LegalOfficePhase[] = ["comprensione", "classifier", "analyzer", "corpus-search", "investigator", "advisor"];

interface ActivityBannerProps {
  currentPhase: LegalOfficePhase | null;
  completedPhases: LegalOfficePhase[];
  qaMode?: boolean;
  visiblePhases?: LegalOfficePhase[];
}

export default function ActivityBanner({ currentPhase, completedPhases, qaMode = false, visiblePhases }: ActivityBannerProps) {
  if (!currentPhase) return null;

  const phases = visiblePhases || PHASE_ORDER;
  const label = qaMode ? PHASE_LABELS_QA[currentPhase] : PHASE_LABELS[currentPhase];
  const color = PHASE_COLORS[currentPhase];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex-none flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-100"
    >
      {/* Progress segments */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {phases.map((phase) => {
          const isDone    = completedPhases.includes(phase);
          const isRunning = phase === currentPhase;
          return (
            <motion.div
              key={phase}
              className="h-1.5 w-5 rounded-full"
              style={{ backgroundColor: isDone || isRunning ? PHASE_COLORS[phase] : "#e5e7eb" }}
              animate={isRunning ? { opacity: [1, 0.4, 1] } : {}}
              transition={isRunning ? { duration: 1.2, repeat: Infinity } : {}}
            />
          );
        })}
      </div>

      {/* Label */}
      <p className="text-xs text-amber-700 font-medium flex-1 font-sans">
        {label}
      </p>

      {/* Pulsing dot */}
      <motion.div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    </motion.div>
  );
}
