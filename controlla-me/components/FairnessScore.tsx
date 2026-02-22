"use client";

import { motion } from "framer-motion";

interface FairnessScoreProps {
  score: number;
}

export default function FairnessScore({ score }: FairnessScoreProps) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 10) * circumference;
  const color = score >= 7 ? "#2ECC40" : score >= 5 ? "#FF851B" : "#FF4136";

  return (
    <div className="flex flex-col items-center gap-2">
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
        Fairness Score
      </span>
    </div>
  );
}
