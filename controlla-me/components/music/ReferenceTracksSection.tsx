"use client";

import { motion } from "framer-motion";
import { Disc3, ExternalLink, Tag } from "lucide-react";

/* ── Types ── */

export interface ReferenceTrack {
  title: string;
  artist: string;
  similarity_score: number;
  matching_features: string[];
  source: string;
}

interface ReferenceTracksSectionProps {
  tracks: ReferenceTrack[];
}

/* ── Constants ── */

const MUSIC_CORAL = "#FF6B6B";

/* ── Similarity circle ── */

function SimilarityCircle({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const size = 48;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const color = pct >= 80 ? "#4ade80" : pct >= 60 ? "#FFC832" : MUSIC_CORAL;

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
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
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <span
        className="absolute text-xs font-bold tabular-nums"
        style={{ color }}
      >
        {pct}
      </span>
    </div>
  );
}

/* ── Component ── */

export default function ReferenceTracksSection({ tracks }: ReferenceTracksSectionProps) {
  if (!tracks.length) {
    return (
      <div className="text-center py-8 text-[var(--foreground-tertiary)]">
        <Disc3 className="w-8 h-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Nessuna reference track trovata.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="rounded-[var(--radius-xl)] p-6"
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        border: "1px solid var(--card-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `color-mix(in srgb, ${MUSIC_CORAL} 12%, transparent)` }}
        >
          <Disc3 className="w-4.5 h-4.5" style={{ color: MUSIC_CORAL }} />
        </div>
        <h3 className="text-xs font-bold tracking-widest uppercase text-[var(--foreground-tertiary)]">
          Reference Tracks
        </h3>
      </div>

      {/* Track list */}
      <div className="flex flex-col gap-3">
        {tracks.map((track, i) => (
          <motion.div
            key={`${track.title}-${track.artist}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.08 }}
            className="flex items-center gap-4 px-4 py-3 rounded-xl"
            style={{
              background: "color-mix(in srgb, var(--card-bg) 80%, transparent)",
              border: "1px solid var(--card-border)",
            }}
          >
            {/* Similarity circle */}
            <SimilarityCircle score={track.similarity_score} />

            {/* Track info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                {track.title}
              </p>
              <p className="text-xs text-[var(--foreground-tertiary)] truncate">
                {track.artist}
              </p>

              {/* Matching features tags */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {track.matching_features.map((feature) => (
                  <span
                    key={feature}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium text-[var(--foreground-tertiary)]"
                    style={{
                      background: "color-mix(in srgb, var(--foreground-tertiary) 8%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--foreground-tertiary) 12%, transparent)",
                    }}
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {feature}
                  </span>
                ))}
              </div>
            </div>

            {/* Source badge */}
            <span
              className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium text-[var(--foreground-tertiary)] whitespace-nowrap flex-shrink-0"
              style={{
                background: "color-mix(in srgb, var(--foreground-tertiary) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--foreground-tertiary) 10%, transparent)",
              }}
            >
              <ExternalLink className="w-2.5 h-2.5" />
              {track.source}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
