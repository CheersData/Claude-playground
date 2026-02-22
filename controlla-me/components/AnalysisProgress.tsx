"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, FileText, Search, Scale, Lightbulb, Loader2, Clock } from "lucide-react";
import type { AgentPhase, PhaseStatus } from "@/lib/types";

/* ── ETA estimation config ── */

/** Fallback durations if no historical data is available (seconds) */
const DEFAULT_ESTIMATES: Record<AgentPhase, number> = {
  classifier: 12,
  analyzer: 25,
  investigator: 22,
  advisor: 18,
};

const PHASE_ORDER: AgentPhase[] = ["classifier", "analyzer", "investigator", "advisor"];

/** Build cumulative milestones from estimates (e.g. {classifier:15, analyzer:48, ...}) */
function buildMilestones(estimates: Record<AgentPhase, number>): Record<AgentPhase, number> {
  const total = PHASE_ORDER.reduce((s, p) => s + (estimates[p] ?? 0), 0);
  if (total <= 0) return { classifier: 15, analyzer: 48, investigator: 77, advisor: 95 };
  let cum = 0;
  const milestones: Partial<Record<AgentPhase, number>> = {};
  for (const p of PHASE_ORDER) {
    cum += (estimates[p] ?? 0);
    // Scale to 0-95 range (last 5% is reserved for "truly done")
    milestones[p] = (cum / total) * 95;
  }
  return milestones as Record<AgentPhase, number>;
}

/** Format seconds as m:ss */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Circular progress ring ── */

function ProgressRing({ progress, size = 160, stroke = 4 }: { progress: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 m-auto -rotate-90"
      style={{ filter: "drop-shadow(0 0 8px rgba(255,107,53,0.3))" }}
    >
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(0,0,0,0.06)"
        strokeWidth={stroke}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#progressGradient)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
      />
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF6B35" />
          <stop offset="100%" stopColor="#FFC832" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Timer / ETA hook ── */

function useAnalysisTimer(
  currentPhase: AgentPhase | null,
  completedPhases: AgentPhase[],
  dynamicEstimates?: Record<AgentPhase, number> | null
) {
  const startTimeRef = useRef<number | null>(null);
  const phaseStartRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [smoothProgress, setSmoothProgress] = useState(0);

  // Use dynamic estimates (from cache averages) or fall back to defaults
  // Memoize to keep stable references for useEffect dependencies
  const estimates = useMemo(
    () => dynamicEstimates ?? DEFAULT_ESTIMATES,
    // Only recompute when the individual values change, not the object reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dynamicEstimates?.classifier, dynamicEstimates?.analyzer, dynamicEstimates?.investigator, dynamicEstimates?.advisor]
  );
  const totalEstimated = useMemo(
    () => PHASE_ORDER.reduce((s, p) => s + (estimates[p] ?? 0), 0) || 1,
    [estimates]
  );
  const milestones = useMemo(() => buildMilestones(estimates), [estimates]);

  // Start global timer when first phase begins
  useEffect(() => {
    if (currentPhase && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
  }, [currentPhase]);

  // Track phase start for intra-phase progress
  useEffect(() => {
    if (currentPhase) {
      phaseStartRef.current = Date.now();
    }
  }, [currentPhase]);

  // Tick every 500ms for smooth updates
  useEffect(() => {
    if (!currentPhase) return;
    const interval = setInterval(() => {
      const now = Date.now();

      // Update elapsed
      if (startTimeRef.current) {
        setElapsed((now - startTimeRef.current) / 1000);
      }

      // ── Calculate target progress ──

      // 1. Milestone floor from completed phases
      let milestoneFloor = 0;
      for (const p of completedPhases) {
        milestoneFloor = Math.max(milestoneFloor, milestones[p] ?? 0);
      }

      // 2. Intra-phase partial progress (ease-out curve for natural deceleration)
      let intraPhase = 0;
      if (currentPhase && phaseStartRef.current) {
        const est = estimates[currentPhase] ?? 1;
        const phaseElapsed = Math.max((now - phaseStartRef.current) / 1000, 0);
        // ease-out: fast start, slows near end — feels more natural
        const linearRatio = Math.min(phaseElapsed / est, 0.92);
        const easedRatio = 1 - Math.pow(1 - linearRatio, 2.2);

        // Find what range this phase covers
        const phaseIdx = PHASE_ORDER.indexOf(currentPhase);
        const prevMilestone = phaseIdx > 0
          ? milestones[PHASE_ORDER[phaseIdx - 1]]
          : 0;
        const nextMilestone = milestones[currentPhase];
        const phaseRange = nextMilestone - prevMilestone;

        intraPhase = easedRatio * phaseRange;
      }

      // 3. Time-based floor — progress should never be less than what the
      //    wall clock says, so it doesn't feel "stuck" even if phases are slow
      const timeFloor = (elapsed / totalEstimated) * 85; // cap time-floor at 85%

      // Target = best of milestone + intra-phase, or time floor
      const rawTarget = Math.max(milestoneFloor + intraPhase, timeFloor);
      const target = Number.isFinite(rawTarget) ? Math.min(rawTarget, 95) : 0;

      // ── Smooth toward target (exponential ease + minimum step) ──
      setSmoothProgress((prev) => {
        if (target <= prev) return prev; // never go backwards
        // Close 25% of the gap each tick (500ms), with a minimum step of 0.3%
        const step = Math.max((target - prev) * 0.25, 0.3);
        return Math.min(prev + step, target);
      });
    }, 500);

    return () => clearInterval(interval);
  }, [currentPhase, completedPhases, elapsed, estimates, milestones, totalEstimated]);

  // ETA based on smoothed progress
  const remaining = smoothProgress > 1
    ? Math.max(((100 - smoothProgress) / smoothProgress) * elapsed, 5)
    : totalEstimated;
  const safeRemaining = Number.isFinite(remaining) ? remaining : totalEstimated;

  return { elapsed, remaining: safeRemaining, progress: smoothProgress };
}

/* ── Animated illustrations for each agent ── */

function ClassifierIllustration() {
  return (
    <div className="relative w-32 h-32" style={{ animation: "doc-fade-in 0.6s ease-out" }}>
      <svg viewBox="0 0 80 100" className="w-full h-full">
        {/* Page shadow */}
        <rect x="8" y="6" width="64" height="88" rx="4" fill="rgba(255,107,53,0.12)" />
        {/* Page */}
        <rect x="4" y="2" width="64" height="88" rx="4" fill="rgba(26,26,46,0.1)" stroke="#FF6B35" strokeWidth="1.5" />
        {/* Folded corner */}
        <path d="M52 2 L68 18 L52 18 Z" fill="rgba(255,107,53,0.35)" stroke="#FF6B35" strokeWidth="0.8" />
        {/* Text lines */}
        <rect x="14" y="28" width="36" height="3" rx="1.5" fill="rgba(26,26,46,0.35)" />
        <rect x="14" y="36" width="28" height="3" rx="1.5" fill="rgba(26,26,46,0.25)" />
        <rect x="14" y="44" width="40" height="3" rx="1.5" fill="rgba(26,26,46,0.35)" />
        <rect x="14" y="52" width="24" height="3" rx="1.5" fill="rgba(26,26,46,0.25)" />
        <rect x="14" y="60" width="34" height="3" rx="1.5" fill="rgba(26,26,46,0.3)" />
        <rect x="14" y="68" width="30" height="3" rx="1.5" fill="rgba(26,26,46,0.2)" />
        <rect x="14" y="76" width="38" height="3" rx="1.5" fill="rgba(26,26,46,0.25)" />
      </svg>
      {/* Scanning line */}
      <div
        className="absolute left-2 right-8 h-[3px] rounded-full"
        style={{
          background: "linear-gradient(90deg, transparent 0%, #FF6B35 30%, #FF6B35 70%, transparent 100%)",
          animation: "scan-line 2.5s ease-in-out infinite",
          boxShadow: "0 0 16px rgba(255,107,53,0.8), 0 0 4px rgba(255,107,53,1)",
        }}
      />
    </div>
  );
}

function AnalyzerIllustration() {
  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      {/* Text block behind */}
      <svg viewBox="0 0 90 90" className="w-28 h-28 opacity-70">
        <rect x="10" y="15" width="50" height="3" rx="1.5" fill="rgba(26,26,46,0.35)" />
        <rect x="10" y="23" width="40" height="3" rx="1.5" fill="rgba(26,26,46,0.25)" />
        <rect x="10" y="31" width="55" height="3" rx="1.5" fill="rgba(26,26,46,0.35)" />
        <rect x="10" y="39" width="35" height="3" rx="1.5" fill="rgba(26,26,46,0.2)" />
        <rect x="10" y="47" width="48" height="3" rx="1.5" fill="rgba(26,26,46,0.3)" />
        <rect x="10" y="55" width="30" height="3" rx="1.5" fill="rgba(26,26,46,0.2)" />
        <rect x="10" y="63" width="44" height="3" rx="1.5" fill="rgba(26,26,46,0.25)" />
        <rect x="10" y="71" width="52" height="3" rx="1.5" fill="rgba(26,26,46,0.2)" />
        {/* Highlight on risky lines */}
        <rect x="8" y="29" width="58" height="9" rx="2" fill="rgba(255,107,53,0.2)" stroke="rgba(255,107,53,0.3)" strokeWidth="0.5" />
        <rect x="8" y="45" width="52" height="9" rx="2" fill="rgba(255,60,60,0.2)" stroke="rgba(255,60,60,0.3)" strokeWidth="0.5" />
      </svg>
      {/* Magnifying glass */}
      <div
        className="absolute"
        style={{
          animation: "mag-sweep 3s ease-in-out infinite, mag-glow 2s ease-in-out infinite",
        }}
      >
        <svg viewBox="0 0 48 48" className="w-16 h-16">
          {/* Lens glow */}
          <circle cx="20" cy="20" r="14" fill="rgba(255,107,53,0.15)" />
          {/* Lens */}
          <circle cx="20" cy="20" r="11" fill="rgba(255,107,53,0.08)" stroke="#FF6B35" strokeWidth="2.5" />
          {/* Lens reflection */}
          <ellipse cx="16" cy="16" rx="4" ry="3" fill="rgba(26,26,46,0.15)" transform="rotate(-20 16 16)" />
          {/* Handle */}
          <line x1="28" y1="28" x2="40" y2="40" stroke="#FF6B35" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function InvestigatorIllustration() {
  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Pillar */}
        <rect x="46" y="10" width="8" height="50" rx="2" fill="rgba(26,26,46,0.15)" />
        {/* Top triangle */}
        <polygon points="50,6 40,18 60,18" fill="rgba(255,107,53,0.4)" stroke="#FF6B35" strokeWidth="1" />
        {/* Balance beam */}
        <g style={{ transformOrigin: "50px 20px", animation: "scale-swing 3s ease-in-out infinite" }}>
          <line x1="18" y1="20" x2="82" y2="20" stroke="#FF6B35" strokeWidth="2.5" strokeLinecap="round" />
          {/* Left chain */}
          <line x1="22" y1="20" x2="22" y2="42" stroke="rgba(26,26,46,0.3)" strokeWidth="1.2" />
          <line x1="14" y1="20" x2="14" y2="42" stroke="rgba(26,26,46,0.3)" strokeWidth="1.2" />
          {/* Right chain */}
          <line x1="78" y1="20" x2="78" y2="42" stroke="rgba(26,26,46,0.3)" strokeWidth="1.2" />
          <line x1="86" y1="20" x2="86" y2="42" stroke="rgba(26,26,46,0.3)" strokeWidth="1.2" />
          {/* Left pan */}
          <g style={{ transformOrigin: "18px 44px", animation: "pan-left 3s ease-in-out infinite" }}>
            <ellipse cx="18" cy="44" rx="16" ry="4" fill="rgba(255,107,53,0.3)" stroke="#FF6B35" strokeWidth="1" />
            <rect x="11" y="36" width="14" height="6" rx="1" fill="rgba(255,107,53,0.4)" />
            <line x1="18" y1="36" x2="18" y2="42" stroke="#FF6B35" strokeWidth="0.8" />
          </g>
          {/* Right pan */}
          <g style={{ transformOrigin: "82px 44px", animation: "pan-right 3s ease-in-out infinite" }}>
            <ellipse cx="82" cy="44" rx="16" ry="4" fill="rgba(255,107,53,0.3)" stroke="#FF6B35" strokeWidth="1" />
            <rect x="76" y="37" width="12" height="5" rx="1.5" fill="rgba(255,107,53,0.4)" />
            <rect x="80" y="35" width="4" height="9" rx="1" fill="rgba(255,107,53,0.5)" />
          </g>
        </g>
        {/* Base */}
        <rect x="34" y="60" width="32" height="4" rx="2" fill="rgba(26,26,46,0.12)" />
        {/* Law references */}
        <text x="8" y="72" fontSize="5.5" fill="rgba(255,107,53,0.7)" fontFamily="monospace">Art. 1341</text>
        <text x="55" y="78" fontSize="5.5" fill="rgba(255,107,53,0.6)" fontFamily="monospace">D.Lgs 122</text>
        <text x="18" y="84" fontSize="5" fill="rgba(255,107,53,0.5)" fontFamily="monospace">Cass. 2024</text>
        <text x="48" y="92" fontSize="5" fill="rgba(255,107,53,0.45)" fontFamily="monospace">Art. 1469-bis</text>
      </svg>
    </div>
  );
}

function AdvisorIllustration() {
  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      {/* Rays spinning behind */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: "rays-rotate 12s linear infinite" }}
      >
        <svg viewBox="0 0 100 100" className="w-28 h-28 opacity-50">
          {[...Array(8)].map((_, i) => (
            <line
              key={i}
              x1="50"
              y1="50"
              x2={50 + 40 * Math.cos((i * Math.PI) / 4)}
              y2={50 + 40 * Math.sin((i * Math.PI) / 4)}
              stroke="#FFC832"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={0.5 + (i % 2) * 0.3}
            />
          ))}
        </svg>
      </div>
      {/* Main bulb */}
      <div style={{ animation: "bulb-pulse 2.5s ease-in-out infinite" }}>
        <svg viewBox="0 0 60 80" className="w-20 h-24">
          {/* Outer glow */}
          <circle cx="30" cy="28" r="24" fill="rgba(255,200,50,0.12)" />
          {/* Bulb glass */}
          <circle cx="30" cy="28" r="16" fill="rgba(255,200,50,0.2)" stroke="rgba(255,200,50,0.8)" strokeWidth="2" />
          {/* Filament */}
          <path d="M25 30 Q27 22 30 28 Q33 22 35 30" fill="none" stroke="#FFC832" strokeWidth="2" strokeLinecap="round" />
          {/* Bulb base */}
          <rect x="24" y="44" width="12" height="8" rx="2" fill="rgba(26,26,46,0.15)" stroke="rgba(255,200,50,0.5)" strokeWidth="1.2" />
          <line x1="24" y1="47" x2="36" y2="47" stroke="rgba(255,200,50,0.4)" strokeWidth="1" />
          <line x1="24" y1="50" x2="36" y2="50" stroke="rgba(255,200,50,0.4)" strokeWidth="1" />
          {/* Connection to glass */}
          <path d="M24 44 Q24 40 22 36" fill="none" stroke="rgba(255,200,50,0.5)" strokeWidth="1.2" />
          <path d="M36 44 Q36 40 38 36" fill="none" stroke="rgba(255,200,50,0.5)" strokeWidth="1.2" />
        </svg>
      </div>
      {/* Floating sparkles */}
      {[
        { x: "12%", y: "18%", delay: "0s" },
        { x: "78%", y: "12%", delay: "0.8s" },
        { x: "82%", y: "58%", delay: "1.6s" },
        { x: "8%", y: "62%", delay: "2.2s" },
      ].map((spark, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-yellow-300/80"
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
  onRetry?: () => void;
  sessionId?: string | null;
  /** Real average timings from cache (seconds per phase). Falls back to defaults. */
  phaseEstimates?: Record<string, number> | null;
}

export default function AnalysisProgress({
  fileName,
  currentPhase,
  completedPhases,
  error,
  onReset,
  onRetry,
  sessionId,
  phaseEstimates,
}: AnalysisProgressProps) {
  const { elapsed, remaining, progress } = useAnalysisTimer(
    currentPhase,
    completedPhases,
    phaseEstimates as Record<AgentPhase, number> | null | undefined
  );

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
      className="bg-white shadow-sm border border-border rounded-3xl p-10 md:p-12 max-w-[520px] w-full text-center"
    >
      <p className="text-sm text-foreground-tertiary mb-2">Analisi in corso</p>
      <p className="text-base font-semibold text-foreground-secondary mb-6 break-all">
        {fileName}
      </p>

      {/* Animated illustration with progress ring */}
      <div className="relative flex justify-center mb-4" style={{ height: 168 }}>
        {/* Progress ring around illustration */}
        <ProgressRing progress={progress} size={168} stroke={4} />

        {/* Illustration centered inside the ring */}
        <div className="absolute inset-0 flex items-center justify-center">
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
      </div>

      {/* Timer + ETA row */}
      {currentPhase && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center gap-6 mb-6"
        >
          {/* Elapsed time */}
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-foreground-tertiary" />
            <span className="text-xs text-foreground-secondary font-mono tabular-nums">
              {formatTime(elapsed)}
            </span>
          </div>

          {/* Percentage */}
          <motion.span
            key={Math.floor(progress)}
            className="text-lg font-bold bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent"
          >
            {Math.floor(progress)}%
          </motion.span>

          {/* ETA */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-foreground-tertiary">~</span>
            <span className="text-xs text-foreground-secondary font-mono tabular-nums">
              {formatTime(remaining)}
            </span>
            <span className="text-xs text-foreground-tertiary">rimasti</span>
          </div>
        </motion.div>
      )}

      {/* Global progress bar */}
      {currentPhase && (
        <div className="mb-8 mx-2">
          <div className="h-[3px] rounded-full bg-border overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #FF6B35 0%, #FFC832 100%)",
                boxShadow: "0 0 12px rgba(255,107,53,0.5)",
              }}
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>
      )}

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
                      : "bg-background-secondary border-border text-foreground-tertiary"
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
                      ? "font-semibold text-foreground"
                      : "font-normal text-foreground-tertiary"
                  }`}
                >
                  {isDone ? phase.doneLabel : phase.label}
                </p>

                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-1.5 h-[3px] rounded-full bg-border overflow-hidden"
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

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* Primary: resume from cache */}
            {onRetry && sessionId && (
              <button
                onClick={onRetry}
                className="px-8 py-3 rounded-full text-sm font-bold text-white bg-gradient-to-br from-accent to-[#E8451A] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(255,107,53,0.35)] transition-all"
              >
                Riprova da dove eri
              </button>
            )}

            {/* Secondary: start over */}
            {onReset && (
              <button
                onClick={onReset}
                className="px-8 py-3 rounded-full text-sm font-bold text-foreground-secondary border border-border hover:bg-surface-hover hover:-translate-y-0.5 transition-all"
              >
                {sessionId ? "Ricomincia da capo" : "Riprova"}
              </button>
            )}
          </div>

          {sessionId && (
            <p className="text-xs text-foreground-tertiary mt-3">
              Sessione salvata &middot; i passaggi completati non verranno ripetuti
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
