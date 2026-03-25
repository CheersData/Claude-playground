"use client";

import type React from "react";
import { motion } from "framer-motion";

/* ── Types ── */

export interface AudioDnaMetric {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ElementType;
  color: string;
  /** Optional 0-100 progress bar value */
  barValue?: number;
}

interface AudioDnaCardProps {
  metric: AudioDnaMetric;
  index: number;
}

/* ── Component ── */

export default function AudioDnaCard({ metric, index }: AudioDnaCardProps) {
  const { label, value, unit, icon: Icon, color, barValue } = metric;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.5, ease: "easeOut" }}
      className="rounded-[var(--radius-xl)] p-5 flex flex-col gap-3"
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        border: "1px solid var(--card-border)",
      }}
    >
      {/* Header row: icon + label */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-[var(--radius-lg,12px)] flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
        >
          <Icon className="w-4.5 h-4.5" style={{ color }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-tertiary)]">
          {label}
        </span>
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-sm text-[var(--foreground-tertiary)]">{unit}</span>
        )}
      </div>

      {/* Optional progress bar */}
      {barValue !== undefined && (
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(Math.max(barValue, 0), 100)}%` }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 + index * 0.1 }}
          />
        </div>
      )}
    </motion.div>
  );
}
