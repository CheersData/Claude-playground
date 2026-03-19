"use client";

/**
 * MappingView — Visual source→target field mapping with AI confidence.
 *
 * Features:
 *   - Source fields (left) → Target fields (right) with connecting indicators
 *   - Auto-matched fields with confidence percentage
 *   - Manual override via dropdown or drag-drop reordering
 *   - Color coding: green (matched), yellow (low confidence), red (unmapped required)
 *   - "Applica mappatura" button to save configuration
 *   - Entity tabs for multi-entity connectors
 *   - Stats banner with AI mapping summary
 *
 * Design: Poimandres dark theme, accent #FF6B35, Lucide icons, Italian labels.
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Save,
  Loader2,
  Search,
  Filter,
  Zap,
  X,
  ChevronDown,
  Database,
  Info,
  Eye,
  EyeOff,
} from "lucide-react";

// ─── Types ───

export interface MappingField {
  sourceField: string;
  sourceLabel?: string;
  sourceType?: string;
  targetField: string;
  confidence: number;
  autoMapped: boolean;
  required?: boolean;
}

export interface EntityMapping {
  entityId: string;
  entityName: string;
  mappings: MappingField[];
}

interface MappingViewProps {
  entityMappings: EntityMapping[];
  targetFieldOptions: string[];
  connectorName: string;
  onUpdateMapping: (entityId: string, sourceField: string, targetField: string) => void;
  onSave?: () => Promise<void>;
  onAutoMap?: () => void;
  saving?: boolean;
  saved?: boolean;
  saveError?: string | null;
}

// ─── Helpers ───

function confidenceColor(pct: number): string {
  if (pct >= 90) return "var(--success)";
  if (pct >= 70) return "var(--caution)";
  if (pct > 0) return "var(--error)";
  return "var(--fg-invisible)";
}

function confidenceBg(pct: number): string {
  if (pct >= 90) return "rgba(93, 228, 199, 0.08)";
  if (pct >= 70) return "rgba(255, 250, 194, 0.06)";
  if (pct > 0) return "rgba(229, 141, 120, 0.06)";
  return "transparent";
}

type FilterMode = "all" | "mapped" | "unmapped" | "low-confidence" | "required";

// ─── Sub-components ───

function MappingRow({
  mapping,
  entityId,
  targetFieldOptions,
  onUpdateMapping,
  isHighlighted,
}: {
  mapping: MappingField;
  entityId: string;
  targetFieldOptions: string[];
  onUpdateMapping: (entityId: string, sourceField: string, targetField: string) => void;
  isHighlighted?: boolean;
}) {
  const isMapped = mapping.targetField !== "-- Ignora --";
  const isIgnored = !isMapped;
  const confColor = confidenceColor(mapping.confidence);
  const confBg = confidenceBg(mapping.confidence);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="grid grid-cols-[1fr_40px_1fr_80px] gap-3 items-center px-4 py-3"
      style={{
        opacity: isIgnored ? 0.5 : 1,
        background: isHighlighted ? "rgba(255, 107, 53, 0.04)" : confBg,
        borderBottom: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Source field */}
      <div
        className="rounded-lg px-3 py-2.5 transition-colors"
        style={{
          background: "var(--bg-overlay)",
          border: `1px solid ${isMapped && mapping.confidence >= 90
            ? "rgba(93, 228, 199, 0.2)"
            : isMapped && mapping.confidence >= 70
              ? "rgba(255, 250, 194, 0.2)"
              : mapping.required && isIgnored
                ? "rgba(229, 141, 120, 0.3)"
                : "var(--border-dark-subtle)"}`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-mono truncate flex-1"
            style={{ color: "var(--fg-primary)" }}
            title={mapping.sourceField}
          >
            {mapping.sourceLabel || mapping.sourceField}
          </span>
          {mapping.required && (
            <span
              className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                background: isIgnored
                  ? "rgba(229, 141, 120, 0.15)"
                  : "rgba(255, 107, 53, 0.1)",
                color: isIgnored ? "var(--error)" : "var(--accent)",
              }}
            >
              {isIgnored ? "Non mappato" : "Req"}
            </span>
          )}
          {mapping.sourceType && (
            <span
              className="shrink-0 text-[9px] font-semibold rounded-full px-1.5 py-0.5"
              style={{
                background: "var(--bg-base)",
                color: "var(--fg-muted)",
              }}
            >
              {mapping.sourceType}
            </span>
          )}
        </div>
      </div>

      {/* Arrow / Connection indicator */}
      <div className="flex justify-center">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
          style={{
            background: isMapped
              ? `${confColor}15`
              : "var(--bg-overlay)",
            border: `1px solid ${isMapped ? confColor + "30" : "var(--border-dark-subtle)"}`,
          }}
        >
          {isMapped ? (
            <ArrowRight className="w-3.5 h-3.5" style={{ color: confColor }} />
          ) : (
            <X className="w-3 h-3" style={{ color: "var(--fg-invisible)" }} />
          )}
        </div>
      </div>

      {/* Target dropdown */}
      <div className="relative">
        <select
          value={mapping.targetField}
          onChange={(e) =>
            onUpdateMapping(entityId, mapping.sourceField, e.target.value)
          }
          className="w-full text-sm px-3 py-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 cursor-pointer appearance-none pr-8"
          style={{
            background: "var(--bg-base)",
            color: isIgnored ? "var(--fg-muted)" : "var(--fg-primary)",
            border: `1px solid ${mapping.required && isIgnored
              ? "rgba(229, 141, 120, 0.4)"
              : "var(--border-dark-subtle)"}`,
          }}
          aria-label={`Mappatura per ${mapping.sourceField}`}
        >
          <option value="-- Ignora --">-- Ignora --</option>
          <option value="-- Nuovo campo --">+ Nuovo campo</option>
          {targetFieldOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {/* Dropdown arrow */}
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
          style={{ color: "var(--fg-muted)" }}
        />
        {/* AI badge */}
        {mapping.autoMapped && isMapped && (
          <span
            className="absolute -top-1.5 right-2 text-[8px] px-1.5 py-0.5 rounded-full font-bold"
            style={{ background: "rgba(173, 215, 255, 0.15)", color: "var(--info)" }}
          >
            AI
          </span>
        )}
      </div>

      {/* Confidence */}
      <div className="flex items-center justify-end gap-1.5">
        {isMapped ? (
          <>
            {/* Confidence bar */}
            <div
              className="w-10 h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--bg-overlay)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${mapping.confidence}%`,
                  background: confColor,
                }}
              />
            </div>
            <span
              className="text-xs font-mono min-w-[32px] text-right"
              style={{ color: confColor }}
            >
              {mapping.confidence}%
            </span>
            {mapping.confidence >= 90 ? (
              <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: confColor }} />
            ) : mapping.confidence >= 70 ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: confColor }} />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: confColor }} />
            )}
          </>
        ) : (
          <span className="text-xs" style={{ color: "var(--fg-invisible)" }}>
            --
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───

export default function MappingView({
  entityMappings,
  targetFieldOptions,
  connectorName,
  onUpdateMapping,
  onSave,
  onAutoMap,
  saving = false,
  saved = false,
  saveError = null,
}: MappingViewProps) {
  const [activeEntity, setActiveEntity] = useState(
    entityMappings[0]?.entityId ?? ""
  );
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showIgnored, setShowIgnored] = useState(true);

  const currentMapping = entityMappings.find(
    (m) => m.entityId === activeEntity
  );

  // Stats per entity
  const entityStats = useMemo(() => {
    const stats: Record<
      string,
      {
        total: number;
        mapped: number;
        auto: number;
        manual: number;
        ignored: number;
        avgConfidence: number;
        lowConfidence: number;
        unmappedRequired: number;
      }
    > = {};

    for (const em of entityMappings) {
      const mapped = em.mappings.filter(
        (m) => m.targetField !== "-- Ignora --"
      );
      const auto = mapped.filter((m) => m.autoMapped);
      const manual = mapped.filter((m) => !m.autoMapped);
      const ignored = em.mappings.filter(
        (m) => m.targetField === "-- Ignora --"
      );
      const withConf = mapped.filter((m) => m.confidence > 0);
      const lowConf = mapped.filter((m) => m.confidence > 0 && m.confidence < 70);
      const unmappedRequired = em.mappings.filter(
        (m) => m.required && m.targetField === "-- Ignora --"
      );

      stats[em.entityId] = {
        total: em.mappings.length,
        mapped: mapped.length,
        auto: auto.length,
        manual: manual.length,
        ignored: ignored.length,
        avgConfidence:
          withConf.length > 0
            ? Math.round(
                withConf.reduce((s, m) => s + m.confidence, 0) / withConf.length
              )
            : 0,
        lowConfidence: lowConf.length,
        unmappedRequired: unmappedRequired.length,
      };
    }
    return stats;
  }, [entityMappings]);

  // Global stats
  const globalStats = useMemo(() => {
    const all = Object.values(entityStats);
    return {
      totalMapped: all.reduce((s, e) => s + e.mapped, 0),
      totalFields: all.reduce((s, e) => s + e.total, 0),
      totalAuto: all.reduce((s, e) => s + e.auto, 0),
      totalManual: all.reduce((s, e) => s + e.manual, 0),
      totalIgnored: all.reduce((s, e) => s + e.ignored, 0),
      avgConfidence:
        all.length > 0
          ? Math.round(
              all.reduce((s, e) => s + e.avgConfidence, 0) / all.length
            )
          : 0,
      totalLowConfidence: all.reduce((s, e) => s + e.lowConfidence, 0),
      totalUnmappedRequired: all.reduce((s, e) => s + e.unmappedRequired, 0),
    };
  }, [entityStats]);

  // Filtered mappings for active entity
  const filteredMappings = useMemo(() => {
    if (!currentMapping) return [];
    let result = currentMapping.mappings;

    // Filter mode
    switch (filterMode) {
      case "mapped":
        result = result.filter((m) => m.targetField !== "-- Ignora --");
        break;
      case "unmapped":
        result = result.filter((m) => m.targetField === "-- Ignora --");
        break;
      case "low-confidence":
        result = result.filter(
          (m) =>
            m.confidence > 0 &&
            m.confidence < 70 &&
            m.targetField !== "-- Ignora --"
        );
        break;
      case "required":
        result = result.filter((m) => m.required);
        break;
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.sourceField.toLowerCase().includes(q) ||
          (m.sourceLabel?.toLowerCase().includes(q) ?? false) ||
          m.targetField.toLowerCase().includes(q)
      );
    }

    // Hide ignored
    if (!showIgnored && filterMode !== "unmapped") {
      result = result.filter((m) => m.targetField !== "-- Ignora --");
    }

    return result;
  }, [currentMapping, filterMode, searchQuery, showIgnored]);

  // If no mappings yet
  if (entityMappings.length === 0) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        <Database
          className="w-12 h-12 mx-auto mb-4"
          style={{ color: "var(--fg-muted)" }}
        />
        <p
          className="text-sm font-medium"
          style={{ color: "var(--fg-secondary)" }}
        >
          Nessuna mappatura configurata
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>
          Seleziona le entita nel tab Setup per configurare la mappatura dei campi.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-xl font-semibold"
            style={{ color: "var(--fg-primary)" }}
          >
            Mappatura Campi
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--fg-secondary)" }}>
            {connectorName} &rarr; Controlla.me
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onAutoMap && (
            <button
              onClick={onAutoMap}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
              style={{
                background: "rgba(173, 215, 255, 0.1)",
                color: "var(--info)",
                border: "1px solid rgba(173, 215, 255, 0.2)",
              }}
            >
              <Zap className="w-4 h-4" />
              Auto-mappa AI
            </button>
          )}

          {onSave && (
            <button
              onClick={onSave}
              disabled={saving || saved}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
              style={{
                background: saved
                  ? "var(--success)"
                  : "linear-gradient(135deg, var(--accent), var(--accent-dark, #E85A24))",
              }}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvataggio...
                </>
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Salvato
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Applica mappatura
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Save error */}
      {saveError && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl mb-4 text-sm"
          style={{
            background: "rgba(229, 141, 120, 0.1)",
            border: "1px solid rgba(229, 141, 120, 0.3)",
            color: "var(--error)",
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* AI Stats Banner */}
      <div
        className="flex flex-wrap items-center gap-4 p-4 rounded-xl mb-5 text-sm"
        style={{
          background: "rgba(173, 215, 255, 0.06)",
          border: "1px solid rgba(173, 215, 255, 0.15)",
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" style={{ color: "var(--info)" }} />
          <span style={{ color: "var(--info)" }} className="font-medium">
            {globalStats.totalAuto}/{globalStats.totalFields} campi mappati dall&apos;AI
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--fg-muted)" }}>
          <span className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--success)" }}
            />
            {globalStats.totalMapped} mappati
          </span>
          <span className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--fg-muted)" }}
            />
            {globalStats.totalIgnored} ignorati
          </span>
          {globalStats.totalLowConfidence > 0 && (
            <span className="flex items-center gap-1" style={{ color: "var(--caution)" }}>
              <AlertTriangle className="w-3 h-3" />
              {globalStats.totalLowConfidence} bassa confidenza
            </span>
          )}
          {globalStats.totalUnmappedRequired > 0 && (
            <span className="flex items-center gap-1" style={{ color: "var(--error)" }}>
              <AlertCircle className="w-3 h-3" />
              {globalStats.totalUnmappedRequired} obbligatori non mappati
            </span>
          )}
        </div>

        {globalStats.avgConfidence > 0 && (
          <span className="ml-auto text-xs font-mono" style={{ color: "var(--fg-muted)" }}>
            Confidenza media: {globalStats.avgConfidence}%
          </span>
        )}
      </div>

      {/* Entity tabs */}
      {entityMappings.length > 1 && (
        <div
          className="flex gap-0 mb-4 overflow-x-auto border-b"
          style={{ borderColor: "var(--border-dark-subtle)" }}
        >
          {entityMappings.map((em) => {
            const isActive = activeEntity === em.entityId;
            const stats = entityStats[em.entityId];
            const hasIssues =
              (stats?.unmappedRequired ?? 0) > 0 ||
              (stats?.lowConfidence ?? 0) > 0;

            return (
              <button
                key={em.entityId}
                onClick={() => setActiveEntity(em.entityId)}
                className="relative flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap transition-colors"
                style={{
                  color: isActive ? "var(--accent)" : "var(--fg-muted)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <Database className="w-3.5 h-3.5" />
                {em.entityName}
                <span
                  className="text-[10px] font-semibold"
                  style={{
                    color: stats
                      ? stats.mapped === stats.total
                        ? "var(--success)"
                        : "var(--fg-muted)"
                      : "var(--fg-muted)",
                  }}
                >
                  {stats?.mapped ?? 0}/{stats?.total ?? 0}
                </span>
                {hasIssues && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--error)" }}
                  />
                )}
                {isActive && (
                  <motion.div
                    layoutId="mapping-view-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter + search bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Filter pills */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" style={{ color: "var(--fg-muted)" }} />
          {(
            [
              { id: "all", label: "Tutti" },
              { id: "mapped", label: "Mappati" },
              { id: "unmapped", label: "Non mappati" },
              { id: "low-confidence", label: "Bassa conf." },
              { id: "required", label: "Obbligatori" },
            ] as { id: FilterMode; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id)}
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
              style={{
                background: filterMode === f.id ? "var(--accent)" : "transparent",
                color: filterMode === f.id ? "#fff" : "var(--fg-muted)",
                border: `1px solid ${filterMode === f.id ? "var(--accent)" : "var(--border-dark-subtle)"}`,
              }}
              aria-pressed={filterMode === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Show/hide ignored */}
        <button
          onClick={() => setShowIgnored(!showIgnored)}
          className="flex items-center gap-1.5 text-[10px] font-medium transition-colors"
          style={{ color: "var(--fg-muted)" }}
        >
          {showIgnored ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
          {showIgnored ? "Nascondi ignorati" : "Mostra ignorati"}
        </button>

        {/* Search */}
        <div className="relative ml-auto">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: "var(--fg-muted)" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca campo..."
            className="rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 w-48"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-primary)",
            }}
            aria-label="Cerca nei campi di mapping"
          />
        </div>
      </div>

      {/* Mapping table */}
      {currentMapping && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dark-subtle)",
          }}
        >
          {/* Column headers */}
          <div
            className="grid grid-cols-[1fr_40px_1fr_80px] gap-3 px-4 py-3 text-[10px] font-bold uppercase tracking-wider"
            style={{
              color: "var(--fg-invisible)",
              background: "var(--bg-overlay)",
              borderBottom: "1px solid var(--border-dark-subtle)",
            }}
          >
            <span>Campo Sorgente</span>
            <span />
            <span>Campo Destinazione</span>
            <span className="text-right">Confidenza</span>
          </div>

          {/* Mapping rows */}
          <div>
            <AnimatePresence mode="popLayout">
              {filteredMappings.map((mapping) => (
                <MappingRow
                  key={`${currentMapping.entityId}-${mapping.sourceField}`}
                  mapping={mapping}
                  entityId={currentMapping.entityId}
                  targetFieldOptions={targetFieldOptions}
                  onUpdateMapping={onUpdateMapping}
                  isHighlighted={
                    searchQuery
                      ? mapping.sourceField
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase()) ||
                        mapping.targetField
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase())
                      : false
                  }
                />
              ))}
            </AnimatePresence>

            {filteredMappings.length === 0 && (
              <div className="flex flex-col items-center py-8">
                <Info
                  className="w-6 h-6 mb-2"
                  style={{ color: "var(--fg-muted)" }}
                />
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  {searchQuery
                    ? "Nessun campo corrisponde alla ricerca"
                    : "Nessun campo con questo filtro"}
                </p>
              </div>
            )}
          </div>

          {/* Entity stats footer */}
          {entityStats[currentMapping.entityId] && (
            <div
              className="flex items-center justify-between px-4 py-3 text-[10px]"
              style={{
                borderTop: "1px solid var(--border-dark-subtle)",
                background: "var(--bg-overlay)",
                color: "var(--fg-muted)",
              }}
            >
              <div className="flex items-center gap-4">
                <span>
                  <strong style={{ color: "var(--success)" }}>
                    {entityStats[currentMapping.entityId].mapped}
                  </strong>{" "}
                  mappati
                </span>
                <span>
                  <strong>{entityStats[currentMapping.entityId].auto}</strong> auto
                </span>
                <span>
                  <strong>{entityStats[currentMapping.entityId].manual}</strong> manuali
                </span>
                <span>
                  <strong>{entityStats[currentMapping.entityId].ignored}</strong> ignorati
                </span>
              </div>
              <span>
                Confidenza media:{" "}
                <strong
                  style={{
                    color: confidenceColor(
                      entityStats[currentMapping.entityId].avgConfidence
                    ),
                  }}
                >
                  {entityStats[currentMapping.entityId].avgConfidence}%
                </strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-4 mt-4 px-4 py-3 rounded-xl text-[10px]"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-dark-subtle)",
          color: "var(--fg-muted)",
        }}
      >
        <span
          className="font-semibold uppercase tracking-wider"
          style={{ color: "var(--fg-invisible)" }}
        >
          Legenda:
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle className="w-3 h-3" style={{ color: "var(--success)" }} />
          Alta ({"\u2265"}90%)
        </span>
        <span className="flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" style={{ color: "var(--caution)" }} />
          Media (70-89%)
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" style={{ color: "var(--error)" }} />
          Bassa (&lt;70%)
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" style={{ color: "var(--info)" }} />
          Suggerito dall&apos;AI
        </span>
      </div>
    </div>
  );
}
