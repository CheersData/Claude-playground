"use client";

import { motion } from "framer-motion";
import { Check, Clock } from "lucide-react";

// ─── Types ───

export interface EntityOption {
  id: string;
  name: string;
  recordCount: number;
  lastUpdated: string | null;
  fields: string[];
}

interface EntitySelectProps {
  entities: EntityOption[];
  selected: string[];
  onToggle: (entityId: string) => void;
  onToggleAll: () => void;
}

// ─── Helpers ───

function formatLastUpdated(ts: string | null): string {
  if (!ts) return "N/A";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

function formatRecordCount(n: number): string {
  return n.toLocaleString("it-IT");
}

// ─── Component ───

export default function EntitySelect({ entities, selected, onToggle, onToggleAll }: EntitySelectProps) {
  const allSelected = entities.length > 0 && selected.length === entities.length;
  const totalRecords = entities
    .filter((e) => selected.includes(e.id))
    .reduce((sum, e) => sum + e.recordCount, 0);

  return (
    <div>
      {/* Header */}
      <h2 className="text-2xl font-semibold" style={{ color: "var(--fg-primary)" }}>
        Seleziona i dati da sincronizzare
      </h2>
      <p className="text-sm mt-2" style={{ color: "var(--fg-secondary)" }}>
        Scegli le entita da importare nella piattaforma
      </p>

      {/* Select all row */}
      <div
        className="flex items-center justify-between mt-6 rounded-xl px-4 py-3 cursor-pointer select-none"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-dark-subtle)" }}
        onClick={onToggleAll}
        role="checkbox"
        aria-checked={allSelected}
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggleAll()}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center transition-colors"
            style={{
              background: allSelected ? "var(--accent)" : "var(--bg-base)",
              border: allSelected ? "1px solid var(--accent)" : "1px solid var(--border-dark)",
            }}
          >
            {allSelected && <Check className="w-3.5 h-3.5 text-white" />}
          </div>
          <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            Seleziona tutto
          </span>
        </div>
        <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
          {selected.length} di {entities.length} selezionati
        </span>
      </div>

      {/* Entity list */}
      <div className="mt-4 space-y-2">
        {entities.map((entity) => {
          const isSelected = selected.includes(entity.id);
          return (
            <motion.div
              key={entity.id}
              layout
              onClick={() => onToggle(entity.id)}
              className="rounded-xl p-4 cursor-pointer transition-colors select-none"
              style={{
                background: isSelected ? "rgba(255, 107, 53, 0.05)" : "var(--bg-overlay)",
                border: isSelected
                  ? "1px solid rgba(255, 107, 53, 0.2)"
                  : "1px solid var(--border-dark-subtle)",
              }}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onToggle(entity.id)}
              whileHover={{ borderColor: "var(--border-dark)" }}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                  style={{
                    background: isSelected ? "var(--accent)" : "var(--bg-base)",
                    border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border-dark)",
                  }}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Entity name */}
                  <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
                    {entity.name}
                  </span>

                  {/* Record count + last updated */}
                  <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
                    <span>{formatRecordCount(entity.recordCount)} record</span>
                    <span style={{ color: "var(--fg-invisible)" }}>|</span>
                    <span>Ultimo agg: {formatLastUpdated(entity.lastUpdated)}</span>
                  </div>

                  {/* Fields preview */}
                  {isSelected && entity.fields.length > 0 && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-xs mt-1"
                      style={{ color: "var(--fg-invisible)" }}
                    >
                      {entity.fields.join(", ")}
                    </motion.p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Estimation */}
      {selected.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 mt-4 rounded-lg p-3 text-xs"
          style={{ background: "var(--bg-overlay)", color: "var(--fg-muted)" }}
        >
          <Clock className="w-4 h-4 shrink-0" style={{ color: "var(--info-bright)" }} />
          <span>
            Stima sincronizzazione: ~{formatRecordCount(totalRecords)} record, ~
            {Math.max(1, Math.ceil(totalRecords / 10_000))} minuti
          </span>
        </motion.div>
      )}
    </div>
  );
}
