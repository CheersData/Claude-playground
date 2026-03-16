"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X,
  ArrowRight,
  Trash2,
  Copy,
  Scissors,
  Merge,
  Code2,
  Link2,
} from "lucide-react";
import type { FieldMappingEntry, TransformRule, SchemaField } from "./index";

interface TransformEditorProps {
  mapping: FieldMappingEntry;
  sourceField: SchemaField | null;
  targetField: SchemaField | null;
  onTransformChange: (transform: TransformRule | undefined) => void;
  onRemoveMapping: () => void;
  onClose: () => void;
}

const TRANSFORM_TYPES: {
  type: TransformRule["type"];
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "direct", label: "Diretto", description: "Copia senza modifiche", icon: Link2 },
  { type: "rename", label: "Rinomina", description: "Copia con nome diverso", icon: Copy },
  { type: "format", label: "Formato", description: "Applica formattazione (data, valuta...)", icon: Code2 },
  { type: "concat", label: "Concatena", description: "Unisci più campi", icon: Merge },
  { type: "split", label: "Dividi", description: "Dividi in sotto-campi", icon: Scissors },
  { type: "custom", label: "Custom", description: "Espressione personalizzata", icon: Code2 },
];

export default function TransformEditor({
  mapping,
  sourceField,
  targetField,
  onTransformChange,
  onRemoveMapping,
  onClose,
}: TransformEditorProps) {
  const [activeType, setActiveType] = useState<TransformRule["type"]>(
    mapping.transform?.type ?? "direct",
  );
  const [expression, setExpression] = useState(mapping.transform?.expression ?? "");
  const [formatPattern, setFormatPattern] = useState(
    (mapping.transform?.config?.pattern as string) ?? "",
  );

  const handleTypeChange = useCallback(
    (type: TransformRule["type"]) => {
      setActiveType(type);
      if (type === "direct") {
        onTransformChange(undefined);
      } else {
        onTransformChange({
          type,
          expression: type === "custom" ? expression : undefined,
          config: type === "format" ? { pattern: formatPattern } : undefined,
          label: TRANSFORM_TYPES.find((t) => t.type === type)?.label,
        });
      }
    },
    [expression, formatPattern, onTransformChange],
  );

  const handleExpressionSave = useCallback(() => {
    onTransformChange({
      type: activeType,
      expression: activeType === "custom" ? expression : undefined,
      config: activeType === "format" ? { pattern: formatPattern } : undefined,
      label: TRANSFORM_TYPES.find((t) => t.type === activeType)?.label,
    });
  }, [activeType, expression, formatPattern, onTransformChange]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] rounded-xl p-4 space-y-3"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark)",
        boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
        zIndex: 20,
      }}
      role="dialog"
      aria-label="Editor trasformazione mapping"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
          Trasformazione
        </h4>
        <button
          onClick={onClose}
          className="rounded-lg p-1 transition-colors"
          style={{ color: "var(--fg-muted)" }}
          aria-label="Chiudi editor"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Field pair */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        <span className="font-medium truncate" style={{ color: "var(--info)" }}>
          {sourceField?.name ?? mapping.sourceFieldId}
        </span>
        <ArrowRight className="w-3 h-3 shrink-0" style={{ color: "var(--fg-muted)" }} />
        <span className="font-medium truncate" style={{ color: "var(--success)" }}>
          {targetField?.name ?? mapping.targetFieldId}
        </span>
        {mapping.confidence !== undefined && (
          <span
            className="ml-auto shrink-0 text-[10px] font-semibold"
            style={{
              color:
                mapping.confidence >= 90
                  ? "var(--success)"
                  : mapping.confidence >= 70
                    ? "var(--caution)"
                    : "var(--error)",
            }}
          >
            {mapping.confidence}%
          </span>
        )}
      </div>

      {/* Transform type selector */}
      <div className="grid grid-cols-3 gap-1.5">
        {TRANSFORM_TYPES.map(({ type, label, icon: TypeIcon }) => (
          <button
            key={type}
            onClick={() => handleTypeChange(type)}
            className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-medium transition-colors"
            style={{
              background: activeType === type ? "rgba(255, 107, 53, 0.12)" : "transparent",
              border: `1px solid ${activeType === type ? "var(--accent)" : "var(--border-dark-subtle)"}`,
              color: activeType === type ? "var(--accent)" : "var(--fg-muted)",
            }}
            aria-pressed={activeType === type}
          >
            <TypeIcon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Transform config */}
      {activeType === "format" && (
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
            Pattern formato
          </label>
          <input
            type="text"
            value={formatPattern}
            onChange={(e) => setFormatPattern(e.target.value)}
            onBlur={handleExpressionSave}
            placeholder="es. DD/MM/YYYY, €#,##0.00"
            className="w-full rounded-lg px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-primary)",
            }}
          />
        </div>
      )}

      {activeType === "custom" && (
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
            Espressione
          </label>
          <textarea
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onBlur={handleExpressionSave}
            placeholder="es. source.trim().toUpperCase()"
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 font-mono"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-primary)",
            }}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onRemoveMapping}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ color: "var(--error)" }}
          aria-label="Rimuovi mapping"
        >
          <Trash2 className="w-3 h-3" />
          Rimuovi
        </button>
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition-all hover:scale-[1.02]"
          style={{ background: "var(--accent)" }}
        >
          Conferma
        </button>
      </div>
    </motion.div>
  );
}
