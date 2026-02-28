"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ReasoningGraphProps {
  institutes: string[];
  needsProceduralLaw?: boolean;
  needsCaseLaw?: boolean;
  scopeNotes?: string | null;
  questionType?: "specific" | "systematic";
  phase: "question-prep" | "corpus-search" | "corpus-agent" | "idle";
}

function formatInstitute(inst: string): string {
  return inst.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const PALETTE = [
  "#1A1A1A",
  "#6B6B6B",
  "#A78BFA",
  "#6366F1",
  "#60A5FA",
  "#34D399",
  "#F472B6",
  "#FBBF24",
];

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
    <div className="rounded-xl border border-[#F0F0F0] px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-[#9B9B9B] tracking-[2px] uppercase font-medium">
          Istituti rilevati
        </span>
        {questionType === "systematic" && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[#F8F8FA] text-[#6B6B6B]">
            sistematica
          </span>
        )}
      </div>

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
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border"
                style={{
                  color,
                  borderColor: `${color}25`,
                  backgroundColor: `${color}08`,
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

      {(needsProceduralLaw || needsCaseLaw) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="mt-2 pt-2 border-t border-[#F0F0F0]"
        >
          <div className="flex flex-wrap gap-1.5">
            {needsProceduralLaw && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-red-200 text-red-500 bg-red-50">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Serve c.p.c.
              </span>
            )}
            {needsCaseLaw && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-amber-200 text-amber-600 bg-amber-50">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Serve giurisprudenza
              </span>
            )}
          </div>
          {scopeNotes && (
            <p className="text-[10px] text-[#9B9B9B] mt-1 italic">{scopeNotes}</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
