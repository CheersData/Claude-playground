"use client";

import { motion } from "framer-motion";
import { Check, FileText, Search, Scale, Lightbulb, Loader2 } from "lucide-react";
import type { AgentPhase, PhaseStatus } from "@/lib/types";

const PHASES: {
  key: AgentPhase;
  icon: React.ReactNode;
  label: string;
  doneLabel: string;
}[] = [
  {
    key: "classifier",
    icon: <FileText className="w-5 h-5" />,
    label: "Classificazione documento...",
    doneLabel: "Documento classificato",
  },
  {
    key: "analyzer",
    icon: <Search className="w-5 h-5" />,
    label: "Analisi clausole e rischi...",
    doneLabel: "Clausole analizzate",
  },
  {
    key: "investigator",
    icon: <Scale className="w-5 h-5" />,
    label: "Ricerca norme e sentenze...",
    doneLabel: "Norme e sentenze trovate",
  },
  {
    key: "advisor",
    icon: <Lightbulb className="w-5 h-5" />,
    label: "Generazione report finale...",
    doneLabel: "Report generato",
  },
];

interface AnalysisProgressProps {
  fileName: string;
  currentPhase: AgentPhase | null;
  completedPhases: AgentPhase[];
  error?: string;
  onReset?: () => void;
}

export default function AnalysisProgress({
  fileName,
  currentPhase,
  completedPhases,
  error,
  onReset,
}: AnalysisProgressProps) {
  const getPhaseStatus = (phase: AgentPhase): PhaseStatus | "pending" => {
    if (completedPhases.includes(phase)) return "done";
    if (currentPhase === phase) return "running";
    return "pending";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-10 md:p-12 max-w-[480px] w-full text-center"
    >
      <p className="text-sm text-white/35 mb-2">Analisi in corso</p>
      <p className="text-base font-semibold text-white/70 mb-10 break-all">
        {fileName}
      </p>

      <div className="flex flex-col gap-5">
        {PHASES.map((phase) => {
          const status = getPhaseStatus(phase.key);
          const isDone = status === "done";
          const isActive = status === "running";
          const isPending = status === "pending";

          return (
            <div
              key={phase.key}
              className={`flex items-center gap-4 transition-opacity ${
                isPending ? "opacity-25" : "opacity-100"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-all
                  ${
                    isDone
                      ? "bg-green-500/10 border-green-500/20 text-green-400"
                      : isActive
                      ? "bg-accent/10 border-accent/30 text-accent"
                      : "bg-white/[0.04] border-transparent text-white/30"
                  }`}
              >
                {isDone ? (
                  <Check className="w-5 h-5" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  phase.icon
                )}
              </div>

              <div className="flex-1 text-left">
                <p
                  className={`text-sm transition-all ${
                    isDone
                      ? "font-normal text-green-400/80"
                      : isActive
                      ? "font-semibold text-white"
                      : "font-normal text-white/30"
                  }`}
                >
                  {isDone ? phase.doneLabel : phase.label}
                </p>

                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-1.5 h-[3px] rounded-full bg-white/[0.06] overflow-hidden"
                  >
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-amber-400"
                      initial={{ width: "0%" }}
                      animate={{ width: "80%" }}
                      transition={{ duration: 15, ease: "linear" }}
                    />
                  </motion.div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6"
        >
          <p className="text-sm text-red-400 mb-4">{error}</p>
          {onReset && (
            <button
              onClick={onReset}
              className="px-8 py-3 rounded-full text-sm font-bold text-white bg-gradient-to-br from-accent to-[#E8451A] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(255,107,53,0.35)] transition-all"
            >
              Riprova
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
