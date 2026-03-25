"use client";

import { motion } from "framer-motion";
import { Music, TrendingUp, TrendingDown, Minus } from "lucide-react";

/* ── Types ── */

export interface GenreAnalysis {
  detected_genres: string[];
  primary_genre: string;
  genre_confidence: number;
  genre_trends: Record<string, string>;
}

interface GenreCardProps {
  genreAnalysis: GenreAnalysis;
}

/* ── Constants ── */

const MUSIC_VIOLET = "#A78BFA";

/* ── Trend icon mapping ── */

function TrendIndicator({ trend }: { trend: string }) {
  const lower = trend.toLowerCase();
  if (lower === "rising" || lower === "crescente") {
    return (
      <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
        <TrendingUp className="w-3 h-3" />
        In crescita
      </span>
    );
  }
  if (lower === "declining" || lower === "calante") {
    return (
      <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
        <TrendingDown className="w-3 h-3" />
        In calo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[var(--foreground-tertiary)] text-xs font-medium">
      <Minus className="w-3 h-3" />
      Stabile
    </span>
  );
}

/* ── Component ── */

export default function GenreCard({ genreAnalysis }: GenreCardProps) {
  const { detected_genres, primary_genre, genre_confidence, genre_trends } = genreAnalysis;
  const confidencePct = Math.round(genre_confidence * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
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
          style={{ backgroundColor: `color-mix(in srgb, ${MUSIC_VIOLET} 12%, transparent)` }}
        >
          <Music className="w-4.5 h-4.5" style={{ color: MUSIC_VIOLET }} />
        </div>
        <h3 className="text-xs font-bold tracking-widest uppercase text-[var(--foreground-tertiary)]">
          Analisi Genere
        </h3>
      </div>

      {/* Primary genre badge */}
      <div className="flex items-center gap-3 mb-4">
        <span
          className="text-xl font-bold capitalize"
          style={{ color: MUSIC_VIOLET }}
        >
          {primary_genre}
        </span>
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-24 rounded-full overflow-hidden"
            style={{ background: `color-mix(in srgb, ${MUSIC_VIOLET} 10%, transparent)` }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: MUSIC_VIOLET }}
              initial={{ width: 0 }}
              animate={{ width: `${confidencePct}%` }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            />
          </div>
          <span className="text-xs text-[var(--foreground-tertiary)] tabular-nums">
            {confidencePct}%
          </span>
        </div>
      </div>

      {/* Detected genres pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {detected_genres.map((genre, i) => (
          <motion.span
            key={genre}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.06 }}
            className="px-3 py-1.5 rounded-full text-xs font-medium capitalize"
            style={
              genre === primary_genre
                ? {
                    backgroundColor: `color-mix(in srgb, ${MUSIC_VIOLET} 15%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${MUSIC_VIOLET} 30%, transparent)`,
                    color: MUSIC_VIOLET,
                  }
                : {
                    backgroundColor: "var(--card-bg)",
                    border: "1px solid var(--card-border)",
                    color: "var(--foreground-secondary)",
                  }
            }
          >
            {genre}
          </motion.span>
        ))}
      </div>

      {/* Genre trends */}
      {Object.keys(genre_trends).length > 0 && (
        <div className="pt-4 border-t" style={{ borderColor: "var(--card-border)" }}>
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--foreground-tertiary)] mb-3">
            Tendenze di mercato
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {Object.entries(genre_trends).map(([genre, trend], i) => (
              <motion.div
                key={genre}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className="flex items-center gap-2"
              >
                <span className="text-sm text-[var(--foreground-secondary)] capitalize">
                  {genre}
                </span>
                <TrendIndicator trend={trend} />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
