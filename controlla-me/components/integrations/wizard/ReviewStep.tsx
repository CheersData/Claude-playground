"use client";

import { motion } from "framer-motion";
import { Check, Loader2, type LucideIcon } from "lucide-react";
import type { SyncFrequency } from "./FrequencyStep";
import type { EntityOption } from "./EntitySelect";

// ─── Types ───

interface ReviewStepProps {
  connectorName: string;
  connectorCategory: string;
  connectorIcon: LucideIcon;
  selectedEntities: EntityOption[];
  mappedFieldsCount: number;
  autoMappedCount: number;
  manualMappedCount: number;
  ignoredFieldsCount: number;
  frequency: SyncFrequency;
  activateStatus: "idle" | "activating" | "success" | "error";
  onActivate: () => void;
  onGoToStep: (step: number) => void;
}

// ─── Constants ───

const FREQUENCY_LABELS: Record<SyncFrequency, string> = {
  realtime: "Tempo reale (webhook)",
  hourly: "Ogni ora",
  six_hours: "Ogni 6 ore",
  daily: "Giornaliera (06:00)",
  manual: "Manuale",
};

// ─── Component ───

export default function ReviewStep({
  connectorName,
  connectorCategory,
  connectorIcon: ConnectorIcon,
  selectedEntities,
  mappedFieldsCount,
  autoMappedCount,
  manualMappedCount,
  ignoredFieldsCount,
  frequency,
  activateStatus,
  onActivate,
  onGoToStep,
}: ReviewStepProps) {
  const totalRecords = selectedEntities.reduce((sum, e) => sum + e.recordCount, 0);

  return (
    <div>
      <h2 className="text-2xl font-semibold" style={{ color: "var(--fg-primary)" }}>
        Riepilogo integrazione
      </h2>
      <p className="text-sm mt-2" style={{ color: "var(--fg-secondary)" }}>
        Verifica le impostazioni prima di attivare la sincronizzazione.
      </p>

      {/* Summary card */}
      <div
        className="rounded-xl p-6 mt-6"
        style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark)" }}
      >
        {/* Connector header */}
        <div className="flex items-center gap-3 pb-4 mb-4" style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}>
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ background: "var(--bg-overlay)" }}
          >
            <ConnectorIcon className="w-5 h-5" style={{ color: "var(--fg-secondary)" }} />
          </div>
          <div>
            <span className="text-base font-semibold" style={{ color: "var(--fg-primary)" }}>
              {connectorName}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                {connectorCategory}
              </span>
              <span style={{ color: "var(--fg-invisible)" }}>|</span>
              <span className="text-xs" style={{ color: "var(--success)" }}>
                Connesso
              </span>
            </div>
          </div>
        </div>

        {/* Section: Dati selezionati */}
        <div className="mb-4">
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--fg-invisible)" }}
          >
            Dati Selezionati
          </h3>
          <div className="space-y-0">
            {selectedEntities.map((entity, i) => (
              <div
                key={entity.id}
                className="flex items-center justify-between py-2"
                style={{
                  borderBottom:
                    i < selectedEntities.length - 1
                      ? "1px solid var(--border-dark-subtle)"
                      : "none",
                }}
              >
                <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                  {entity.name}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
                    {entity.recordCount.toLocaleString("it-IT")} record
                  </span>
                  <button
                    onClick={() => onGoToStep(0)}
                    className="text-xs transition-colors hover:underline"
                    style={{ color: "var(--info)" }}
                  >
                    Modifica
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs mt-2" style={{ color: "var(--fg-muted)" }}>
            Totale: {totalRecords.toLocaleString("it-IT")} record
          </div>
        </div>

        {/* Section: Mapping */}
        <div className="mb-4 pt-4" style={{ borderTop: "1px solid var(--border-dark-subtle)" }}>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--fg-invisible)" }}
          >
            Mapping
          </h3>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
              {mappedFieldsCount} campi mappati ({autoMappedCount} auto, {manualMappedCount} manuali)
            </span>
            <button
              onClick={() => onGoToStep(2)}
              className="text-xs transition-colors hover:underline"
              style={{ color: "var(--info)" }}
            >
              Modifica
            </button>
          </div>
          {ignoredFieldsCount > 0 && (
            <div className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {ignoredFieldsCount} campi ignorati
            </div>
          )}
        </div>

        {/* Section: Frequenza */}
        <div className="pt-4" style={{ borderTop: "1px solid var(--border-dark-subtle)" }}>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--fg-invisible)" }}
          >
            Frequenza
          </h3>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
              {FREQUENCY_LABELS[frequency]}
            </span>
            <button
              onClick={() => onGoToStep(3)}
              className="text-xs transition-colors hover:underline"
              style={{ color: "var(--info)" }}
            >
              Modifica
            </button>
          </div>
        </div>
      </div>

      {/* Activate button */}
      <motion.button
        onClick={onActivate}
        disabled={activateStatus === "activating" || activateStatus === "success"}
        className="w-full mt-6 rounded-xl py-3 px-8 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:hover:scale-100"
        style={{
          background:
            activateStatus === "success"
              ? "var(--success)"
              : "linear-gradient(to right, #5de4c7, #34d399)",
          opacity: activateStatus === "activating" ? 0.7 : 1,
        }}
        whileTap={{ scale: 0.98 }}
      >
        {activateStatus === "idle" && "Attiva Sincronizzazione"}
        {activateStatus === "activating" && (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Attivazione in corso...
          </span>
        )}
        {activateStatus === "success" && (
          <span className="flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            Integrazione attiva!
          </span>
        )}
        {activateStatus === "error" && "Riprova attivazione"}
      </motion.button>
    </div>
  );
}
