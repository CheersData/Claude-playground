"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MultiDimensionalScore } from "@/lib/types";

interface FairnessScoreProps {
  score: number;
  scores?: MultiDimensionalScore | null;
}

const SCORE_DIMENSIONS: Array<{
  key: keyof MultiDimensionalScore;
  label: string;
  labelShort: string;
  tooltip: string;
}> = [
  {
    key: "contractEquity",
    label: "Equità Contrattuale",
    labelShort: "Equità",
    tooltip: "Misura il bilanciamento dei diritti e obblighi tra le parti contrattuali. Un punteggio alto indica un contratto equilibrato; uno basso segnala clausole a favore di una sola parte.",
  },
  {
    key: "legalCoherence",
    label: "Coerenza Legale",
    labelShort: "Coerenza",
    tooltip: "Valuta la coerenza interna tra le clausole del documento e la conformità al quadro normativo vigente. Clausole contraddittorie o in violazione di legge abbassano questo score.",
  },
  {
    key: "practicalCompliance",
    label: "Conformità Pratica",
    labelShort: "Prassi",
    tooltip: "Indica l'aderenza agli usi e alle prassi consolidate del settore. Un valore basso significa che il contratto si discosta significativamente dagli standard di mercato.",
  },
  {
    key: "completeness",
    label: "Completezza",
    labelShort: "Completezza",
    tooltip: "Misura la copertura delle situazioni tipiche della materia. Clausole mancanti su aspetti essenziali (recesso, forza maggiore, foro competente, ecc.) riducono questo score.",
  },
];

function getColor(value: number): string {
  if (value >= 9) return "#2ECC40";   // verde — conforme / equilibrato
  if (value >= 7) return "#7BC67E";   // giallo-verde — buono
  if (value >= 5) return "#FF851B";   // giallo/arancione — problemi
  if (value >= 3) return "#E8601C";   // arancione — critico
  return "#FF4136";                   // rosso — gravemente squilibrato
}

/** Tailwind-compatible bg + border + text classes derived from score value */
function getPillClasses(value: number): { bg: string; border: string; text: string } {
  if (value >= 7)
    return { bg: "bg-green-50", border: "border-green-300", text: "text-green-700" };
  if (value >= 5)
    return { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700" };
  return { bg: "bg-red-50", border: "border-red-300", text: "text-red-600" };
}

function ScorePill({
  dimension,
  value,
  delay,
}: {
  dimension: (typeof SCORE_DIMENSIONS)[number];
  value: number;
  delay: number;
}) {
  const [hovered, setHovered] = useState(false);
  const { bg, border, text } = getPillClasses(value);
  const color = getColor(value);

  return (
    <motion.div
      key={dimension.key}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-default select-none ${bg} ${border}`}
      >
        {/* Color dot */}
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className={`text-[10px] font-semibold ${text}`}>
          {dimension.labelShort}
        </span>
        <span className={`text-[10px] font-bold ${text} ml-0.5`}>
          {value}
        </span>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 pointer-events-none"
          >
            <div className="bg-gray-900 text-white text-[11px] leading-relaxed rounded-xl px-3 py-2.5 shadow-xl">
              <p className="font-semibold mb-1">{dimension.label}</p>
              <p className="text-gray-300">{dimension.tooltip}</p>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FairnessScore({ score, scores }: FairnessScoreProps) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 10) * circumference;
  const color = getColor(score);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Cerchio principale */}
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle
          cx="65"
          cy="65"
          r="54"
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="8"
        />
        <motion.circle
          cx="65"
          cy="65"
          r="54"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
        />
        <text
          x="65"
          y="60"
          textAnchor="middle"
          fill="#1A1A1A"
          fontSize="32"
          fontWeight="800"
          className="font-serif"
        >
          {score}
        </text>
        <text
          x="65"
          y="80"
          textAnchor="middle"
          fill="rgba(26,26,46,0.4)"
          fontSize="11"
          fontWeight="500"
        >
          / 10
        </text>
      </svg>
      <span
        className="text-xs font-semibold tracking-[1.5px] uppercase"
        style={{ color }}
      >
        Score complessivo
      </span>

      {/* Pill badges multidimensionali con tooltip */}
      {scores && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-1 max-w-[200px]">
          {SCORE_DIMENSIONS.map(({ key, ...dim }, i) => (
            <ScorePill
              key={key}
              dimension={{ key, ...dim }}
              value={scores[key]}
              delay={1.0 + i * 0.1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
