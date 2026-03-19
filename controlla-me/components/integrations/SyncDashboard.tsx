"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  MoreHorizontal,
  AlertTriangle,
  Pause,
  Play,
  Settings,
  Unplug,
  ChevronDown,
  ChevronUp,
  Loader2,
  type LucideIcon,
  CreditCard,
  Users,
  HardDrive,
  Building2,
  Plug,
} from "lucide-react";
import { SyncDashboardSkeleton } from "@/components/integrations/Skeletons";
import { NoConnectors } from "@/components/integrations/EmptyStates";

// ─── Types ───

type SyncStatus = "synced" | "syncing" | "error" | "paused" | "disabled";

interface SyncEntity {
  name: string;
  recordCount: number;
}

interface SyncErrorEntry {
  timestamp: string;
  connector: string;
  message: string;
  details?: string;
}

interface IntegrationRow {
  id: string;
  name: string;
  category: string;
  icon: string;
  status: SyncStatus;
  lastSync: string | null;
  nextSync: string | null;
  recordCount: number;
  entities: SyncEntity[];
  progress?: number;
  progressRecords?: number;
  progressTotal?: number;
  error?: string;
}

// ─── Constants ───

const ICON_MAP: Record<string, LucideIcon> = {
  CreditCard,
  Users,
  HardDrive,
  Building2,
};

const STATUS_CONFIG: Record<
  SyncStatus,
  { label: string; dotClass: string; textColor: string }
> = {
  synced: {
    label: "Sincronizzato",
    dotClass: "bg-[var(--success)]",
    textColor: "var(--success)",
  },
  syncing: {
    label: "In sync...",
    dotClass: "bg-[var(--info-bright)] animate-pulse",
    textColor: "var(--info-bright)",
  },
  error: {
    label: "Errore",
    dotClass: "bg-[var(--error)]",
    textColor: "var(--error)",
  },
  paused: {
    label: "In pausa",
    dotClass: "bg-[var(--caution)]",
    textColor: "var(--caution)",
  },
  disabled: {
    label: "Disattivato",
    dotClass: "bg-[var(--fg-invisible)]",
    textColor: "var(--fg-invisible)",
  },
};

// ─── Helpers ───

function formatTime(ts: string | null): string {
  if (!ts) return "--";
  const d = new Date(ts);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function formatRecords(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("it-IT");
}

// ─── Stats Bar ───

function StatsBar({ integrations }: { integrations: IntegrationRow[] }) {
  const active = integrations.filter((i) => i.status !== "disabled").length;
  const totalRecords = integrations.reduce((sum, i) => sum + i.recordCount, 0);
  const errors = integrations.filter((i) => i.status === "error").length;

  const stats = [
    { label: "Integrazioni attive", value: active, color: "var(--fg-primary)" },
    { label: "Record sincronizzati", value: formatRecords(totalRecords), color: "var(--fg-primary)" },
    {
      label: "Errori da risolvere",
      value: errors,
      color: errors > 0 ? "var(--error)" : "var(--fg-primary)",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl p-5 text-center"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dark-subtle)",
          }}
        >
          <div className="text-3xl font-bold" style={{ color: stat.color }}>
            {stat.value}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Integration Row Card ───

function IntegrationCard({
  integration,
  onSync,
  onPause,
  onResume,
}: {
  integration: IntegrationRow;
  onSync: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [entitiesExpanded, setEntitiesExpanded] = useState(false);

  const IconComponent = ICON_MAP[integration.icon] || Plug;
  const statusConfig = STATUS_CONFIG[integration.status];
  const isSyncing = integration.status === "syncing";
  const isError = integration.status === "error";
  const isPaused = integration.status === "paused";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-6 mb-3 transition-colors hover-border-dark"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
            style={{ background: "var(--bg-overlay)" }}
          >
            <IconComponent className="w-5 h-5" style={{ color: "var(--fg-secondary)" }} />
          </div>
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--fg-primary)" }}>
              {integration.name}
            </h3>
            <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {integration.category}
            </span>
          </div>
        </div>

        {/* Actions menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg transition-colors hover-bg-overlay"
            style={{ color: "var(--fg-muted)" }}
            aria-label="Menu azioni"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 z-50 rounded-xl py-1 min-w-[180px]"
                  style={{
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-dark)",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
                  }}
                >
                  <MenuItem
                    icon={RefreshCw}
                    label="Sync manuale"
                    onClick={() => {
                      onSync(integration.id);
                      setMenuOpen(false);
                    }}
                  />
                  <MenuItem icon={Settings} label="Configura mapping" onClick={() => setMenuOpen(false)} />
                  {isPaused ? (
                    <MenuItem
                      icon={Play}
                      label="Riprendi"
                      onClick={() => {
                        onResume(integration.id);
                        setMenuOpen(false);
                      }}
                    />
                  ) : (
                    <MenuItem
                      icon={Pause}
                      label="Pausa"
                      onClick={() => {
                        onPause(integration.id);
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  <div className="my-1" style={{ borderTop: "1px solid var(--border-dark-subtle)" }} />
                  <MenuItem icon={Unplug} label="Disconnetti" danger onClick={() => setMenuOpen(false)} />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dotClass}`} />
        <span style={{ color: statusConfig.textColor }}>{statusConfig.label}</span>

        <span style={{ color: "var(--fg-invisible)" }}>|</span>
        <span style={{ color: "var(--fg-muted)" }}>
          Ultimo sync: {formatTime(integration.lastSync)}
        </span>

        <span style={{ color: "var(--fg-invisible)" }}>|</span>
        <span style={{ color: "var(--fg-muted)" }}>
          Prossimo: {isPaused ? "-- (in pausa)" : formatTime(integration.nextSync)}
        </span>

        <span style={{ color: "var(--fg-invisible)" }}>|</span>
        <span style={{ color: "var(--info-bright)" }}>
          {formatRecords(integration.recordCount)} record
        </span>
      </div>

      {/* Entities breakdown (expandable) */}
      {integration.entities.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setEntitiesExpanded(!entitiesExpanded)}
            className="flex items-center gap-1 text-xs transition-colors"
            style={{ color: "var(--fg-muted)" }}
          >
            {entitiesExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            Dettaglio entita
          </button>
          <AnimatePresence>
            {entitiesExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-2 mt-2">
                  {integration.entities.map((entity) => (
                    <span
                      key={entity.name}
                      className="rounded-full px-3 py-1 text-xs"
                      style={{
                        background: "var(--bg-overlay)",
                        color: "var(--fg-secondary)",
                      }}
                    >
                      {entity.name}: {formatRecords(entity.recordCount)}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Progress bar (syncing) */}
      {isSyncing && integration.progress !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: "var(--fg-muted)" }}>
              {integration.progressRecords?.toLocaleString("it-IT")}/
              {integration.progressTotal?.toLocaleString("it-IT")} record
            </span>
            <span style={{ color: "var(--info-bright)" }}>{integration.progress}%</span>
          </div>
          <div
            className="rounded-full h-2 overflow-hidden"
            style={{ background: "var(--bg-overlay)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                width: `${integration.progress}%`,
              }}
              initial={false}
              animate={{ width: `${integration.progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      {/* Error banner */}
      {isError && integration.error && (
        <div
          className="flex items-start gap-2 rounded-lg p-4 mt-3 text-sm"
          style={{
            background: "rgba(229, 141, 120, 0.1)",
            border: "1px solid rgba(229, 141, 120, 0.2)",
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--error)" }} />
          <div className="flex-1">
            <span style={{ color: "var(--error)" }}>{integration.error}</span>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => onSync(integration.id)}
                className="text-xs font-medium transition-colors hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Riprova ora
              </button>
              <button
                className="text-xs transition-colors hover:underline"
                style={{ color: "var(--fg-muted)" }}
              >
                Vedi dettagli
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paused CTA */}
      {isPaused && (
        <button
          onClick={() => onResume(integration.id)}
          className="mt-3 flex items-center gap-2 text-sm font-medium transition-colors hover:underline"
          style={{ color: "var(--accent)" }}
        >
          <Play className="w-3.5 h-3.5" />
          Riprendi sync
        </button>
      )}
    </motion.div>
  );
}

// ─── Menu Item ───

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-4 py-2 text-sm transition-colors hover-bg-hover"
      style={{
        color: danger ? "var(--error)" : "var(--fg-secondary)",
      }}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ─── Error Log ───

function ErrorLog({ errors }: { errors: SyncErrorEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedDetail, setExpandedDetail] = useState<number | null>(null);

  if (errors.length === 0) return null;

  return (
    <div
      className="rounded-xl mt-6"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Header (toggle) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full p-4 text-sm font-medium"
        style={{ color: "var(--fg-secondary)" }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" style={{ color: "var(--error)" }} />
          <span>Log Errori ({errors.length})</span>
        </div>
        <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
          {expanded ? "Comprimi" : "Espandi"}
        </span>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 space-y-2"
              style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
            >
              {errors.map((err, i) => (
                <div
                  key={i}
                  className="rounded-lg p-3"
                  style={{
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-dark-subtle)",
                  }}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span style={{ color: "var(--fg-muted)" }}>{err.timestamp}</span>
                    <span className="font-medium" style={{ color: "var(--fg-primary)" }}>
                      {err.connector}
                    </span>
                    <span style={{ color: "var(--fg-invisible)" }}>|</span>
                    <span style={{ color: "var(--error)" }}>{err.message}</span>
                  </div>

                  {err.details && (
                    <>
                      <button
                        onClick={() => setExpandedDetail(expandedDetail === i ? null : i)}
                        className="text-xs mt-1 transition-colors hover:underline"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        {expandedDetail === i ? "Nascondi" : "Espandi"} dettagli
                      </button>
                      <AnimatePresence>
                        {expandedDetail === i && (
                          <motion.pre
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-xs font-mono mt-2 p-2 rounded overflow-x-auto"
                            style={{
                              background: "var(--bg-base)",
                              color: "var(--fg-muted)",
                            }}
                          >
                            {err.details}
                          </motion.pre>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───

export default function SyncDashboard() {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [errors, setErrors] = useState<SyncErrorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (isBackgroundPoll = false) => {
    if (!isBackgroundPoll) setLoading(true);
    try {
      const res = await fetch("/api/integrations/dashboard");
      if (res.ok) {
        const json = await res.json();
        setIntegrations(json?.integrations ?? []);
        setErrors(json?.errors ?? []);
        setFetchError(null);
      } else {
        // API returned an error — show empty state with error message
        if (!isBackgroundPoll) {
          setIntegrations([]);
          setErrors([]);
          setFetchError(`Errore dal server (${res.status}). Riprova.`);
        }
      }
    } catch {
      // Network error — show error state on first load, ignore during polling
      if (!isBackgroundPoll) {
        setIntegrations([]);
        setErrors([]);
        setFetchError("Impossibile raggiungere il server. Verifica la connessione e riprova.");
      }
    } finally {
      if (!isBackgroundPoll) setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time polling: 3s when any integration is syncing, 30s otherwise
  const hasSyncing = integrations.some((i) => i.status === "syncing");

  useEffect(() => {
    const interval = hasSyncing ? 3000 : 30000;

    if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    pollRef.current = setInterval(() => fetchData(true), interval);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasSyncing, fetchData]);

  const dashboardAction = useCallback(
    async (connectorId: string, action: "sync" | "pause" | "resume" | "disconnect") => {
      try {
        const res = await fetch("/api/integrations/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, connectorId }),
        });
        if (res.ok) {
          // Refresh data from server after action
          fetchData();
        }
      } catch (err) {
        console.error(`[SyncDashboard] ${action} failed for ${connectorId}:`, err);
      }
    },
    [fetchData]
  );

  const handleSync = useCallback((id: string) => {
    // Optimistic UI update
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: "syncing" as SyncStatus, progress: 0, progressRecords: 0, progressTotal: i.recordCount }
          : i
      )
    );
    dashboardAction(id, "sync");
  }, [dashboardAction]);

  const handlePause = useCallback((id: string) => {
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "paused" as SyncStatus, nextSync: null } : i))
    );
    dashboardAction(id, "pause");
  }, [dashboardAction]);

  const handleResume = useCallback((id: string) => {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: "synced" as SyncStatus, nextSync: new Date(Date.now() + 60 * 60_000).toISOString() }
          : i
      )
    );
    dashboardAction(id, "resume");
  }, [dashboardAction]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--fg-primary)" }}>
      {/* Header */}
      <header className="pt-8 pb-6 px-6 md:px-10 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/integrazione"
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border-dark-subtle)",
              }}
              aria-label="Torna alle integrazioni"
            >
              <ArrowLeft className="w-4 h-4" style={{ color: "var(--fg-secondary)" }} />
            </Link>
            <div>
              <h1
                className="font-serif text-3xl md:text-4xl tracking-tight"
                style={{ color: "var(--fg-primary)" }}
              >
                Sync Dashboard
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--fg-secondary)" }}>
                Monitora lo stato delle tue integrazioni
              </p>
            </div>
          </div>

          <Link
            href="/integrazione"
            className="flex items-center gap-2 rounded-xl py-2.5 px-4 text-sm font-medium text-white transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
            }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuova Integrazione</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="px-6 md:px-10 pb-16 max-w-[1400px] mx-auto">
        {loading ? (
          <SyncDashboardSkeleton />
        ) : fetchError ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--error)" }} />
            <p className="text-sm mb-4" style={{ color: "var(--fg-secondary)" }}>
              {fetchError}
            </p>
            <button
              onClick={() => fetchData()}
              className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-sm font-medium text-white transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Riprova
            </button>
          </div>
        ) : integrations.length === 0 ? (
          <NoConnectors />
        ) : (
          <>
            <StatsBar integrations={integrations} />

            {/* Syncing indicator */}
            {hasSyncing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-lg text-sm"
                style={{
                  background: "rgba(137, 221, 255, 0.06)",
                  border: "1px solid rgba(137, 221, 255, 0.15)",
                }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--info-bright)" }} />
                <span style={{ color: "var(--info-bright)" }}>
                  Sincronizzazione in corso — aggiornamento automatico ogni 3 secondi
                </span>
              </motion.div>
            )}

            {/* Integration list */}
            <div>
              {integrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onSync={handleSync}
                  onPause={handlePause}
                  onResume={handleResume}
                />
              ))}
            </div>

            {/* Error log */}
            <ErrorLog errors={errors} />
          </>
        )}
      </main>
    </div>
  );
}
