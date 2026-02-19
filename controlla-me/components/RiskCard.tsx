"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import type { Risk } from "@/lib/types";
import DeepSearchChat from "./DeepSearchChat";

interface RiskCardProps {
  risk: Risk;
  index: number;
  analysisId?: string;
}

const severityStyles = {
  alta: {
    bg: "bg-red-950/60",
    border: "border-red-500/40",
    text: "text-red-400",
    badge: "bg-red-950 border-red-500 text-red-400",
  },
  media: {
    bg: "bg-amber-950/60",
    border: "border-amber-500/40",
    text: "text-amber-400",
    badge: "bg-amber-950 border-amber-500 text-amber-400",
  },
  bassa: {
    bg: "bg-green-950/60",
    border: "border-green-500/40",
    text: "text-green-400",
    badge: "bg-green-950 border-green-500 text-green-400",
  },
};

export default function RiskCard({ risk, index, analysisId }: RiskCardProps) {
  const [showDeepSearch, setShowDeepSearch] = useState(false);
  const style = severityStyles[risk.severity] || severityStyles.media;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.12 }}
      className={`p-5 rounded-xl bg-white/[0.02] border border-white/[0.05]`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-[15px] font-bold">{risk.title}</span>
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase border ${style.badge}`}
        >
          {risk.severity}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-white/55 mb-3">
        {risk.detail}
      </p>

      {(risk.legalBasis || risk.courtCase) && (
        <div className="flex gap-3 flex-wrap text-xs text-white/30 mb-3">
          {risk.legalBasis && <span>{risk.legalBasis}</span>}
          {risk.courtCase && <span>{risk.courtCase}</span>}
        </div>
      )}

      <button
        onClick={() => setShowDeepSearch(!showDeepSearch)}
        className="flex items-center gap-1.5 text-xs font-medium text-accent/70 hover:text-accent transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        Approfondisci questo punto
      </button>

      {showDeepSearch && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-3 pt-3 border-t border-white/[0.06]"
        >
          <DeepSearchChat
            clauseContext={`${risk.title}: ${risk.detail}`}
            existingAnalysis={`Base legale: ${risk.legalBasis || "N/A"}. Sentenza: ${risk.courtCase || "N/A"}`}
            analysisId={analysisId}
          />
        </motion.div>
      )}
    </motion.div>
  );
}
