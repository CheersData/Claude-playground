"use client";

import { motion } from "framer-motion";
import { Target, CheckCircle2, AlertTriangle, Lightbulb } from "lucide-react";

/* ── Types ── */

export interface GapAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  market_fit_score: number;
}

interface GapAnalysisCardProps {
  data: GapAnalysis;
}

/* ── Constants ── */

const MUSIC_TEAL = "#4ECDC4";
const MUSIC_CORAL = "#FF6B6B";
const MUSIC_VIOLET = "#A78BFA";

/* ── Market Fit Ring ── */

function MarketFitRing({ score }: { score: number }) {
  const size = 120;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score, 0), 100);
  const offset = circumference - (pct / 100) * circumference;

  const color = pct >= 70 ? "#4ade80" : pct >= 50 ? "#FFC832" : MUSIC_CORAL;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>
          {Math.round(pct)}
        </span>
        <span className="text-[10px] text-[var(--foreground-tertiary)] uppercase tracking-wider">
          Market Fit
        </span>
      </div>
    </div>
  );
}

/* ── Pill list ── */

function PillList({
  items,
  color,
  icon: Icon,
  title,
  delay,
}: {
  items: string[];
  color: string;
  icon: React.ElementType;
  title: string;
  delay: number;
}) {
  if (!items.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span
          className="text-[10px] font-bold tracking-widest uppercase"
          style={{ color }}
        >
          {title}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <motion.span
            key={item}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.1 + i * 0.05 }}
            className="text-xs px-3 py-1.5 rounded-full leading-tight"
            style={{
              backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${color} 18%, transparent)`,
              color: `color-mix(in srgb, ${color} 85%, white)`,
            }}
          >
            {item}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Component ── */

export default function GapAnalysisCard({ data }: GapAnalysisCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-[var(--radius-xl)] p-6"
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        border: "1px solid var(--card-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "color-mix(in srgb, #FFC832 12%, transparent)" }}
        >
          <Target className="w-4.5 h-4.5" style={{ color: "#FFC832" }} />
        </div>
        <h3 className="text-xs font-bold tracking-widest uppercase text-[var(--foreground-tertiary)]">
          Gap Analysis
        </h3>
      </div>

      {/* Layout: ring + pills */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Market fit ring */}
        <div className="flex justify-center md:justify-start w-full md:w-auto flex-shrink-0">
          <MarketFitRing score={data.market_fit_score} />
        </div>

        {/* SWOT pills */}
        <div className="flex flex-col gap-5 flex-1 min-w-0">
          <PillList
            items={data.strengths}
            color={MUSIC_TEAL}
            icon={CheckCircle2}
            title="Punti di forza"
            delay={0.3}
          />
          <PillList
            items={data.weaknesses}
            color={MUSIC_CORAL}
            icon={AlertTriangle}
            title="Punti deboli"
            delay={0.4}
          />
          <PillList
            items={data.opportunities}
            color={MUSIC_VIOLET}
            icon={Lightbulb}
            title="Opportunita"
            delay={0.5}
          />
        </div>
      </div>
    </motion.div>
  );
}
