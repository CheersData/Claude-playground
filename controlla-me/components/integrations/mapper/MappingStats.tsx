"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Sparkles,
  Link2,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import type { SchemaEntity, FieldMappingEntry } from "./index";

// ─── Types ──────────────────────────────────────────────────────────

interface MappingStatsProps {
  sourceEntity: SchemaEntity | null;
  targetEntity: SchemaEntity | null;
  mappings: FieldMappingEntry[];
  /** Layout direction */
  layout?: "horizontal" | "vertical";
}

interface StatItem {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

// ─── Component ──────────────────────────────────────────────────────

export default function MappingStats({
  sourceEntity,
  targetEntity,
  mappings,
  layout = "horizontal",
}: MappingStatsProps) {
  const stats = useMemo(() => {
    const sourceTotal = sourceEntity?.fields.length ?? 0;
    const targetTotal = targetEntity?.fields.length ?? 0;
    const mappedSourceIds = new Set(mappings.map((m) => m.sourceFieldId));
    const mappedTargetIds = new Set(mappings.map((m) => m.targetFieldId));
    const sourceMapped = sourceEntity?.fields.filter((f) => mappedSourceIds.has(f.id)).length ?? 0;
    const targetMapped = targetEntity?.fields.filter((f) => mappedTargetIds.has(f.id)).length ?? 0;
    const sourceUnmapped = sourceTotal - sourceMapped;
    const targetUnmapped = targetTotal - targetMapped;

    // Confidence distribution
    const withConfidence = mappings.filter((m) => m.confidence !== undefined);
    const highConf = withConfidence.filter((m) => m.confidence! >= 90).length;
    const medConf = withConfidence.filter(
      (m) => m.confidence! >= 70 && m.confidence! < 90,
    ).length;
    const lowConf = withConfidence.filter((m) => m.confidence! < 70).length;
    const avgConfidence =
      withConfidence.length > 0
        ? Math.round(
            withConfidence.reduce((sum, m) => sum + m.confidence!, 0) /
              withConfidence.length,
          )
        : 0;

    const autoMapped = mappings.filter((m) => m.autoMapped).length;
    const manualMapped = mappings.length - autoMapped;

    // Completion percentage
    const completionPct =
      targetTotal > 0 ? Math.round((targetMapped / targetTotal) * 100) : 0;

    // Required target fields coverage
    const requiredTarget = targetEntity?.fields.filter((f) => f.required) ?? [];
    const requiredMapped = requiredTarget.filter((f) => mappedTargetIds.has(f.id)).length;
    const requiredTotal = requiredTarget.length;

    return {
      sourceTotal,
      targetTotal,
      sourceMapped,
      targetMapped,
      sourceUnmapped,
      targetUnmapped,
      totalMappings: mappings.length,
      highConf,
      medConf,
      lowConf,
      avgConfidence,
      autoMapped,
      manualMapped,
      completionPct,
      requiredMapped,
      requiredTotal,
    };
  }, [sourceEntity, targetEntity, mappings]);

  const statItems: StatItem[] = useMemo(
    () => [
      {
        label: "Mappati",
        value: stats.totalMappings,
        icon: Link2,
        color: "var(--success)",
        bgColor: "rgba(93, 228, 199, 0.12)",
      },
      {
        label: "Non mappati",
        value: stats.sourceUnmapped,
        icon: Unlink,
        color: stats.sourceUnmapped > 0 ? "var(--caution)" : "var(--fg-muted)",
        bgColor:
          stats.sourceUnmapped > 0
            ? "rgba(255, 252, 194, 0.12)"
            : "var(--bg-overlay)",
      },
      {
        label: "Auto-map",
        value: stats.autoMapped,
        icon: Sparkles,
        color: "var(--accent)",
        bgColor: "rgba(255, 107, 53, 0.12)",
      },
      {
        label: "Manuali",
        value: stats.manualMapped,
        icon: Circle,
        color: "var(--info)",
        bgColor: "rgba(173, 215, 255, 0.12)",
      },
      {
        label: "Conf. Media",
        value: stats.avgConfidence > 0 ? `${stats.avgConfidence}%` : "--",
        icon: BarChart3,
        color: confidenceStatColor(stats.avgConfidence),
        bgColor: confidenceStatBg(stats.avgConfidence),
      },
      {
        label: "Obbligatori",
        value: `${stats.requiredMapped}/${stats.requiredTotal}`,
        icon: stats.requiredMapped === stats.requiredTotal ? CheckCircle2 : AlertTriangle,
        color:
          stats.requiredTotal === 0
            ? "var(--fg-muted)"
            : stats.requiredMapped === stats.requiredTotal
              ? "var(--success)"
              : "var(--error)",
        bgColor:
          stats.requiredTotal === 0
            ? "var(--bg-overlay)"
            : stats.requiredMapped === stats.requiredTotal
              ? "rgba(93, 228, 199, 0.12)"
              : "rgba(229, 141, 120, 0.12)",
      },
    ],
    [stats],
  );

  const isHorizontal = layout === "horizontal";

  return (
    <div
      className={`rounded-xl overflow-hidden ${isHorizontal ? "" : "space-y-0"}`}
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Completion bar */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
              Statistiche Mapping
            </h3>
          </div>
          <span
            className="text-sm font-bold tabular-nums"
            style={{
              color:
                stats.completionPct === 100
                  ? "var(--success)"
                  : stats.completionPct >= 50
                    ? "var(--fg-primary)"
                    : "var(--caution)",
            }}
          >
            {stats.completionPct}%
          </span>
        </div>
        <div
          className="w-full h-2 rounded-full overflow-hidden"
          style={{ background: "var(--bg-base)" }}
          role="progressbar"
          aria-valuenow={stats.completionPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Completamento mapping: ${stats.completionPct}%`}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background:
                stats.completionPct === 100
                  ? "var(--success)"
                  : "linear-gradient(to right, var(--accent), #E85A24)",
            }}
            initial={{ width: 0 }}
            animate={{ width: `${stats.completionPct}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
            {stats.sourceMapped} sorgente / {stats.targetMapped} destinazione
          </span>
          <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
            {stats.sourceTotal} sorgente, {stats.targetTotal} destinazione
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div
        className={`p-3 ${isHorizontal ? "grid grid-cols-3 sm:grid-cols-6 gap-2" : "grid grid-cols-2 gap-2"}`}
      >
        {statItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-1 rounded-lg px-2 py-3"
              style={{ background: item.bgColor }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
              <span
                className="text-lg font-bold tabular-nums leading-none"
                style={{ color: item.color }}
              >
                {item.value}
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-center" style={{ color: "var(--fg-muted)" }}>
                {item.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Confidence distribution bar */}
      {mappings.length > 0 && (
        <div className="px-4 pb-3">
          <p
            className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            Distribuzione confidenza
          </p>
          <div className="flex rounded-full overflow-hidden h-2" style={{ background: "var(--bg-base)" }}>
            {stats.highConf > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${(stats.highConf / mappings.length) * 100}%`,
                }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
                style={{ background: "var(--success)" }}
                title={`Alta: ${stats.highConf}`}
              />
            )}
            {stats.medConf > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${(stats.medConf / mappings.length) * 100}%`,
                }}
                transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
                style={{ background: "var(--caution)" }}
                title={`Media: ${stats.medConf}`}
              />
            )}
            {stats.lowConf > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${(stats.lowConf / mappings.length) * 100}%`,
                }}
                transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
                style={{ background: "var(--error)" }}
                title={`Bassa: ${stats.lowConf}`}
              />
            )}
          </div>
          <div className="flex items-center gap-4 mt-1.5">
            {stats.highConf > 0 && (
              <span className="flex items-center gap-1 text-[9px]" style={{ color: "var(--success)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
                Alta ({stats.highConf})
              </span>
            )}
            {stats.medConf > 0 && (
              <span className="flex items-center gap-1 text-[9px]" style={{ color: "var(--caution)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--caution)" }} />
                Media ({stats.medConf})
              </span>
            )}
            {stats.lowConf > 0 && (
              <span className="flex items-center gap-1 text-[9px]" style={{ color: "var(--error)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--error)" }} />
                Bassa ({stats.lowConf})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function confidenceStatColor(avg: number): string {
  if (avg === 0) return "var(--fg-muted)";
  if (avg >= 90) return "var(--success)";
  if (avg >= 70) return "var(--caution)";
  return "var(--error)";
}

function confidenceStatBg(avg: number): string {
  if (avg === 0) return "var(--bg-overlay)";
  if (avg >= 90) return "rgba(93, 228, 199, 0.12)";
  if (avg >= 70) return "rgba(255, 252, 194, 0.12)";
  return "rgba(229, 141, 120, 0.12)";
}
