"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Loader2,
  Database,
  CheckCircle2,
  AlertCircle,
  Globe,
  Key,
} from "lucide-react";
import type { SchemaEntity } from "./index";

interface SchemaDiscoveryModalProps {
  isOpen: boolean;
  connectorName: string;
  onClose: () => void;
  onDiscover: (endpoint: string) => Promise<SchemaEntity[]>;
  onSelectEntities: (entities: SchemaEntity[]) => void;
}

type DiscoveryStatus = "idle" | "loading" | "success" | "error";

export default function SchemaDiscoveryModal({
  isOpen,
  connectorName,
  onClose,
  onDiscover,
  onSelectEntities,
}: SchemaDiscoveryModalProps) {
  const [endpoint, setEndpoint] = useState("");
  const [status, setStatus] = useState<DiscoveryStatus>("idle");
  const [discoveredEntities, setDiscoveredEntities] = useState<SchemaEntity[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleDiscover = useCallback(async () => {
    if (!endpoint.trim()) return;
    setStatus("loading");
    setError(null);
    try {
      const entities = await onDiscover(endpoint.trim());
      setDiscoveredEntities(entities);
      setSelectedIds(new Set(entities.map((e) => e.id)));
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la discovery");
      setStatus("error");
    }
  }, [endpoint, onDiscover]);

  const toggleEntity = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const selected = discoveredEntities.filter((e) => selectedIds.has(e.id));
    onSelectEntities(selected);
    onClose();
  }, [discoveredEntities, selectedIds, onSelectEntities, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0, 0, 0, 0.6)" }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl p-6 z-50"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark)",
              boxShadow: "0 25px 80px rgba(0, 0, 0, 0.5)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label={`Schema Discovery — ${connectorName}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5" style={{ color: "var(--accent)" }} />
                <h2 className="text-lg font-semibold" style={{ color: "var(--fg-primary)" }}>
                  Schema Discovery
                </h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 transition-colors"
                style={{ color: "var(--fg-muted)" }}
                aria-label="Chiudi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs mb-4" style={{ color: "var(--fg-muted)" }}>
              Inserisci l&apos;endpoint API di <strong>{connectorName}</strong> per scoprire
              automaticamente le entità e i campi disponibili.
            </p>

            {/* Endpoint input */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Key
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                  style={{ color: "var(--fg-muted)" }}
                />
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://api.example.com/v1/schema"
                  className="w-full rounded-lg pl-8 pr-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                  style={{
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-dark-subtle)",
                    color: "var(--fg-primary)",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
                  aria-label="URL endpoint API"
                />
              </div>
              <button
                onClick={handleDiscover}
                disabled={!endpoint.trim() || status === "loading"}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-40"
                style={{ background: "linear-gradient(to right, var(--accent), #E85A24)" }}
              >
                {status === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Scopri
              </button>
            </div>

            {/* Error */}
            <AnimatePresence mode="wait">
              {status === "error" && error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 mb-4 text-xs"
                  style={{
                    background: "rgba(229, 141, 120, 0.1)",
                    border: "1px solid rgba(229, 141, 120, 0.3)",
                    color: "var(--error)",
                  }}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Discovered entities */}
            {status === "success" && discoveredEntities.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-2 mb-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: "var(--success)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
                    {discoveredEntities.length} entità trovate
                  </span>
                </div>

                <div
                  className="max-h-48 overflow-y-auto rounded-lg border"
                  style={{ borderColor: "var(--border-dark-subtle)" }}
                >
                  {discoveredEntities.map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => toggleEntity(entity.id)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors border-b last:border-b-0"
                      style={{
                        borderColor: "var(--border-dark-subtle)",
                        background: selectedIds.has(entity.id)
                          ? "rgba(93, 228, 199, 0.06)"
                          : "transparent",
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                        style={{
                          borderColor: selectedIds.has(entity.id)
                            ? "var(--success)"
                            : "var(--border-dark)",
                          background: selectedIds.has(entity.id)
                            ? "var(--success)"
                            : "transparent",
                        }}
                        role="checkbox"
                        aria-checked={selectedIds.has(entity.id)}
                      >
                        {selectedIds.has(entity.id) && (
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <Database className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--fg-muted)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--fg-primary)" }}>
                          {entity.name}
                        </p>
                        <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                          {entity.fields.length} campi
                          {entity.recordCount !== undefined && ` · ${entity.recordCount.toLocaleString("it-IT")} record`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Empty state */}
            {status === "success" && discoveredEntities.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: "var(--fg-muted)" }}>
                Nessuna entità trovata su questo endpoint.
              </p>
            )}

            {/* Footer */}
            {status === "success" && discoveredEntities.length > 0 && (
              <div className="flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                  style={{ color: "var(--fg-secondary)" }}
                >
                  Annulla
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedIds.size === 0}
                  className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-40"
                  style={{ background: "linear-gradient(to right, var(--accent), #E85A24)" }}
                >
                  Importa {selectedIds.size} entità
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
