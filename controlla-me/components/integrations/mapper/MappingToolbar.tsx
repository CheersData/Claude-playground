"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  Trash2,
  Download,
  Upload,
  Undo2,
  RotateCcw,
  Save,
  Loader2,
} from "lucide-react";

interface MappingToolbarProps {
  mappingCount: number;
  totalFields: number;
  canUndo?: boolean;
  isSaving?: boolean;
  onAutoMap: () => void;
  onClearAll: () => void;
  onUndo?: () => void;
  onReset?: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onSave?: () => void;
}

export default function MappingToolbar({
  mappingCount,
  totalFields,
  canUndo,
  isSaving,
  onAutoMap,
  onClearAll,
  onUndo,
  onReset,
  onExport,
  onImport,
  onSave,
}: MappingToolbarProps) {
  const completionPct = totalFields > 0 ? Math.round((mappingCount / totalFields) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-2 rounded-xl px-4 py-2.5"
      style={{
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-dark-subtle)",
      }}
      role="toolbar"
      aria-label="Azioni mapping"
    >
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mr-2">
        <div
          className="w-24 h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--bg-base)" }}
          role="progressbar"
          aria-valuenow={completionPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Completamento mapping: ${completionPct}%`}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background:
                completionPct === 100
                  ? "var(--success)"
                  : "linear-gradient(to right, var(--accent), #E85A24)",
            }}
            initial={{ width: 0 }}
            animate={{ width: `${completionPct}%` }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--fg-secondary)" }}>
          {mappingCount}/{totalFields}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-5" style={{ background: "var(--border-dark-subtle)" }} />

      {/* Auto-map */}
      <ToolbarButton
        icon={Sparkles}
        label="Auto-map AI"
        onClick={onAutoMap}
        accent
      />

      {/* Undo */}
      {onUndo && (
        <ToolbarButton
          icon={Undo2}
          label="Annulla"
          onClick={onUndo}
          disabled={!canUndo}
        />
      )}

      {/* Reset */}
      {onReset && (
        <ToolbarButton
          icon={RotateCcw}
          label="Reset"
          onClick={onReset}
          disabled={mappingCount === 0}
        />
      )}

      {/* Clear all */}
      <ToolbarButton
        icon={Trash2}
        label="Cancella tutto"
        onClick={onClearAll}
        disabled={mappingCount === 0}
        danger
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Import/Export */}
      {onImport && (
        <ToolbarButton icon={Upload} label="Importa" onClick={onImport} />
      )}
      {onExport && (
        <ToolbarButton
          icon={Download}
          label="Esporta"
          onClick={onExport}
          disabled={mappingCount === 0}
        />
      )}

      {/* Save */}
      {onSave && (
        <button
          onClick={onSave}
          disabled={isSaving || mappingCount === 0}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
          style={{
            background: "linear-gradient(to right, var(--accent), #E85A24)",
          }}
          aria-label="Salva mapping"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Salva
        </button>
      )}
    </motion.div>
  );
}

// ─── Toolbar button helper ──────────────────────────────────────────

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  accent,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-30"
      style={{
        color: danger
          ? "var(--error)"
          : accent
            ? "var(--accent)"
            : "var(--fg-secondary)",
      }}
      title={label}
      aria-label={label}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
