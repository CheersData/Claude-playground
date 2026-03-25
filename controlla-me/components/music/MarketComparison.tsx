"use client";

import { motion } from "framer-motion";
import { BarChart3, Zap, Key, Smile } from "lucide-react";

/* ── Types ── */

export interface MarketComparisonData {
  bpm_percentile: number;
  energy_percentile: number;
  key_popularity: string;
  mood_alignment: string;
}

interface MarketComparisonProps {
  data: MarketComparisonData;
}

/* ── Constants ── */

const MUSIC_TEAL = "#4ECDC4";
const MUSIC_CORAL = "#FF6B6B";
const MUSIC_VIOLET = "#A78BFA";
const MUSIC_GOLD = "#FFC832";

/* ── Percentile bar ── */

function PercentileBar({
  label,
  value,
  color,
  icon: Icon,
  delay,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ElementType;
  delay: number;
}) {
  const clamped = Math.min(Math.max(value, 0), 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <span className="text-sm font-medium text-[var(--foreground-secondary)]">{label}</span>
        </div>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {Math.round(clamped)}
          <span className="text-[var(--foreground-tertiary)] font-normal text-xs ml-0.5">
            /100
          </span>
        </span>
      </div>

      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: `color-mix(in srgb, ${color} 8%, transparent)` }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, transparent), ${color})`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 1.2, ease: "easeOut", delay: delay + 0.2 }}
        />
      </div>
    </motion.div>
  );
}

/* ── Badge ── */

function InfoBadge({
  label,
  value,
  color,
  icon: Icon,
  delay,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.4 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        background: `color-mix(in srgb, ${color} 6%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      <Icon className="w-4 h-4" style={{ color }} />
      <div className="flex flex-col">
        <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--foreground-tertiary)]">
          {label}
        </span>
        <span className="text-sm font-semibold capitalize" style={{ color }}>
          {value}
        </span>
      </div>
    </motion.div>
  );
}

/* ── Component ── */

export default function MarketComparison({ data }: MarketComparisonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
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
          style={{ backgroundColor: `color-mix(in srgb, ${MUSIC_TEAL} 12%, transparent)` }}
        >
          <BarChart3 className="w-4.5 h-4.5" style={{ color: MUSIC_TEAL }} />
        </div>
        <h3 className="text-xs font-bold tracking-widest uppercase text-[var(--foreground-tertiary)]">
          Confronto di Mercato
        </h3>
      </div>

      {/* Percentile bars */}
      <div className="flex flex-col gap-5 mb-6">
        <PercentileBar
          label="BPM Percentile"
          value={data.bpm_percentile}
          color={MUSIC_TEAL}
          icon={BarChart3}
          delay={0.2}
        />
        <PercentileBar
          label="Energy Percentile"
          value={data.energy_percentile}
          color={MUSIC_CORAL}
          icon={Zap}
          delay={0.3}
        />
      </div>

      {/* Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoBadge
          label="Popolarita tonalita"
          value={data.key_popularity}
          color={MUSIC_VIOLET}
          icon={Key}
          delay={0.4}
        />
        <InfoBadge
          label="Mood"
          value={data.mood_alignment}
          color={MUSIC_GOLD}
          icon={Smile}
          delay={0.5}
        />
      </div>
    </motion.div>
  );
}
