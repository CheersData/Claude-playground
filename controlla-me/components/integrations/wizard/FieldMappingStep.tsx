"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, AlertTriangle } from "lucide-react";

// ─── Types ───

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  confidence: number;
  autoMapped: boolean;
}

export interface EntityMappings {
  entityId: string;
  entityName: string;
  mappings: FieldMapping[];
}

interface FieldMappingStepProps {
  entityMappings: EntityMappings[];
  targetFieldOptions: string[];
  onUpdateMapping: (entityId: string, sourceField: string, targetField: string) => void;
}

// ─── Helpers ───

function confidenceColor(pct: number): string {
  if (pct >= 90) return "var(--success)";
  if (pct >= 70) return "var(--caution)";
  return "var(--error)";
}

// ─── Component ───

export default function FieldMappingStep({
  entityMappings,
  targetFieldOptions,
  onUpdateMapping,
}: FieldMappingStepProps) {
  const [activeTab, setActiveTab] = useState(entityMappings[0]?.entityId ?? "");

  const activeMappings = entityMappings.find((e) => e.entityId === activeTab);

  // Count stats
  const totalMapped = entityMappings.reduce(
    (sum, e) => sum + e.mappings.filter((m) => m.targetField !== "-- Ignora --").length,
    0
  );
  const totalAuto = entityMappings.reduce(
    (sum, e) => sum + e.mappings.filter((m) => m.autoMapped && m.targetField !== "-- Ignora --").length,
    0
  );
  const needsReview = entityMappings.reduce(
    (sum, e) => sum + e.mappings.filter((m) => m.confidence < 70).length,
    0
  );

  return (
    <div>
      <h2 className="text-2xl font-semibold" style={{ color: "var(--fg-primary)" }}>
        Mappa i campi
      </h2>
      <p className="text-sm mt-2" style={{ color: "var(--fg-secondary)" }}>
        L&apos;AI ha suggerito la mappatura. Verifica e correggi se necessario.
      </p>

      {/* Entity tabs */}
      <div
        className="flex gap-1 mt-6 overflow-x-auto pb-1"
        style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
        role="tablist"
      >
        {entityMappings.map((entity) => {
          const isActive = activeTab === entity.entityId;
          return (
            <button
              key={entity.entityId}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(entity.entityId)}
              className="shrink-0 pb-2 px-3 text-sm transition-colors"
              style={{
                color: isActive ? "var(--accent)" : "var(--fg-muted)",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {entity.entityName} ({entity.mappings.length})
            </button>
          );
        })}
      </div>

      {/* Mapping table */}
      {activeMappings && (
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-4"
        >
          {/* Header row */}
          <div
            className="flex items-center gap-3 py-2 px-1 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--fg-invisible)" }}
          >
            <span className="flex-1">Campo Sorgente</span>
            <span className="w-5" />
            <span className="flex-1">Campo Destinazione</span>
            <span className="w-12 text-right">Conf.</span>
          </div>

          {/* Mapping rows — scrollable container for many fields */}
          <div
            className="space-y-0 overflow-y-auto"
            style={{ maxHeight: "min(60vh, 520px)" }}
          >
            {activeMappings.mappings.map((mapping, i) => (
              <div
                key={mapping.sourceField}
                className="flex items-center gap-3 py-3 px-1"
                style={{
                  borderBottom:
                    i < activeMappings.mappings.length - 1
                      ? "1px solid var(--border-dark-subtle)"
                      : "none",
                }}
              >
                {/* Source field */}
                <div
                  className="flex-1 rounded-lg px-3 py-2 text-sm font-mono truncate"
                  style={{ background: "var(--bg-overlay)", color: "var(--fg-primary)" }}
                  title={mapping.sourceField}
                >
                  {mapping.sourceField}
                </div>

                {/* Arrow */}
                <ArrowRight className="w-4 h-4 shrink-0" style={{ color: "var(--fg-invisible)" }} />

                {/* Target dropdown */}
                <select
                  value={mapping.targetField}
                  onChange={(e) =>
                    onUpdateMapping(activeMappings.entityId, mapping.sourceField, e.target.value)
                  }
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 cursor-pointer appearance-none"
                  style={{
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-dark-subtle)",
                    color: "var(--fg-primary)",
                  }}
                  aria-label={`Mappatura per ${mapping.sourceField}`}
                >
                  <option value="-- Ignora --">-- Ignora --</option>
                  <option value="-- Nuovo campo --">-- Nuovo campo --</option>
                  {targetFieldOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>

                {/* Confidence */}
                <span
                  className="w-12 text-right text-xs font-mono flex items-center justify-end gap-1"
                  style={{ color: confidenceColor(mapping.confidence) }}
                >
                  {mapping.confidence < 70 && (
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                  )}
                  {mapping.targetField === "-- Ignora --" ? "--" : `${mapping.confidence}%`}
                </span>
              </div>
            ))}
          </div>

          {/* Row count indicator — visible whenever scroll is needed */}
          {activeMappings.mappings.length > 4 && (
            <div
              className="text-xs text-center py-2"
              style={{ color: "var(--fg-muted)", borderTop: "1px solid var(--border-dark-subtle)" }}
            >
              {activeMappings.mappings.length} campi totali &mdash; scorri per vederli tutti
            </div>
          )}
        </motion.div>
      )}

      {/* AI suggestion banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-xl p-4 mt-4 text-sm"
        style={{
          background: "rgba(173, 215, 255, 0.1)",
          border: "1px solid rgba(173, 215, 255, 0.2)",
          color: "var(--info)",
        }}
      >
        <Sparkles className="w-5 h-5 shrink-0" />
        <div>
          <span className="font-medium">{totalAuto}/{totalMapped} campi mappati automaticamente</span>
          {needsReview > 0 && (
            <span className="ml-1" style={{ color: "var(--fg-muted)" }}>
              &mdash; {needsReview} campi richiedono verifica manuale
            </span>
          )}
        </div>
      </motion.div>
    </div>
  );
}
