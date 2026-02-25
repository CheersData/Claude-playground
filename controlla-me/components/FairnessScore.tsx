"use client";

import { motion } from "framer-motion";
import type { MultiDimensionalScore } from "@/lib/types";

interface FairnessScoreProps {
  score: number;
  scores?: MultiDimensionalScore | null;
}

const SCORE_DIMENSIONS: Array<{
  key: keyof MultiDimensionalScore;
  label: string;
  labelShort: string;
}> = [
  { key: "legalCompliance", label: "Aderenza legale", labelShort: "Aderenza" },
  { key: "contractBalance", label: "Equilibrio contratto", labelShort: "Equilibrio" },
  { key: "industryPractice", label: "Prassi di settore", labelShort: "Prassi" },
];

function getColor(value: number): string {
  if (value >= 7) return "#2ECC40";
  if (value >= 5) return "#FF851B";
  return "#FF4136";
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

      {/* Sotto-score multidimensionali */}
      {scores && (
        <div className="w-full mt-1 flex flex-col gap-2">
          {SCORE_DIMENSIONS.map(({ key, labelShort }, i) => {
            const value = scores[key];
            const barColor = getColor(value);
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.0 + i * 0.1 }}
                className="flex items-center gap-2"
              >
                <span className="text-[10px] text-gray-400 w-[72px] text-right truncate">
                  {labelShort}
                </span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: barColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(value / 10) * 100}%` }}
                    transition={{
                      duration: 1,
                      ease: "easeOut",
                      delay: 1.2 + i * 0.1,
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-bold w-4 text-right"
                  style={{ color: barColor }}
                >
                  {value}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
