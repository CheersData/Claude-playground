"use client";

import { motion } from "framer-motion";

type AgentPhase = "classifier" | "analyzer" | "investigator" | "advisor";

const PHASE_LABELS: Record<AgentPhase, string> = {
  classifier:   "Il Classificatore sta analizzando il documento…",
  analyzer:     "L'Analista sta esaminando le clausole…",
  investigator: "L'Investigatore sta ricercando la normativa…",
  advisor:      "Il Consulente sta elaborando la valutazione finale…",
};

const PHASE_COLORS: Record<AgentPhase, string> = {
  classifier:   "#4ECDC4",
  analyzer:     "#FF6B6B",
  investigator: "#A78BFA",
  advisor:      "#FFC832",
};

const PHASE_ORDER: AgentPhase[] = ["classifier", "analyzer", "investigator", "advisor"];

interface ActivityBannerProps {
  currentPhase: AgentPhase | null;
  completedCount: number;
}

export default function ActivityBanner({ currentPhase, completedCount }: ActivityBannerProps) {
  if (!currentPhase) return null;

  const label = PHASE_LABELS[currentPhase];
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
        {PHASE_ORDER.map((phase, i) => {
          const isDone    = i < completedCount;
          const isRunning = phase === currentPhase;
          return (
            <motion.div
              key={phase}
              className="h-1.5 w-6 rounded-full"
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
