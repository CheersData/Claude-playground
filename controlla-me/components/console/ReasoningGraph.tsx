"use client";

import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───

interface ReasoningGraphProps {
  institutes: string[];
  /** Scope flags from question-prep */
  needsProceduralLaw?: boolean;
  needsCaseLaw?: boolean;
  scopeNotes?: string | null;
  questionType?: "specific" | "systematic";
  /** Which phase we're in — controls what's visible */
  phase: "question-prep" | "corpus-search" | "corpus-agent" | "idle";
}

// ─── Helpers ───

/** Pretty-print institute name: "vendita_a_corpo" → "Vendita a corpo" */
function formatInstitute(inst: string): string {
  return inst.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Assign a stable color to each institute */
const PALETTE = [
  "#c9a84c", // gold
  "#4ECDC4", // teal
  "#A78BFA", // violet
  "#FF6B6B", // coral
  "#60A5FA", // blue
  "#34D399", // emerald
  "#F472B6", // pink
  "#FBBF24", // amber
];

// ─── Component ───

export default function ReasoningGraph({
  institutes,
  needsProceduralLaw,
  needsCaseLaw,
  scopeNotes,
  questionType,
  phase,
}: ReasoningGraphProps) {
  if (phase === "idle" || institutes.length === 0) return null;

  return (
    <div className="pipboy-panel rounded-md px-3 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-[var(--pb-text-dim)] tracking-wider font-medium">
          ISTITUTI RILEVATI
        </span>
        {questionType === "systematic" && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--pb-amber)] bg-opacity-20 text-[var(--pb-amber)]">
            sistematica
          </span>
        )}
      </div>

      {/* Institute chips */}
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence>
          {institutes.map((inst, i) => {
            const color = PALETTE[i % PALETTE.length];
            return (
              <motion.span
                key={inst}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: i * 0.06 }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                style={{
                  color,
                  borderColor: color,
                  backgroundColor: `${color}15`,
                }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {formatInstitute(inst)}
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Scope warnings */}
      {(needsProceduralLaw || needsCaseLaw) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="mt-2 pt-2 border-t border-[var(--pb-border)]"
        >
          <div className="flex flex-wrap gap-1.5">
            {needsProceduralLaw && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-[var(--pb-red)] text-[var(--pb-red)] bg-[rgba(204,68,68,0.08)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--pb-red)]" />
                Serve c.p.c.
              </span>
            )}
            {needsCaseLaw && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-[var(--pb-amber)] text-[var(--pb-amber)] bg-[rgba(212,168,67,0.08)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--pb-amber)]" />
                Serve giurisprudenza
              </span>
            )}
          </div>
          {scopeNotes && (
            <p className="text-[10px] text-[var(--pb-text-dim)] mt-1 italic">
              {scopeNotes}
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
