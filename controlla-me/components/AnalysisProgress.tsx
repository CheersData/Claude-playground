"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, FileText, Search, Scale, Lightbulb, Loader2 } from "lucide-react";
import type { AgentPhase, PhaseStatus } from "@/lib/types";

/* ── Animated illustrations for each agent ── */

function ClassifierIllustration() {
  return (
    <div className="relative w-28 h-32" style={{ animation: "doc-fade-in 0.6s ease-out" }}>
      {/* Document body */}
      <svg viewBox="0 0 80 100" className="w-full h-full">
        {/* Page shadow */}
        <rect x="8" y="6" width="64" height="88" rx="4" fill="rgba(255,107,53,0.05)" />
        {/* Page */}
        <rect x="4" y="2" width="64" height="88" rx="4" fill="rgba(255,255,255,0.06)" stroke="rgba(255,107,53,0.3)" strokeWidth="1" />
        {/* Folded corner */}
        <path d="M52 2 L68 18 L52 18 Z" fill="rgba(255,107,53,0.15)" stroke="rgba(255,107,53,0.3)" strokeWidth="0.5" />
        {/* Text lines */}
        <rect x="14" y="28" width="36" height="3" rx="1.5" fill="rgba(255,255,255,0.15)" />
        <rect x="14" y="36" width="28" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
        <rect x="14" y="44" width="40" height="3" rx="1.5" fill="rgba(255,255,255,0.15)" />
        <rect x="14" y="52" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
        <rect x="14" y="60" width="34" height="3" rx="1.5" fill="rgba(255,255,255,0.12)" />
        <rect x="14" y="68" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.08)" />
        <rect x="14" y="76" width="38" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
      </svg>
      {/* Scanning line */}
      <div
        className="absolute left-2 right-10 h-[2px] rounded-full"
        style={{
          background: "linear-gradient(90deg, transparent, #FF6B35, rgba(255,107,53,0.6), transparent)",
          animation: "scan-line 2.5s ease-in-out infinite",
          boxShadow: "0 0 12px rgba(255,107,53,0.5)",
        }}
      />
    </div>
  );
}

function AnalyzerIllustration() {
  return (
    <div className="relative w-28 h-32 flex items-center justify-center">
      {/* Text block behind */}
      <svg viewBox="0 0 90 90" className="w-24 h-24 opacity-40">
        <rect x="10" y="15" width="50" height="3" rx="1.5" fill="rgba(255,255,255,0.2)" />
        <rect x="10" y="23" width="40" height="3" rx="1.5" fill="rgba(255,255,255,0.15)" />
        <rect x="10" y="31" width="55" height="3" rx="1.5" fill="rgba(255,255,255,0.2)" />
        <rect x="10" y="39" width="35" height="3" rx="1.5" fill="rgba(255,255,255,0.12)" />
        <rect x="10" y="47" width="48" height="3" rx="1.5" fill="rgba(255,255,255,0.18)" />
        <rect x="10" y="55" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
        <rect x="10" y="63" width="44" height="3" rx="1.5" fill="rgba(255,255,255,0.15)" />
        <rect x="10" y="71" width="52" height="3" rx="1.5" fill="rgba(255,255,255,0.12)" />
        {/* Highlight on some lines */}
        <rect x="10" y="29" width="55" height="9" rx="2" fill="rgba(255,107,53,0.08)" />
        <rect x="10" y="45" width="48" height="9" rx="2" fill="rgba(255,80,80,0.08)" />
      </svg>
      {/* Magnifying glass */}
      <div
        className="absolute"
        style={{
          animation: "mag-sweep 3s ease-in-out infinite, mag-glow 2s ease-in-out infinite",
        }}
      >
        <svg viewBox="0 0 48 48" className="w-14 h-14">
          {/* Lens glow */}
          <circle cx="20" cy="20" r="14" fill="rgba(255,107,53,0.06)" />
          {/* Lens */}
          <circle cx="20" cy="20" r="11" fill="none" stroke="rgba(255,107,53,0.7)" strokeWidth="2.5" />
          <circle cx="20" cy="20" r="11" fill="rgba(255,107,53,0.04)" />
          {/* Lens reflection */}
          <ellipse cx="16" cy="16" rx="4" ry="3" fill="rgba(255,255,255,0.08)" transform="rotate(-20 16 16)" />
          {/* Handle */}
          <line x1="28" y1="28" x2="40" y2="40" stroke="rgba(255,107,53,0.6)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function InvestigatorIllustration() {
  return (
    <div className="relative w-28 h-32 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Pillar */}
        <rect x="46" y="10" width="8" height="50" rx="2" fill="rgba(255,255,255,0.08)" />
        {/* Top triangle / beam */}
        <polygon points="50,8 42,18 58,18" fill="rgba(255,107,53,0.25)" stroke="rgba(255,107,53,0.4)" strokeWidth="0.8" />
        {/* Balance beam */}
        <g style={{ transformOrigin: "50px 20px", animation: "scale-swing 3s ease-in-out infinite" }}>
          <line x1="20" y1="20" x2="80" y2="20" stroke="rgba(255,107,53,0.5)" strokeWidth="2" strokeLinecap="round" />
          {/* Left chain */}
          <line x1="24" y1="20" x2="24" y2="42" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          <line x1="16" y1="20" x2="16" y2="42" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          {/* Right chain */}
          <line x1="76" y1="20" x2="76" y2="42" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          <line x1="84" y1="20" x2="84" y2="42" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          {/* Left pan */}
          <g style={{ transformOrigin: "20px 44px", animation: "pan-left 3s ease-in-out infinite" }}>
            <ellipse cx="20" cy="44" rx="16" ry="4" fill="rgba(255,107,53,0.15)" stroke="rgba(255,107,53,0.3)" strokeWidth="1" />
            {/* Book / law icon */}
            <rect x="13" y="36" width="14" height="6" rx="1" fill="rgba(255,107,53,0.2)" />
            <line x1="20" y1="36" x2="20" y2="42" stroke="rgba(255,107,53,0.4)" strokeWidth="0.5" />
          </g>
          {/* Right pan */}
          <g style={{ transformOrigin: "80px 44px", animation: "pan-right 3s ease-in-out infinite" }}>
            <ellipse cx="80" cy="44" rx="16" ry="4" fill="rgba(255,107,53,0.15)" stroke="rgba(255,107,53,0.3)" strokeWidth="1" />
            {/* Gavel icon */}
            <rect x="74" y="37" width="12" height="5" rx="1.5" fill="rgba(255,107,53,0.2)" />
            <rect x="78" y="35" width="4" height="9" rx="1" fill="rgba(255,107,53,0.25)" />
          </g>
        </g>
        {/* Base */}
        <rect x="34" y="60" width="32" height="4" rx="2" fill="rgba(255,255,255,0.06)" />
        {/* "Norme" text labels floating */}
        <text x="10" y="72" fontSize="5" fill="rgba(255,107,53,0.35)" fontFamily="monospace">Art. 1341</text>
        <text x="55" y="78" fontSize="5" fill="rgba(255,107,53,0.3)" fontFamily="monospace">D.Lgs 122</text>
        <text x="20" y="84" fontSize="4.5" fill="rgba(255,107,53,0.25)" fontFamily="monospace">Cass. 2024</text>
        <text x="50" y="90" fontSize="4.5" fill="rgba(255,107,53,0.2)" fontFamily="monospace">Art. 1469-bis</text>
      </svg>
    </div>
  );
}

function AdvisorIllustration() {
  return (
    <div className="relative w-28 h-32 flex items-center justify-center">
      {/* Rays spinning behind */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: "rays-rotate 12s linear infinite" }}
      >
        <svg viewBox="0 0 100 100" className="w-24 h-24 opacity-30">
          {[...Array(8)].map((_, i) => (
            <line
              key={i}
              x1="50"
              y1="50"
              x2={50 + 40 * Math.cos((i * Math.PI) / 4)}
              y2={50 + 40 * Math.sin((i * Math.PI) / 4)}
              stroke="#FFC832"
              strokeWidth="1"
              strokeLinecap="round"
              opacity={0.4 + (i % 2) * 0.3}
            />
          ))}
        </svg>
      </div>
      {/* Main bulb */}
      <div style={{ animation: "bulb-pulse 2.5s ease-in-out infinite" }}>
        <svg viewBox="0 0 60 80" className="w-16 h-20">
          {/* Outer glow */}
          <circle cx="30" cy="28" r="24" fill="rgba(255,200,50,0.06)" />
          {/* Bulb glass */}
          <circle cx="30" cy="28" r="16" fill="rgba(255,200,50,0.1)" stroke="rgba(255,200,50,0.5)" strokeWidth="1.5" />
          {/* Filament */}
          <path d="M25 30 Q27 22 30 28 Q33 22 35 30" fill="none" stroke="rgba(255,200,50,0.8)" strokeWidth="1.5" strokeLinecap="round" />
          {/* Bulb base */}
          <rect x="24" y="44" width="12" height="8" rx="2" fill="rgba(255,255,255,0.1)" stroke="rgba(255,200,50,0.3)" strokeWidth="1" />
          <line x1="24" y1="47" x2="36" y2="47" stroke="rgba(255,200,50,0.2)" strokeWidth="0.8" />
          <line x1="24" y1="50" x2="36" y2="50" stroke="rgba(255,200,50,0.2)" strokeWidth="0.8" />
          {/* Connection to glass */}
          <path d="M24 44 Q24 40 22 36" fill="none" stroke="rgba(255,200,50,0.3)" strokeWidth="1" />
          <path d="M36 44 Q36 40 38 36" fill="none" stroke="rgba(255,200,50,0.3)" strokeWidth="1" />
        </svg>
      </div>
      {/* Floating sparkles */}
      {[
        { x: "15%", y: "20%", delay: "0s" },
        { x: "75%", y: "15%", delay: "0.8s" },
        { x: "80%", y: "55%", delay: "1.6s" },
        { x: "10%", y: "60%", delay: "2.2s" },
      ].map((spark, i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-yellow-300/60"
          style={{
            left: spark.x,
            top: spark.y,
            animation: `idea-spark 2s ease-in-out infinite`,
            animationDelay: spark.delay,
          }}
        />
      ))}
    </div>
  );
}

/** Map phase key to its animated illustration */
const ILLUSTRATIONS: Record<AgentPhase, () => React.ReactNode> = {
  classifier: ClassifierIllustration,
  analyzer: AnalyzerIllustration,
  investigator: InvestigatorIllustration,
  advisor: AdvisorIllustration,
};

/* ── Phase config ── */

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

  const ActiveIllustration = currentPhase ? ILLUSTRATIONS[currentPhase] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-10 md:p-12 max-w-[480px] w-full text-center"
    >
      <p className="text-sm text-white/35 mb-2">Analisi in corso</p>
      <p className="text-base font-semibold text-white/70 mb-6 break-all">
        {fileName}
      </p>

      {/* Animated illustration for the active agent */}
      <div className="flex justify-center mb-8 h-32">
        <AnimatePresence mode="wait">
          {ActiveIllustration && (
            <motion.div
              key={currentPhase}
              initial={{ opacity: 0, scale: 0.85, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <ActiveIllustration />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
