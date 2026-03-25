"use client";

import { useState } from "react";
import type React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dna,
  Headphones,
  TrendingUp,
  Lightbulb,
  RotateCcw,
  Music,
  Activity,
  Gauge,
  Volume2,
  Waves,
  ArrowUp,
  ArrowDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sliders,
} from "lucide-react";
import AudioDnaCard from "./AudioDnaCard";
import type { AudioDnaMetric } from "./AudioDnaCard";
import StemPlayer from "./StemPlayer";
import type { StemData } from "./StemPlayer";
import GenreCard from "./GenreCard";
import type { GenreAnalysis } from "./GenreCard";
import MarketComparison from "./MarketComparison";
import type { MarketComparisonData } from "./MarketComparison";
import ReferenceTracksSection from "./ReferenceTracksSection";
import type { ReferenceTrack } from "./ReferenceTracksSection";
import GapAnalysisCard from "./GapAnalysisCard";
import type { GapAnalysis } from "./GapAnalysisCard";
import ArrangementPlanCard from "./ArrangementPlanCard";
import type { ArrangementPlan } from "./ArrangementPlanCard";

/* ══════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════ */

export interface AudioDna {
  bpm: number;
  key: string;
  energy: number;
  loudness: number;
  dynamicRange: number;
}

export interface TrendComparison {
  metric: string;
  yourValue: string | number;
  genreAvg: string | number;
  status: "above" | "below" | "match";
  note?: string;
}

export interface MusicAdvice {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
}

/** TrendReport from Python pipeline */
export interface TrendReport {
  analysis_id?: string;
  genre_analysis?: GenreAnalysis;
  market_comparison?: MarketComparisonData;
  reference_tracks?: ReferenceTrack[];
  gap_analysis?: GapAnalysis;
}

export interface MusicAnalysisResult {
  summary: string;
  genre?: string;
  subGenre?: string;
  audioDna: AudioDna;
  stems: StemData[];
  trends?: TrendComparison[];
  advice: MusicAdvice[];
  overallScore?: number;
  fileName: string;
  /** Rich trend report from Python pipeline */
  trendReport?: TrendReport;
  /** Arrangement plan from Python pipeline */
  arrangementPlan?: ArrangementPlan;
}

interface MusicResultsViewProps {
  result: MusicAnalysisResult;
  onReset: () => void;
}

/* ══════════════════════════════════════════════════════
   Colors
   ══════════════════════════════════════════════════════ */

const MUSIC_TEAL = "#4ECDC4";
const MUSIC_ACCENT = "#FF6B35";
const MUSIC_VIOLET = "#A78BFA";
const MUSIC_CORAL = "#FF6B6B";
const MUSIC_GOLD = "#FFC832";

/* ══════════════════════════════════════════════════════
   Tabs
   ══════════════════════════════════════════════════════ */

type TabKey = "dna" | "stems" | "trends" | "arrangement" | "advice";

const TABS: { key: TabKey; label: string; icon: React.ElementType; color: string }[] = [
  { key: "dna", label: "Audio DNA", icon: Dna, color: MUSIC_TEAL },
  { key: "stems", label: "Stems", icon: Headphones, color: MUSIC_ACCENT },
  { key: "trends", label: "Mercato", icon: TrendingUp, color: MUSIC_VIOLET },
  { key: "arrangement", label: "Arrangiamento", icon: Sliders, color: MUSIC_CORAL },
  { key: "advice", label: "Consigli", icon: Lightbulb, color: MUSIC_GOLD },
];

/* ══════════════════════════════════════════════════════
   Shared card styles
   ══════════════════════════════════════════════════════ */

const CARD_CLASSES = "rounded-[var(--radius-xl)] p-6 mb-5";

const cardStyle = {
  background: "var(--card-bg)",
  boxShadow: "var(--card-shadow)",
  border: "1px solid var(--card-border)",
};

/* ══════════════════════════════════════════════════════
   Score Badge
   ══════════════════════════════════════════════════════ */

function ScoreBadge({ score }: { score: number }) {
  const getColor = (v: number) => {
    if (v >= 8) return "#4ade80";
    if (v >= 6) return "#FFC832";
    if (v >= 4) return "#FF6B35";
    return "#FF6B6B";
  };
  const color = getColor(score);

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
      className="flex items-center gap-2 px-4 py-2 rounded-full"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <Music className="w-4 h-4" style={{ color }} />
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>
        {score}
      </span>
      <span className="text-sm text-[var(--foreground-tertiary)]">/10</span>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════
   Tab Content: Audio DNA
   ══════════════════════════════════════════════════════ */

function AudioDnaSection({ dna }: { dna: AudioDna }) {
  const metrics: AudioDnaMetric[] = [
    {
      label: "BPM",
      value: dna.bpm,
      icon: Activity,
      color: MUSIC_TEAL,
      barValue: Math.min((dna.bpm / 200) * 100, 100),
    },
    {
      label: "Tonalita",
      value: dna.key,
      icon: Music,
      color: MUSIC_ACCENT,
    },
    {
      label: "Energia",
      value: dna.energy,
      unit: "%",
      icon: Gauge,
      color: MUSIC_CORAL,
      barValue: dna.energy,
    },
    {
      label: "Loudness",
      value: dna.loudness,
      unit: "LUFS",
      icon: Volume2,
      color: MUSIC_VIOLET,
      barValue: Math.min(Math.max(((dna.loudness + 30) / 30) * 100, 0), 100),
    },
    {
      label: "Dynamic Range",
      value: dna.dynamicRange,
      unit: "dB",
      icon: Waves,
      color: MUSIC_GOLD,
      barValue: Math.min((dna.dynamicRange / 20) * 100, 100),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {metrics.map((metric, i) => (
        <AudioDnaCard key={metric.label} metric={metric} index={i} />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Tab Content: Stems
   ══════════════════════════════════════════════════════ */

function StemsSection({ stems }: { stems: StemData[] }) {
  if (!stems.length) {
    return (
      <div className="text-center py-8 text-[var(--foreground-tertiary)]">
        <Headphones className="w-8 h-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Separazione stems non disponibile per questo brano.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {stems.map((stem, i) => (
        <StemPlayer key={stem.name} stem={stem} index={i} />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Tab Content: Trends (rich version with new components)
   ══════════════════════════════════════════════════════ */

function TrendsSection({
  trends,
  trendReport,
}: {
  trends?: TrendComparison[];
  trendReport?: TrendReport;
}) {
  const hasRichData =
    trendReport?.genre_analysis ||
    trendReport?.market_comparison ||
    trendReport?.reference_tracks?.length ||
    trendReport?.gap_analysis;

  if (!hasRichData && !trends?.length) {
    return (
      <div className="text-center py-8 text-[var(--foreground-tertiary)]">
        <TrendingUp className="w-8 h-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Analisi trend non disponibile. Seleziona un genere per il confronto.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Genre analysis */}
      {trendReport?.genre_analysis && (
        <GenreCard genreAnalysis={trendReport.genre_analysis} />
      )}

      {/* Market comparison */}
      {trendReport?.market_comparison && (
        <MarketComparison data={trendReport.market_comparison} />
      )}

      {/* Reference tracks */}
      {trendReport?.reference_tracks && trendReport.reference_tracks.length > 0 && (
        <ReferenceTracksSection tracks={trendReport.reference_tracks} />
      )}

      {/* Gap analysis */}
      {trendReport?.gap_analysis && (
        <GapAnalysisCard data={trendReport.gap_analysis} />
      )}

      {/* Legacy simple trend comparison table (fallback) */}
      {trends && trends.length > 0 && !hasRichData && (
        <LegacyTrendsTable trends={trends} />
      )}
    </div>
  );
}

/* ── Legacy trend table (from original MusicResultsView) ── */

function LegacyTrendsTable({ trends }: { trends: TrendComparison[] }) {
  const StatusIcon = ({ status }: { status: TrendComparison["status"] }) => {
    if (status === "above") return <ArrowUp className="w-4 h-4 text-green-400" />;
    if (status === "below") return <ArrowDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-[var(--foreground-tertiary)]" />;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-4 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-tertiary)]">
        <span>Metrica</span>
        <span className="text-center">Il tuo</span>
        <span className="text-center">Media genere</span>
        <span className="text-center">Stato</span>
      </div>
      {trends.map((trend, i) => (
        <motion.div
          key={trend.metric}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 + i * 0.06 }}
          className="grid grid-cols-4 gap-4 items-center px-4 py-3 rounded-[var(--radius-xl)]"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
          }}
        >
          <span className="text-sm font-medium text-[var(--foreground-secondary)]">
            {trend.metric}
          </span>
          <span className="text-sm font-bold text-center text-[var(--foreground)]">
            {trend.yourValue}
          </span>
          <span className="text-sm text-center text-[var(--foreground-tertiary)]">
            {trend.genreAvg}
          </span>
          <div className="flex justify-center">
            <StatusIcon status={trend.status} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Tab Content: Arrangement
   ══════════════════════════════════════════════════════ */

function ArrangementSection({ plan }: { plan?: ArrangementPlan }) {
  if (!plan) {
    return (
      <div className="text-center py-8 text-[var(--foreground-tertiary)]">
        <Sliders className="w-8 h-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Piano di riarrangiamento non disponibile per questa analisi.</p>
      </div>
    );
  }

  return <ArrangementPlanCard plan={plan} />;
}

/* ══════════════════════════════════════════════════════
   Tab Content: Advice
   ══════════════════════════════════════════════════════ */

function AdviceSection({ advice }: { advice: MusicAdvice[] }) {
  if (!advice.length) {
    return (
      <div className="text-center py-8 text-[var(--foreground-tertiary)]">
        <Lightbulb className="w-8 h-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Nessun consiglio generato per ora.</p>
      </div>
    );
  }

  const priorityConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
    high: { color: MUSIC_CORAL, icon: AlertTriangle, label: "Priorita alta" },
    medium: { color: MUSIC_GOLD, icon: Info, label: "Priorita media" },
    low: { color: MUSIC_TEAL, icon: CheckCircle2, label: "Suggerimento" },
  };

  return (
    <div className="flex flex-col gap-4">
      {advice.map((item, i) => {
        const config = priorityConfig[item.priority] ?? priorityConfig.medium;
        const PriorityIcon = config.icon;

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="rounded-[var(--radius-xl)] p-5"
            style={{
              background: "var(--card-bg)",
              border: `1px solid color-mix(in srgb, ${config.color} 20%, var(--card-border))`,
            }}
          >
            <div className="flex items-start gap-3 mb-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: `color-mix(in srgb, ${config.color} 12%, transparent)` }}
              >
                <PriorityIcon className="w-4 h-4" style={{ color: config.color }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-[var(--foreground)]">
                    {item.title}
                  </h4>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${config.color} 10%, transparent)`,
                      color: config.color,
                    }}
                  >
                    {config.label}
                  </span>
                </div>
                <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">
                  {item.description}
                </p>
                {item.category && (
                  <span className="inline-block mt-2 text-[10px] uppercase tracking-wider text-[var(--foreground-tertiary)]">
                    {item.category}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════ */

export default function MusicResultsView({ result, onReset }: MusicResultsViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("dna");

  // Determine which tabs to show based on available data
  const visibleTabs = TABS.filter((tab) => {
    if (tab.key === "arrangement") {
      return !!result.arrangementPlan;
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-6 pt-28 pb-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-start mb-9 flex-wrap gap-5"
      >
        <div>
          <p className="text-sm text-[var(--foreground-tertiary)] mb-1.5">
            Analisi completata -- {result.fileName}
          </p>
          <h2 className="font-serif text-3xl md:text-4xl text-[var(--foreground)]">
            Ecco il DNA del tuo brano.
          </h2>
          {(result.genre || result.subGenre || result.trendReport?.genre_analysis?.primary_genre) && (
            <p className="text-sm text-[var(--foreground-secondary)] mt-2">
              Genere rilevato:{" "}
              <span className="font-semibold" style={{ color: MUSIC_VIOLET }}>
                {result.trendReport?.genre_analysis?.primary_genre || result.genre}
                {result.subGenre ? ` / ${result.subGenre}` : ""}
              </span>
            </p>
          )}
        </div>
        {result.overallScore !== undefined && <ScoreBadge score={result.overallScore} />}
      </motion.div>

      {/* Summary card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className={CARD_CLASSES}
        style={cardStyle}
      >
        <h3 className="text-[11px] font-bold tracking-widest uppercase text-[var(--foreground-tertiary)] mb-3">
          Riassunto
        </h3>
        <p className="text-base leading-relaxed text-[var(--foreground-secondary)]">
          {result.summary}
        </p>
      </motion.div>

      {/* Tab navigation */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none"
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all"
              style={
                isActive
                  ? {
                      backgroundColor: `color-mix(in srgb, ${tab.color} 15%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${tab.color} 30%, transparent)`,
                      color: tab.color,
                    }
                  : {
                      backgroundColor: "transparent",
                      border: "1px solid var(--card-border)",
                      color: "var(--foreground-tertiary)",
                    }
              }
            >
              <TabIcon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="mb-8"
        >
          {activeTab === "dna" && <AudioDnaSection dna={result.audioDna} />}
          {activeTab === "stems" && <StemsSection stems={result.stems} />}
          {activeTab === "trends" && (
            <TrendsSection trends={result.trends} trendReport={result.trendReport} />
          )}
          {activeTab === "arrangement" && (
            <ArrangementSection plan={result.arrangementPlan} />
          )}
          {activeTab === "advice" && <AdviceSection advice={result.advice} />}
        </motion.div>
      </AnimatePresence>

      {/* Reset button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex justify-center"
      >
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium text-[var(--foreground-secondary)] border transition-all hover:-translate-y-0.5"
          style={{ borderColor: "var(--card-border)" }}
        >
          <RotateCcw className="w-4 h-4" />
          Analizza un altro brano
        </button>
      </motion.div>
    </div>
  );
}
