"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Shield,
  ArrowRight,
} from "lucide-react";
import type { SchemaEntity, FieldMappingEntry } from "./index";

// ─── Types ──────────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  message: string;
  detail?: string;
  fieldId?: string;
  mappingId?: string;
  autoFixable?: boolean;
}

interface ValidationPanelProps {
  sourceEntity: SchemaEntity | null;
  targetEntity: SchemaEntity | null;
  mappings: FieldMappingEntry[];
  /** External issues injected by parent (e.g., from server validation) */
  externalIssues?: ValidationIssue[];
  onNavigateToField?: (fieldId: string) => void;
  onAutoFix?: (issueId: string) => void;
}

// ─── Validation Rules ───────────────────────────────────────────────

function validateMappings(
  sourceEntity: SchemaEntity | null,
  targetEntity: SchemaEntity | null,
  mappings: FieldMappingEntry[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!sourceEntity || !targetEntity) return issues;

  // 1. Required target fields not mapped
  for (const field of targetEntity.fields) {
    if (field.required) {
      const isMapped = mappings.some((m) => m.targetFieldId === field.id);
      if (!isMapped) {
        issues.push({
          id: `req-${field.id}`,
          severity: "error",
          message: `Campo obbligatorio "${field.name}" non mappato`,
          detail: `Il campo destinazione "${field.name}" e contrassegnato come obbligatorio ma non ha un mapping sorgente.`,
          fieldId: field.id,
        });
      }
    }
  }

  // 2. Type mismatches
  for (const mapping of mappings) {
    const sourceField = sourceEntity.fields.find((f) => f.id === mapping.sourceFieldId);
    const targetField = targetEntity.fields.find((f) => f.id === mapping.targetFieldId);

    if (sourceField && targetField && sourceField.type !== targetField.type) {
      const isCoercible = canCoerce(sourceField.type, targetField.type);
      issues.push({
        id: `type-${mapping.id}`,
        severity: isCoercible ? "warning" : "error",
        message: `Tipo incompatibile: ${sourceField.type} -> ${targetField.type}`,
        detail: `"${sourceField.name}" (${sourceField.type}) viene mappato su "${targetField.name}" (${targetField.type}).${isCoercible ? " Conversione automatica possibile." : " Richiede una trasformazione esplicita."}`,
        fieldId: sourceField.id,
        mappingId: mapping.id,
        autoFixable: isCoercible,
      });
    }
  }

  // 3. Duplicate target mappings
  const targetCounts = new Map<string, string[]>();
  for (const mapping of mappings) {
    const existing = targetCounts.get(mapping.targetFieldId) ?? [];
    existing.push(mapping.sourceFieldId);
    targetCounts.set(mapping.targetFieldId, existing);
  }
  for (const [targetId, sourceIds] of targetCounts) {
    if (sourceIds.length > 1) {
      const targetField = targetEntity.fields.find((f) => f.id === targetId);
      issues.push({
        id: `dup-${targetId}`,
        severity: "warning",
        message: `Campo "${targetField?.name ?? targetId}" ha ${sourceIds.length} mapping sorgente`,
        detail: `Piu campi sorgente sono mappati sulla stessa destinazione. Solo l'ultimo valore verra usato, a meno che non sia definita una regola di concatenazione.`,
        fieldId: targetId,
      });
    }
  }

  // 4. Low confidence mappings
  const lowConfidence = mappings.filter(
    (m) => m.confidence !== undefined && m.confidence < 70,
  );
  if (lowConfidence.length > 0) {
    for (const mapping of lowConfidence) {
      const sourceField = sourceEntity.fields.find((f) => f.id === mapping.sourceFieldId);
      issues.push({
        id: `conf-${mapping.id}`,
        severity: "info",
        message: `Confidenza bassa (${mapping.confidence}%) per "${sourceField?.name ?? mapping.sourceFieldId}"`,
        detail: `Verifica che il mapping sia corretto. I mapping con confidenza sotto il 70% potrebbero essere imprecisi.`,
        fieldId: mapping.sourceFieldId,
        mappingId: mapping.id,
      });
    }
  }

  // 5. Unmapped source fields (informational)
  const mappedSourceIds = new Set(mappings.map((m) => m.sourceFieldId));
  const unmappedSource = sourceEntity.fields.filter((f) => !mappedSourceIds.has(f.id));
  if (unmappedSource.length > 0 && unmappedSource.length <= 5) {
    for (const field of unmappedSource) {
      issues.push({
        id: `unmap-${field.id}`,
        severity: "info",
        message: `Campo sorgente "${field.name}" non mappato`,
        detail: `Questo campo non verra trasferito nella destinazione.`,
        fieldId: field.id,
      });
    }
  } else if (unmappedSource.length > 5) {
    issues.push({
      id: "unmap-many",
      severity: "info",
      message: `${unmappedSource.length} campi sorgente non mappati`,
      detail: `Questi campi non verranno trasferiti nella destinazione. Verifica se sono necessari.`,
    });
  }

  return issues;
}

function canCoerce(from: string, to: string): boolean {
  const coercionMap: Record<string, string[]> = {
    string: ["number", "boolean", "date", "enum"],
    number: ["string"],
    boolean: ["string", "number"],
    date: ["string"],
    enum: ["string"],
  };
  return coercionMap[from]?.includes(to) ?? false;
}

// ─── Severity config ────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  ValidationSeverity,
  {
    icon: typeof AlertCircle;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
  }
> = {
  error: {
    icon: AlertCircle,
    color: "var(--error)",
    bgColor: "rgba(229, 141, 120, 0.08)",
    borderColor: "rgba(229, 141, 120, 0.2)",
    label: "Errori",
  },
  warning: {
    icon: AlertTriangle,
    color: "var(--caution)",
    bgColor: "rgba(255, 252, 194, 0.08)",
    borderColor: "rgba(255, 252, 194, 0.2)",
    label: "Avvisi",
  },
  info: {
    icon: Info,
    color: "var(--info)",
    bgColor: "rgba(173, 215, 255, 0.08)",
    borderColor: "rgba(173, 215, 255, 0.2)",
    label: "Info",
  },
};

// ─── Component ──────────────────────────────────────────────────────

export default function ValidationPanel({
  sourceEntity,
  targetEntity,
  mappings,
  externalIssues = [],
  onNavigateToField,
  onAutoFix,
}: ValidationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<ValidationSeverity | "all">("all");
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  // Run validation rules
  const computedIssues = useMemo(
    () => validateMappings(sourceEntity, targetEntity, mappings),
    [sourceEntity, targetEntity, mappings],
  );

  const allIssues = useMemo(
    () => [...computedIssues, ...externalIssues],
    [computedIssues, externalIssues],
  );

  // Count by severity
  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const issue of allIssues) {
      c[issue.severity]++;
    }
    return c;
  }, [allIssues]);

  const filteredIssues = useMemo(
    () =>
      filterSeverity === "all"
        ? allIssues
        : allIssues.filter((i) => i.severity === filterSeverity),
    [allIssues, filterSeverity],
  );

  const isValid = counts.error === 0;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: `1px solid ${isValid ? "var(--border-dark-subtle)" : "rgba(229, 141, 120, 0.3)"}`,
      }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 text-left transition-colors"
        style={{ borderBottom: isExpanded ? "1px solid var(--border-dark-subtle)" : "none" }}
        aria-expanded={isExpanded}
        aria-controls="validation-panel-content"
      >
        <div className="flex items-center gap-2">
          <Shield
            className="w-4 h-4"
            style={{ color: isValid ? "var(--success)" : "var(--error)" }}
          />
          <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
            Validazione
          </h3>
          {isValid ? (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background: "rgba(93, 228, 199, 0.12)",
                color: "var(--success)",
              }}
            >
              <CheckCircle2 className="w-2.5 h-2.5" />
              Valido
            </span>
          ) : (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background: "rgba(229, 141, 120, 0.12)",
                color: "var(--error)",
              }}
            >
              {counts.error} errori
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Severity badges */}
          <div className="flex items-center gap-1.5">
            {(["error", "warning", "info"] as const).map((sev) => {
              if (counts[sev] === 0) return null;
              const cfg = SEVERITY_CONFIG[sev];
              return (
                <span
                  key={sev}
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                  style={{ background: cfg.bgColor, color: cfg.color }}
                >
                  {counts[sev]}
                </span>
              );
            })}
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
            id="validation-panel-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {/* Filter bar */}
            {allIssues.length > 0 && (
              <div
                className="flex items-center gap-1 px-4 py-2"
                style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
              >
                <button
                  onClick={() => setFilterSeverity("all")}
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                  style={{
                    background: filterSeverity === "all" ? "var(--accent)" : "transparent",
                    color: filterSeverity === "all" ? "#fff" : "var(--fg-muted)",
                    border: `1px solid ${filterSeverity === "all" ? "var(--accent)" : "var(--border-dark-subtle)"}`,
                  }}
                  aria-pressed={filterSeverity === "all"}
                >
                  Tutti ({allIssues.length})
                </button>
                {(["error", "warning", "info"] as const).map((sev) => {
                  if (counts[sev] === 0) return null;
                  const cfg = SEVERITY_CONFIG[sev];
                  return (
                    <button
                      key={sev}
                      onClick={() => setFilterSeverity(filterSeverity === sev ? "all" : sev)}
                      className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                      style={{
                        background: filterSeverity === sev ? cfg.color : "transparent",
                        color: filterSeverity === sev ? "#fff" : cfg.color,
                        border: `1px solid ${filterSeverity === sev ? cfg.color : cfg.borderColor}`,
                      }}
                      aria-pressed={filterSeverity === sev}
                    >
                      {cfg.label} ({counts[sev]})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Issues list */}
            <div
              className="max-h-64 overflow-y-auto"
              role="list"
              aria-label="Lista problemi di validazione"
            >
              {filteredIssues.length === 0 && allIssues.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8">
                  <CheckCircle2 className="w-5 h-5" style={{ color: "var(--success)" }} />
                  <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                    Nessun problema rilevato. Il mapping e valido.
                  </p>
                </div>
              )}

              {filteredIssues.length === 0 && allIssues.length > 0 && (
                <p className="text-xs text-center py-6" style={{ color: "var(--fg-muted)" }}>
                  Nessun problema con questo filtro
                </p>
              )}

              <AnimatePresence mode="popLayout">
                {filteredIssues.map((issue) => {
                  const cfg = SEVERITY_CONFIG[issue.severity];
                  const Icon = cfg.icon;
                  const isDetailExpanded = expandedIssueId === issue.id;

                  return (
                    <motion.div
                      key={issue.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="px-4 py-3 transition-colors"
                      style={{
                        borderBottom: "1px solid var(--border-dark-subtle)",
                        background: isDetailExpanded ? cfg.bgColor : "transparent",
                      }}
                      role="listitem"
                    >
                      <div className="flex items-start gap-2">
                        <Icon
                          className="w-3.5 h-3.5 shrink-0 mt-0.5"
                          style={{ color: cfg.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium" style={{ color: "var(--fg-primary)" }}>
                            {issue.message}
                          </p>

                          {/* Detail toggle */}
                          {issue.detail && (
                            <button
                              onClick={() =>
                                setExpandedIssueId(isDetailExpanded ? null : issue.id)
                              }
                              className="text-[10px] mt-1 transition-colors"
                              style={{ color: "var(--fg-muted)" }}
                              aria-expanded={isDetailExpanded}
                            >
                              {isDetailExpanded ? "Nascondi dettagli" : "Mostra dettagli"}
                            </button>
                          )}

                          <AnimatePresence>
                            {isDetailExpanded && issue.detail && (
                              <motion.p
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="text-[11px] mt-1.5 leading-relaxed overflow-hidden"
                                style={{ color: "var(--fg-secondary)" }}
                              >
                                {issue.detail}
                              </motion.p>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {issue.autoFixable && onAutoFix && (
                            <button
                              onClick={() => onAutoFix(issue.id)}
                              className="rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors"
                              style={{
                                background: "rgba(255, 107, 53, 0.1)",
                                color: "var(--accent)",
                                border: "1px solid rgba(255, 107, 53, 0.3)",
                              }}
                              aria-label={`Correggi automaticamente: ${issue.message}`}
                            >
                              Fix
                            </button>
                          )}
                          {issue.fieldId && onNavigateToField && (
                            <button
                              onClick={() => onNavigateToField(issue.fieldId!)}
                              className="rounded-lg p-1 transition-colors"
                              style={{ color: "var(--fg-muted)" }}
                              aria-label={`Vai al campo ${issue.fieldId}`}
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
