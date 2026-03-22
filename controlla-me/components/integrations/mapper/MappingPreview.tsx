"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Code2,
  Table2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { SchemaEntity, FieldMappingEntry, TransformRule } from "./index";

// ─── Types ──────────────────────────────────────────────────────────

interface MappingPreviewProps {
  sourceEntity: SchemaEntity | null;
  targetEntity: SchemaEntity | null;
  mappings: FieldMappingEntry[];
  /** Sample source records to preview transformation */
  sampleData?: Record<string, unknown>[];
}

type ViewMode = "table" | "json";

// ─── Helpers ────────────────────────────────────────────────────────

function applyTransformPreview(
  value: unknown,
  transform?: TransformRule,
): { result: unknown; error?: string } {
  if (value === undefined || value === null) {
    return { result: null };
  }
  if (!transform || transform.type === "direct") {
    return { result: value };
  }
  try {
    switch (transform.type) {
      case "rename":
        return { result: value };
      case "format": {
        const pattern = (transform.config?.pattern as string) ?? "";
        if (!pattern) return { result: value };
        // Basic date formatting preview
        if (typeof value === "string" && !isNaN(Date.parse(value))) {
          const d = new Date(value);
          const formatted = pattern
            .replace("DD", String(d.getDate()).padStart(2, "0"))
            .replace("MM", String(d.getMonth() + 1).padStart(2, "0"))
            .replace("YYYY", String(d.getFullYear()));
          return { result: formatted };
        }
        return { result: value };
      }
      case "concat":
        return { result: String(value) };
      case "split": {
        const str = String(value);
        return { result: str.split(",").map((s) => s.trim()) };
      }
      case "custom":
        return { result: value, error: "Preview non disponibile per espressioni custom" };
      default:
        return { result: value };
    }
  } catch {
    return { result: null, error: "Errore nella trasformazione" };
  }
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ─── Default sample data ────────────────────────────────────────────

function generateSampleData(
  sourceEntity: SchemaEntity | null,
  count: number,
): Record<string, unknown>[] {
  if (!sourceEntity) return [];
  const samples: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const row: Record<string, unknown> = {};
    for (const field of sourceEntity.fields) {
      switch (field.type) {
        case "string":
          row[field.id] = `${field.name}_${i + 1}`;
          break;
        case "number":
          row[field.id] = Math.floor(Math.random() * 1000);
          break;
        case "boolean":
          row[field.id] = i % 2 === 0;
          break;
        case "date":
          row[field.id] = new Date(2026, 0, i + 1).toISOString();
          break;
        case "enum":
          row[field.id] = field.children?.[0]?.name ?? "valore_enum";
          break;
        default:
          row[field.id] = `sample_${i}`;
      }
    }
    samples.push(row);
  }
  return samples;
}

// ─── Component ──────────────────────────────────────────────────────

export default function MappingPreview({
  sourceEntity,
  targetEntity,
  mappings,
  sampleData,
}: MappingPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [isExpanded, setIsExpanded] = useState(true);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Generate sample data if none provided
  const data = useMemo(
    () => sampleData ?? generateSampleData(sourceEntity, 3),
    [sampleData, sourceEntity],
  );

  // Apply mappings to sample data
  const transformedRows = useMemo(() => {
    if (!data.length || !mappings.length) return [];
    return data.map((row) => {
      const transformed: Record<string, { value: unknown; error?: string; sourceField: string; targetField: string }> = {};
      for (const mapping of mappings) {
        const sourceValue = row[mapping.sourceFieldId];
        const { result, error } = applyTransformPreview(sourceValue, mapping.transform);
        const targetFieldName =
          targetEntity?.fields.find((f) => f.id === mapping.targetFieldId)?.name ??
          mapping.targetFieldId;
        const sourceFieldName =
          sourceEntity?.fields.find((f) => f.id === mapping.sourceFieldId)?.name ??
          mapping.sourceFieldId;
        transformed[mapping.targetFieldId] = {
          value: result,
          error,
          sourceField: sourceFieldName,
          targetField: targetFieldName,
        };
      }
      return transformed;
    });
  }, [data, mappings, sourceEntity, targetEntity]);

  const currentRow = transformedRows[previewIndex] ?? {};
  const errorCount = Object.values(currentRow).filter((v) => v.error).length;

  if (!sourceEntity || !targetEntity || mappings.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-8"
        style={{ color: "var(--fg-muted)" }}
      >
        <Eye className="w-8 h-8 opacity-40" />
        <p className="text-sm">Crea almeno un mapping per vedere l&apos;anteprima</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 text-left transition-colors"
        style={{ borderBottom: isExpanded ? "1px solid var(--border-dark-subtle)" : "none" }}
        aria-expanded={isExpanded}
        aria-controls="mapping-preview-content"
      >
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
            Anteprima Dati
          </h3>
          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
            {mappings.length} mapping applicati
          </span>
          {errorCount > 0 && (
            <span
              className="flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: "var(--error)" }}
            >
              <AlertTriangle className="w-3 h-3" />
              {errorCount} errori
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--border-dark-subtle)" }}
            role="radiogroup"
            aria-label="Modalita visualizzazione"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setViewMode("table")}
              className="px-2 py-1 text-xs transition-colors"
              style={{
                background: viewMode === "table" ? "var(--accent)" : "transparent",
                color: viewMode === "table" ? "#fff" : "var(--fg-muted)",
              }}
              role="radio"
              aria-checked={viewMode === "table"}
              aria-label="Vista tabella"
            >
              <Table2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => setViewMode("json")}
              className="px-2 py-1 text-xs transition-colors"
              style={{
                background: viewMode === "json" ? "var(--accent)" : "transparent",
                color: viewMode === "json" ? "#fff" : "var(--fg-muted)",
              }}
              role="radio"
              aria-checked={viewMode === "json"}
              aria-label="Vista JSON"
            >
              <Code2 className="w-3 h-3" />
            </button>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: "var(--fg-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--fg-muted)" }} />
          )}
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id="mapping-preview-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {/* Record navigation */}
            {transformedRows.length > 1 && (
              <div
                className="flex items-center justify-center gap-3 px-4 py-2"
                style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
              >
                <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  Record
                </span>
                {transformedRows.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewIndex(i)}
                    className="w-6 h-6 rounded-full text-[10px] font-semibold transition-colors"
                    style={{
                      background:
                        i === previewIndex ? "rgba(255, 107, 53, 0.15)" : "var(--bg-base)",
                      color: i === previewIndex ? "var(--accent)" : "var(--fg-muted)",
                      border: `1px solid ${i === previewIndex ? "var(--accent)" : "var(--border-dark-subtle)"}`,
                    }}
                    aria-label={`Record ${i + 1}`}
                    aria-pressed={i === previewIndex}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Table view */}
            {viewMode === "table" && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}>
                      <th
                        className="text-left px-4 py-2 font-semibold uppercase tracking-wider"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        Sorgente
                      </th>
                      <th className="w-8" />
                      <th
                        className="text-left px-4 py-2 font-semibold uppercase tracking-wider"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        Destinazione
                      </th>
                      <th
                        className="text-left px-4 py-2 font-semibold uppercase tracking-wider"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        Valore Originale
                      </th>
                      <th className="w-8" />
                      <th
                        className="text-left px-4 py-2 font-semibold uppercase tracking-wider"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        Valore Trasformato
                      </th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(currentRow).map(([targetId, info]) => {
                      const sourceRaw = data[previewIndex]?.[
                        mappings.find((m) => m.targetFieldId === targetId)?.sourceFieldId ?? ""
                      ];
                      return (
                        <tr
                          key={targetId}
                          style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
                        >
                          <td className="px-4 py-2.5 font-mono" style={{ color: "var(--info)" }}>
                            {info.sourceField}
                          </td>
                          <td className="text-center">
                            <ArrowRight
                              className="w-3 h-3 mx-auto"
                              style={{ color: "var(--fg-invisible)" }}
                            />
                          </td>
                          <td
                            className="px-4 py-2.5 font-mono"
                            style={{ color: "var(--success)" }}
                          >
                            {info.targetField}
                          </td>
                          <td className="px-4 py-2.5" style={{ color: "var(--fg-secondary)" }}>
                            {formatCellValue(sourceRaw)}
                          </td>
                          <td className="text-center">
                            <ArrowRight
                              className="w-3 h-3 mx-auto"
                              style={{ color: "var(--fg-invisible)" }}
                            />
                          </td>
                          <td
                            className="px-4 py-2.5 font-medium"
                            style={{
                              color: info.error ? "var(--error)" : "var(--fg-primary)",
                            }}
                          >
                            {info.error ? info.error : formatCellValue(info.value)}
                          </td>
                          <td className="pr-3">
                            {info.error ? (
                              <AlertTriangle
                                className="w-3 h-3"
                                style={{ color: "var(--error)" }}
                              />
                            ) : (
                              <CheckCircle2
                                className="w-3 h-3"
                                style={{ color: "var(--success)" }}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* JSON view */}
            {viewMode === "json" && (
              <div className="px-4 py-3">
                <pre
                  className="rounded-lg p-3 text-xs font-mono overflow-x-auto"
                  style={{
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-dark-subtle)",
                    color: "var(--fg-secondary)",
                    maxHeight: 240,
                  }}
                >
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(currentRow).map(([, info]) => [
                        info.targetField,
                        info.value,
                      ]),
                    ),
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
