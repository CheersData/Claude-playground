"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  Clock,
  FileAudio,
  Headphones,
  BarChart3,
  Sparkles,
} from "lucide-react";

/* ══════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════ */

export type MusicPhase = "ingest" | "stem" | "analysis" | "synthesis";
export type MusicPhaseStatus = "pending" | "running" | "done" | "skipped";

export interface MusicAnalysisProgressProps {
  fileName: string;
  currentPhase: MusicPhase | null;
  completedPhases: MusicPhase[];
  error?: string;
  onReset?: () => void;
  onRetry?: () => void;
  sessionId?: string | null;
  /** Optional per-phase time estimates in seconds */
  phaseEstimates?: Partial<Record<MusicPhase, number>> | null;
  /** Summary data for completed phases */
  phaseResults?: Record<string, unknown>;
}

/* ══════════════════════════════════════════════════════
   Constants & Phase config
   ══════════════════════════════════════════════════════ */

const MUSIC_ACCENT = "#FF6B35";
const MUSIC_TEAL = "#4ECDC4";
const MUSIC_VIOLET = "#A78BFA";
const MUSIC_GOLD = "#FFC832";

const PHASE_ORDER: MusicPhase[] = ["ingest", "stem", "analysis", "synthesis"];

const DEFAULT_ESTIMATES: Record<MusicPhase, number> = {
  ingest: 8,
  stem: 20,
  analysis: 15,
  synthesis: 12,
};

const PHASES: {
  key: MusicPhase;
  icon: React.ReactNode;
  label: string;
  doneLabel: string;
  color: string;
}[] = [
  {
    key: "ingest",
    icon: <FileAudio className="w-5 h-5" />,
    label: "Caricamento e decodifica audio...",
    doneLabel: "Audio decodificato",
    color: MUSIC_TEAL,
  },
  {
    key: "stem",
    icon: <Headphones className="w-5 h-5" />,
    label: "Separazione stems (voce, batteria, basso, altro)...",
    doneLabel: "Stems separati",
    color: MUSIC_ACCENT,
  },
  {
    key: "analysis",
    icon: <BarChart3 className="w-5 h-5" />,
    label: "Analisi Audio DNA e trend di mercato...",
    doneLabel: "Analisi completata",
    color: MUSIC_VIOLET,
  },
  {
    key: "synthesis",
    icon: <Sparkles className="w-5 h-5" />,
    label: "Generazione consigli e report finale...",
    doneLabel: "Report generato",
    color: MUSIC_GOLD,
  },
];

/* ══════════════════════════════════════════════════════
   Utility: milestones & formatting
   ══════════════════════════════════════════════════════ */

function buildMilestones(estimates: Record<MusicPhase, number>): Record<MusicPhase, number> {
  const total = PHASE_ORDER.reduce((s, p) => s + (estimates[p] ?? 0), 0);
  if (total <= 0) return { ingest: 15, stem: 50, analysis: 78, synthesis: 95 };
  let cum = 0;
  const milestones: Partial<Record<MusicPhase, number>> = {};
  for (const p of PHASE_ORDER) {
    cum += estimates[p] ?? 0;
    milestones[p] = (cum / total) * 95;
  }
  return milestones as Record<MusicPhase, number>;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ══════════════════════════════════════════════════════
   Circular Progress Ring
   ══════════════════════════════════════════════════════ */

function ProgressRing({
  progress,
  size = 160,
  stroke = 4,
}: {
  progress: number;
  size?: number;
  stroke?: number;
}) {
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
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(0,0,0,0.06)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#musicProgressGradient)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
      />
      <defs>
        <linearGradient id="musicProgressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF6B35" />
          <stop offset="50%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#FFC832" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════
   Animated illustration per phase
   ══════════════════════════════════════════════════════ */

function IngestIllustration() {
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg viewBox="0 0 80 80" className="w-full h-full">
        {/* Disc */}
        <circle cx="40" cy="40" r="28" fill="rgba(78,205,196,0.08)" stroke="#4ECDC4" strokeWidth="1.5" />
        <circle cx="40" cy="40" r="10" fill="rgba(78,205,196,0.15)" stroke="#4ECDC4" strokeWidth="1" />
        <circle cx="40" cy="40" r="3" fill="#4ECDC4" />
        {/* Spinning grooves */}
        {[16, 20, 24].map((r) => (
          <circle key={r} cx="40" cy="40" r={r} fill="none" stroke="rgba(78,205,196,0.15)" strokeWidth="0.5" />
        ))}
      </svg>
      {/* Spin animation */}
      <div
        className="absolute inset-0"
        style={{ animation: "spin 4s linear infinite" }}
      >
        <svg viewBox="0 0 80 80" className="w-full h-full">
          <line x1="40" y1="12" x2="40" y2="20" stroke="#4ECDC4" strokeWidth="1" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

function StemIllustration() {
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg viewBox="0 0 80 80" className="w-full h-full">
        {/* 4 waveform channels */}
        {[
          { y: 14, color: "#4ECDC4", label: "V" },
          { y: 30, color: "#FF6B35", label: "D" },
          { y: 46, color: "#A78BFA", label: "B" },
          { y: 62, color: "#FFC832", label: "O" },
        ].map((ch, i) => (
          <g key={i}>
            <text x="4" y={ch.y + 6} fontSize="6" fill={ch.color} fontFamily="monospace" opacity="0.7">
              {ch.label}
            </text>
            {/* Waveform line */}
            <path
              d={`M14 ${ch.y + 4} ${Array.from({ length: 12 }, (_, j) => {
                const x = 14 + j * 5;
                const h = 3 + Math.sin(j * 1.2 + i * 1.5) * 3;
                return `L${x} ${ch.y + 4 - h} L${x + 2.5} ${ch.y + 4 + h}`;
              }).join(" ")}`}
              fill="none"
              stroke={ch.color}
              strokeWidth="1.2"
              opacity="0.8"
            >
              <animate
                attributeName="opacity"
                values="0.5;0.9;0.5"
                dur={`${1.5 + i * 0.3}s`}
                repeatCount="indefinite"
              />
            </path>
          </g>
        ))}
      </svg>
    </div>
  );
}

function AnalysisIllustration() {
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg viewBox="0 0 80 80" className="w-full h-full">
        {/* Bar chart */}
        {[
          { x: 10, h: 30, color: "#4ECDC4" },
          { x: 22, h: 45, color: "#FF6B35" },
          { x: 34, h: 25, color: "#A78BFA" },
          { x: 46, h: 50, color: "#FFC832" },
          { x: 58, h: 35, color: "#FF6B6B" },
        ].map((bar, i) => (
          <g key={i}>
            <rect
              x={bar.x}
              y={68 - bar.h}
              width="8"
              height={bar.h}
              rx="2"
              fill={bar.color}
              opacity="0.7"
            >
              <animate
                attributeName="height"
                values={`${bar.h * 0.6};${bar.h};${bar.h * 0.8};${bar.h}`}
                dur="2s"
                repeatCount="indefinite"
                begin={`${i * 0.2}s`}
              />
              <animate
                attributeName="y"
                values={`${68 - bar.h * 0.6};${68 - bar.h};${68 - bar.h * 0.8};${68 - bar.h}`}
                dur="2s"
                repeatCount="indefinite"
                begin={`${i * 0.2}s`}
              />
            </rect>
          </g>
        ))}
        {/* Baseline */}
        <line x1="6" y1="70" x2="74" y2="70" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function SynthesisIllustration() {
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      {/* Rotating rays */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: "spin 12s linear infinite" }}
      >
        <svg viewBox="0 0 80 80" className="w-24 h-24 opacity-40">
          {[...Array(6)].map((_, i) => (
            <line
              key={i}
              x1="40"
              y1="40"
              x2={40 + 30 * Math.cos((i * Math.PI) / 3)}
              y2={40 + 30 * Math.sin((i * Math.PI) / 3)}
              stroke="#FFC832"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={0.4 + (i % 2) * 0.3}
            />
          ))}
        </svg>
      </div>
      <svg viewBox="0 0 60 60" className="w-20 h-20">
        {/* Star / sparkle shape */}
        <polygon
          points="30,5 35,22 53,22 38,33 44,50 30,40 16,50 22,33 7,22 25,22"
          fill="rgba(255,200,50,0.15)"
          stroke="#FFC832"
          strokeWidth="1.5"
        >
          <animate
            attributeName="opacity"
            values="0.7;1;0.7"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </polygon>
        {/* Inner glow */}
        <circle cx="30" cy="28" r="6" fill="rgba(255,200,50,0.25)">
          <animate
            attributeName="r"
            values="5;7;5"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}

const ILLUSTRATIONS: Record<MusicPhase, () => React.ReactNode> = {
  ingest: IngestIllustration,
  stem: StemIllustration,
  analysis: AnalysisIllustration,
  synthesis: SynthesisIllustration,
};

/* ══════════════════════════════════════════════════════
   Timer / ETA hook (same pattern as AnalysisProgress)
   ══════════════════════════════════════════════════════ */

function useMusicTimer(
  currentPhase: MusicPhase | null,
  completedPhases: MusicPhase[],
  dynamicEstimates?: Partial<Record<MusicPhase, number>> | null
) {
  const startTimeRef = useRef<number | null>(null);
  const phaseStartRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [smoothProgress, setSmoothProgress] = useState(0);

  const estimates = useMemo(
    () => ({ ...DEFAULT_ESTIMATES, ...dynamicEstimates }) as Record<MusicPhase, number>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dynamicEstimates?.ingest, dynamicEstimates?.stem, dynamicEstimates?.analysis, dynamicEstimates?.synthesis]
  );
  const totalEstimated = useMemo(
    () => PHASE_ORDER.reduce((s, p) => s + (estimates[p] ?? 0), 0) || 1,
    [estimates]
  );
  const milestones = useMemo(() => buildMilestones(estimates), [estimates]);

  useEffect(() => {
    if (currentPhase && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
  }, [currentPhase]);

  useEffect(() => {
    if (currentPhase) {
      phaseStartRef.current = Date.now();
    }
  }, [currentPhase]);

  useEffect(() => {
    if (!currentPhase) return;
    const interval = setInterval(() => {
      const now = Date.now();

      if (startTimeRef.current) {
        setElapsed((now - startTimeRef.current) / 1000);
      }

      let milestoneFloor = 0;
      for (const p of completedPhases) {
        milestoneFloor = Math.max(milestoneFloor, milestones[p] ?? 0);
      }

      let intraPhase = 0;
      if (currentPhase && phaseStartRef.current) {
        const est = estimates[currentPhase] ?? 1;
        const phaseElapsed = Math.max((now - phaseStartRef.current) / 1000, 0);
        const linearRatio = Math.min(phaseElapsed / est, 0.92);
        const easedRatio = 1 - Math.pow(1 - linearRatio, 2.2);

        const phaseIdx = PHASE_ORDER.indexOf(currentPhase);
        const prevMilestone = phaseIdx > 0 ? milestones[PHASE_ORDER[phaseIdx - 1]] : 0;
        const nextMilestone = milestones[currentPhase];
        const phaseRange = nextMilestone - prevMilestone;

        intraPhase = easedRatio * phaseRange;
      }

      const timeFloor = (elapsed / totalEstimated) * 85;
      const rawTarget = Math.max(milestoneFloor + intraPhase, timeFloor);
      const target = Number.isFinite(rawTarget) ? Math.min(rawTarget, 95) : 0;

      setSmoothProgress((prev) => {
        if (target <= prev) return prev;
        const step = Math.max((target - prev) * 0.25, 0.3);
        return Math.min(prev + step, target);
      });
    }, 500);

    return () => clearInterval(interval);
  }, [currentPhase, completedPhases, elapsed, estimates, milestones, totalEstimated]);

  const remaining =
    smoothProgress > 1
      ? Math.max(((100 - smoothProgress) / smoothProgress) * elapsed, 5)
      : totalEstimated;
  const safeRemaining = Number.isFinite(remaining) ? remaining : totalEstimated;

  return { elapsed, remaining: safeRemaining, progress: smoothProgress };
}

/* ══════════════════════════════════════════════════════
   Phase summary builder
   ══════════════════════════════════════════════════════ */

function phaseSummary(phase: MusicPhase, data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  try {
    const d = data as Record<string, unknown>;
    if (phase === "ingest") {
      const parts: string[] = [];
      if (d.duration) parts.push(`Durata: ${d.duration}`);
      if (d.format) parts.push(`${d.format}`);
      if (d.sampleRate) parts.push(`${d.sampleRate}Hz`);
      return parts.join(" · ") || null;
    }
    if (phase === "stem") {
      const count = typeof d.stemCount === "number" ? d.stemCount : 4;
      return `${count} stems separati`;
    }
    if (phase === "analysis") {
      const parts: string[] = [];
      if (d.bpm) parts.push(`${d.bpm} BPM`);
      if (d.key) parts.push(`Key: ${d.key}`);
      if (d.energy) parts.push(`Energy: ${d.energy}`);
      return parts.join(" · ") || null;
    }
  } catch {
    return null;
  }
  return null;
}

/* ══════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════ */

export default function MusicAnalysisProgress({
  fileName,
  currentPhase,
  completedPhases,
  error,
  onReset,
  onRetry,
  sessionId,
  phaseEstimates,
  phaseResults,
}: MusicAnalysisProgressProps) {
  const { elapsed, remaining, progress } = useMusicTimer(
    currentPhase,
    completedPhases,
    phaseEstimates
  );

  const getPhaseStatus = (phase: MusicPhase): MusicPhaseStatus => {
    if (completedPhases.includes(phase)) return "done";
    if (currentPhase === phase) return "running";
    return "pending";
  };

  const ActiveIllustration = currentPhase ? ILLUSTRATIONS[currentPhase] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[var(--radius-xl)] p-10 md:p-12 max-w-[520px] w-full text-center"
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        border: "1px solid var(--card-border)",
      }}
    >
      <p className="text-sm text-[var(--foreground-tertiary)] mb-2">Analisi audio in corso</p>
      <p className="text-base font-semibold text-[var(--foreground-secondary)] mb-6 break-all">
        {fileName}
      </p>

      {/* Animated illustration with progress ring */}
      <div className="relative flex justify-center mb-4" style={{ height: 168 }}>
        <ProgressRing progress={progress} size={168} stroke={4} />
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
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[var(--foreground-tertiary)]" />
            <span className="text-xs text-[var(--foreground-secondary)] font-mono tabular-nums">
              {formatTime(elapsed)}
            </span>
          </div>

          <motion.span
            key={Math.floor(progress)}
            className="text-lg font-bold bg-gradient-to-r from-[#FF6B35] to-[#FFC832] bg-clip-text text-transparent"
          >
            {Math.floor(progress)}%
          </motion.span>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--foreground-tertiary)]">~</span>
            <span className="text-xs text-[var(--foreground-secondary)] font-mono tabular-nums">
              {formatTime(remaining)}
            </span>
            <span className="text-xs text-[var(--foreground-tertiary)]">rimasti</span>
          </div>
        </motion.div>
      )}

      {/* Global progress bar */}
      {currentPhase && (
        <div className="mb-8 mx-2">
          <div
            className="h-[3px] rounded-full overflow-hidden"
            style={{ background: "var(--card-border)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #FF6B35 0%, #A78BFA 50%, #FFC832 100%)",
                boxShadow: "0 0 12px rgba(255,107,53,0.5)",
              }}
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>
      )}

      {/* Phase timeline */}
      <div className="flex flex-col gap-5">
        {PHASES.map((phase) => {
          const status = getPhaseStatus(phase.key);
          const isDone = status === "done";
          const isActive = status === "running";
          const isPending = status === "pending";

          const summaryText = isDone
            ? phaseSummary(phase.key, phaseResults?.[phase.key])
            : null;

          return (
            <div
              key={phase.key}
              className={`flex items-center gap-4 transition-opacity ${
                isPending ? "opacity-25" : "opacity-100"
              }`}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-all"
                style={
                  isDone
                    ? {
                        backgroundColor: "rgba(74,222,128,0.1)",
                        borderColor: "rgba(74,222,128,0.2)",
                        color: "#4ade80",
                      }
                    : isActive
                    ? {
                        backgroundColor: `color-mix(in srgb, ${phase.color} 10%, transparent)`,
                        borderColor: `color-mix(in srgb, ${phase.color} 30%, transparent)`,
                        color: phase.color,
                      }
                    : {
                        backgroundColor: "var(--card-bg)",
                        borderColor: "var(--card-border)",
                        color: "var(--foreground-tertiary)",
                      }
                }
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
                      ? "font-semibold text-[var(--foreground)]"
                      : "font-normal text-[var(--foreground-tertiary)]"
                  }`}
                >
                  {isDone ? phase.doneLabel : phase.label}
                </p>

                {summaryText && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-[11px] text-[var(--foreground-tertiary)] mt-0.5"
                  >
                    {summaryText}
                  </motion.p>
                )}

                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-1.5 h-[3px] rounded-full overflow-hidden"
                    style={{ background: "var(--card-border)" }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${phase.color}, color-mix(in srgb, ${phase.color} 60%, #FFC832))`,
                      }}
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

      {/* Error state */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6"
        >
          <p className="text-sm text-red-400 mb-4">{error}</p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {onRetry && sessionId && (
              <button
                onClick={onRetry}
                className="px-8 py-3 rounded-full text-sm font-bold text-white hover:-translate-y-0.5 transition-all"
                style={{
                  backgroundImage: "linear-gradient(135deg, #FF6B35, #E8451A)",
                  boxShadow: "0 12px 40px rgba(255,107,53,0.35)",
                }}
              >
                Riprova da dove eri
              </button>
            )}

            {onReset && (
              <button
                onClick={onReset}
                className="px-8 py-3 rounded-full text-sm font-bold text-[var(--foreground-secondary)] border transition-all hover:-translate-y-0.5"
                style={{ borderColor: "var(--card-border)" }}
              >
                {sessionId ? "Ricomincia da capo" : "Riprova"}
              </button>
            )}
          </div>

          {sessionId && (
            <p className="text-xs text-[var(--foreground-tertiary)] mt-3">
              Sessione salvata &middot; i passaggi completati non verranno ripetuti
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
