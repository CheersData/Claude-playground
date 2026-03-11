# Integration Health Dashboard — Piano di Implementazione

**Task ID**: 08c3f075
**Dipartimento**: Operations
**Stato**: Piano approvato, pronto per implementazione
**Data**: 2026-03-10

---

## 1. Obiettivo

Estendere la dashboard `/ops` con un pannello di monitoraggio della salute delle integrazioni (data connectors). Il pannello mostra lo stato di ogni connettore del corpus legislativo, evidenzia errori, e consente azioni rapide di re-sync.

---

## 2. Nuovo API Endpoint: `GET /api/company/integration-health`

### 2.1. Responsabilita

Restituisce una vista aggregata della salute di tutte le integrazioni:
- Lista connettori attivi con metadati dal registry (`corpus-sources.ts`)
- Ultimo sync per ciascuna fonte (da `connector_sync_log`)
- Conteggio errori recenti (ultime 24h e 7 giorni)
- Tasso di successo (success rate) per fonte
- Alert calcolati (consecutive failures, stale syncs, low success rate)

### 2.2. Auth e Rate Limiting

```typescript
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
```

Identico al pattern di `/api/company/status`: `requireConsoleAuth` + `checkRateLimit`.

### 2.3. Response Schema

```typescript
interface IntegrationHealthResponse {
  sources: IntegrationSourceHealth[];
  summary: {
    total: number;
    healthy: number;       // green
    warning: number;       // yellow
    critical: number;      // red
    lastGlobalSync: string | null;  // ISO timestamp
  };
  timestamp: string;
}

interface IntegrationSourceHealth {
  sourceId: string;
  name: string;
  shortName: string;
  type: "normattiva" | "eurlex";
  vertical: string;
  lifecycle: string;         // da corpus-sources.ts

  // Sync data (da connector_sync_log)
  lastSync: {
    id: string;
    status: "running" | "completed" | "failed";
    startedAt: string;
    completedAt: string | null;
    itemsFetched: number;
    itemsInserted: number;
    errors: number;
    durationMs: number | null;
  } | null;

  // Aggregati
  stats: {
    totalSyncs: number;
    successCount: number;
    failureCount: number;
    successRate: number;        // 0.0 - 1.0
    avgDurationMs: number;
    totalItemsSynced: number;
    errorsLast24h: number;
    errorsLast7d: number;
    consecutiveFailures: number;
  };

  // Alert calcolato
  health: "green" | "yellow" | "red";
  alerts: IntegrationAlert[];
}

interface IntegrationAlert {
  type: "consecutive_failures" | "stale_sync" | "low_success_rate" | "running_too_long";
  severity: "warning" | "critical";
  message: string;
}
```

### 2.4. Implementazione Route

File: `app/api/company/integration-health/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_SOURCES } from "@/scripts/corpus-sources";

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const admin = createAdminClient();

    // Query 1: tutti i sync log degli ultimi 30 giorni (per performance)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: syncLogs, error } = await admin
      .from("connector_sync_log")
      .select("*")
      .gte("started_at", thirtyDaysAgo)
      .order("started_at", { ascending: false });

    if (error) throw new Error(`DB error: ${error.message}`);

    // Raggruppa per source_id
    const logsBySource = new Map<string, Array<Record<string, unknown>>>();
    for (const log of (syncLogs ?? [])) {
      const sid = log.source_id as string;
      if (!logsBySource.has(sid)) logsBySource.set(sid, []);
      logsBySource.get(sid)!.push(log);
    }

    const now = Date.now();
    const oneDayAgo = now - 24 * 3600 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;

    // Costruisci health per ogni source nel registry
    const sources: IntegrationSourceHealth[] = ALL_SOURCES.map((source) => {
      const logs = logsBySource.get(source.id) ?? [];
      const lastLog = logs[0] ?? null;

      // Calcola stats
      const completed = logs.filter((l) => l.status === "completed");
      const failed = logs.filter((l) => l.status === "failed");
      const successRate = logs.length > 0
        ? completed.length / logs.filter((l) => l.status !== "running").length
        : 1.0;

      // Errori per finestra temporale
      const errorsLast24h = failed.filter(
        (l) => new Date(l.started_at as string).getTime() > oneDayAgo
      ).length;
      const errorsLast7d = failed.filter(
        (l) => new Date(l.started_at as string).getTime() > sevenDaysAgo
      ).length;

      // Fallimenti consecutivi (dall'ultimo successo)
      let consecutiveFailures = 0;
      for (const log of logs) {
        if (log.status === "failed") consecutiveFailures++;
        else if (log.status === "completed") break;
      }

      // Durata media
      const durationsMs = completed
        .filter((l) => l.completed_at && l.started_at)
        .map((l) =>
          new Date(l.completed_at as string).getTime() -
          new Date(l.started_at as string).getTime()
        );
      const avgDurationMs = durationsMs.length > 0
        ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
        : 0;

      // Totale items synced
      const totalItemsSynced = completed.reduce(
        (sum, l) => sum + ((l.items_inserted as number) ?? 0),
        0
      );

      // Calcola alert
      const alerts: IntegrationAlert[] = [];

      if (consecutiveFailures >= 3) {
        alerts.push({
          type: "consecutive_failures",
          severity: "critical",
          message: `${consecutiveFailures} sync consecutivi falliti`,
        });
      }

      if (lastLog && lastLog.status !== "running") {
        const lastSyncTime = new Date(
          (lastLog.completed_at ?? lastLog.started_at) as string
        ).getTime();
        if (now - lastSyncTime > 24 * 3600 * 1000) {
          alerts.push({
            type: "stale_sync",
            severity: "warning",
            message: `Nessun sync nelle ultime 24h`,
          });
        }
      } else if (!lastLog && source.lifecycle === "loaded") {
        alerts.push({
          type: "stale_sync",
          severity: "warning",
          message: "Nessun sync registrato (ma fonte caricata)",
        });
      }

      if (logs.length >= 5 && successRate < 0.9) {
        alerts.push({
          type: "low_success_rate",
          severity: successRate < 0.5 ? "critical" : "warning",
          message: `Success rate: ${(successRate * 100).toFixed(0)}%`,
        });
      }

      // Sync in corso da troppo tempo (> 30 min)
      if (lastLog?.status === "running") {
        const startTime = new Date(lastLog.started_at as string).getTime();
        if (now - startTime > 30 * 60 * 1000) {
          alerts.push({
            type: "running_too_long",
            severity: "warning",
            message: `Sync in corso da ${Math.floor((now - startTime) / 60000)} minuti`,
          });
        }
      }

      // Health color
      let health: "green" | "yellow" | "red" = "green";
      if (alerts.some((a) => a.severity === "critical")) health = "red";
      else if (alerts.some((a) => a.severity === "warning")) health = "yellow";

      return {
        sourceId: source.id,
        name: source.name,
        shortName: source.shortName,
        type: source.type as "normattiva" | "eurlex",
        vertical: source.vertical ?? "legal",
        lifecycle: source.lifecycle ?? "planned",
        lastSync: lastLog ? {
          id: lastLog.id as string,
          status: lastLog.status as "running" | "completed" | "failed",
          startedAt: lastLog.started_at as string,
          completedAt: (lastLog.completed_at as string) ?? null,
          itemsFetched: (lastLog.items_fetched as number) ?? 0,
          itemsInserted: (lastLog.items_inserted as number) ?? 0,
          errors: (lastLog.errors as number) ?? 0,
          durationMs: lastLog.completed_at && lastLog.started_at
            ? new Date(lastLog.completed_at as string).getTime() -
              new Date(lastLog.started_at as string).getTime()
            : null,
        } : null,
        stats: {
          totalSyncs: logs.length,
          successCount: completed.length,
          failureCount: failed.length,
          successRate: isNaN(successRate) ? 1.0 : successRate,
          avgDurationMs,
          totalItemsSynced,
          errorsLast24h,
          errorsLast7d,
          consecutiveFailures,
        },
        health,
        alerts,
      };
    });

    // Summary
    const summary = {
      total: sources.length,
      healthy: sources.filter((s) => s.health === "green").length,
      warning: sources.filter((s) => s.health === "yellow").length,
      critical: sources.filter((s) => s.health === "red").length,
      lastGlobalSync: sources
        .filter((s) => s.lastSync?.completedAt)
        .sort((a, b) =>
          new Date(b.lastSync!.completedAt!).getTime() -
          new Date(a.lastSync!.completedAt!).getTime()
        )[0]?.lastSync?.completedAt ?? null,
    };

    return NextResponse.json({ sources, summary, timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

### 2.5. Force Sync Endpoint: `POST /api/company/integration-health/sync`

Trigger manuale di re-sync per un singolo connettore. Invoca la pipeline data-connector in background.

```typescript
// app/api/company/integration-health/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { getSourceById } from "@/scripts/corpus-sources";

export async function POST(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = await checkRateLimit(req);
  if (rl) return rl;
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  const body = await req.json();
  const sourceId = body.sourceId as string;
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId obbligatorio" }, { status: 400 });
  }

  const source = getSourceById(sourceId);
  if (!source) {
    return NextResponse.json({ error: `Fonte sconosciuta: ${sourceId}` }, { status: 404 });
  }

  // Avvia pipeline data-connector in background
  // NOTA: in ambiente demo questo fallira (nessun LLM disponibile per MODEL phase)
  // ma la fase CONNECT e parzialmente LOAD potrebbero funzionare.
  // Per ora rispondiamo con un ack — la pipeline reale viene invocata dal CLI.
  return NextResponse.json({
    ok: true,
    message: `Sync richiesto per ${source.shortName}. Eseguire manualmente: npx tsx scripts/data-connector.ts update ${sourceId}`,
    sourceId,
  });
}
```

---

## 3. Nuovo Pannello Dashboard: IntegrationHealthPanel

### 3.1. Posizionamento

Nuovo tab nella tab bar di `/ops`:

```typescript
// Aggiungere al tipo TabId:
type TabId = ... | "integrations";

// Aggiungere alla lista TABS:
{ id: "integrations", label: "Integrazioni", icon: Plug }  // import { Plug } from "lucide-react"
```

Posizione nell'array: dopo "agents", prima di "testing":
```
Dashboard | Trading | CME | Vision | Reports | Archivio | Daemon | Agenti | Integrazioni | QA & Test
```

### 3.2. Struttura Componenti

```
components/ops/
  IntegrationHealthPanel.tsx       # Pannello principale (container)
  IntegrationSourceCard.tsx        # Card per singola fonte
  IntegrationAlertBanner.tsx       # Banner alert aggregato in cima
  IntegrationSyncHistory.tsx       # Storico sync espandibile per fonte
```

### 3.3. IntegrationHealthPanel (componente principale)

File: `components/ops/IntegrationHealthPanel.tsx`

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plug,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Filter,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";
import { IntegrationSourceCard } from "./IntegrationSourceCard";
import { IntegrationAlertBanner } from "./IntegrationAlertBanner";

// ── Types ──

interface IntegrationAlert {
  type: "consecutive_failures" | "stale_sync" | "low_success_rate" | "running_too_long";
  severity: "warning" | "critical";
  message: string;
}

interface IntegrationSourceHealth {
  sourceId: string;
  name: string;
  shortName: string;
  type: "normattiva" | "eurlex";
  vertical: string;
  lifecycle: string;
  lastSync: {
    id: string;
    status: "running" | "completed" | "failed";
    startedAt: string;
    completedAt: string | null;
    itemsFetched: number;
    itemsInserted: number;
    errors: number;
    durationMs: number | null;
  } | null;
  stats: {
    totalSyncs: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgDurationMs: number;
    totalItemsSynced: number;
    errorsLast24h: number;
    errorsLast7d: number;
    consecutiveFailures: number;
  };
  health: "green" | "yellow" | "red";
  alerts: IntegrationAlert[];
}

interface IntegrationHealthData {
  sources: IntegrationSourceHealth[];
  summary: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    lastGlobalSync: string | null;
  };
  timestamp: string;
}

type HealthFilter = "all" | "green" | "yellow" | "red";

// ── Component ──

export function IntegrationHealthPanel() {
  const [data, setData] = useState<IntegrationHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HealthFilter>("all");
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company/integration-health", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh 30s (same as main /ops data)
  useEffect(() => {
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const filteredSources = data?.sources.filter((s) =>
    filter === "all" ? true : s.health === filter
  ) ?? [];

  const handleForceSync = async (sourceId: string) => {
    try {
      await fetch("/api/company/integration-health/sync", {
        method: "POST",
        headers: {
          ...getConsoleAuthHeaders(),
          "Content-Type": "application/json",
          "x-csrf-token": "1",
        },
        body: JSON.stringify({ sourceId }),
      });
      // Refresh data after trigger
      setTimeout(fetchData, 2000);
    } catch { /* silently fail */ }
  };

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      {data && (
        <div className="flex items-center gap-4 flex-wrap">
          <SummaryPill icon={CheckCircle2} count={data.summary.healthy} label="OK" color="var(--success)" />
          <SummaryPill icon={AlertTriangle} count={data.summary.warning} label="Attenzione" color="var(--warning, #f59e0b)" />
          <SummaryPill icon={XCircle} count={data.summary.critical} label="Critico" color="var(--error)" />
          <div className="flex-1" />
          {/* Filter */}
          <div className="flex items-center gap-1">
            {(["all", "red", "yellow", "green"] as HealthFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                style={{
                  background: filter === f ? "var(--bg-overlay)" : "transparent",
                  color: filter === f ? "var(--fg-primary)" : "var(--fg-secondary)",
                }}
              >
                {f === "all" ? "Tutte" : f === "red" ? "Critiche" : f === "yellow" ? "Warning" : "OK"}
              </button>
            ))}
          </div>
          <button onClick={fetchData} disabled={loading} className="...refresh-btn-styles...">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}

      {/* Alert banner (critical alerts) */}
      {data && <IntegrationAlertBanner sources={data.sources} />}

      {/* Source cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredSources.map((source) => (
            <motion.div
              key={source.sourceId}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <IntegrationSourceCard
                source={source}
                expanded={expandedSource === source.sourceId}
                onToggleExpand={() =>
                  setExpandedSource((prev) =>
                    prev === source.sourceId ? null : source.sourceId
                  )
                }
                onForceSync={() => handleForceSync(source.sourceId)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {loading && !data && (
        <div className="text-center py-12 text-sm" style={{ color: "var(--fg-secondary)" }}>
          Caricamento stato integrazioni...
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-sm" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function SummaryPill({
  icon: Icon,
  count,
  label,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  count: number;
  label: string;
  color: string;
}) {
  return (
    <span
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{
        background: `${color}11`,
        border: `1px solid ${color}22`,
        color,
      }}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="font-bold">{count}</span>
      <span>{label}</span>
    </span>
  );
}
```

### 3.4. IntegrationSourceCard

File: `components/ops/IntegrationSourceCard.tsx`

```typescript
"use client";

import { ChevronDown, ChevronUp, Play, Clock, Database, AlertTriangle } from "lucide-react";

interface Props {
  source: IntegrationSourceHealth;
  expanded: boolean;
  onToggleExpand: () => void;
  onForceSync: () => void;
}

export function IntegrationSourceCard({ source, expanded, onToggleExpand, onForceSync }: Props) {
  const healthColor = {
    green: "var(--success)",
    yellow: "var(--warning, #f59e0b)",
    red: "var(--error)",
  }[source.health];

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: "var(--bg-raised)",
        border: `1px solid ${source.health === "red" ? "rgba(229,141,120,0.3)" : "var(--border-dark-subtle)"}`,
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 cursor-pointer" onClick={onToggleExpand}>
        {/* Health dot */}
        <span
          className={`w-2.5 h-2.5 rounded-full flex-none ${source.health === "red" ? "animate-pulse" : ""}`}
          style={{ background: healthColor }}
        />

        {/* Source name */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: "var(--fg-primary)" }}>
            {source.shortName}
          </div>
          <div className="text-xs truncate" style={{ color: "var(--fg-secondary)" }}>
            {source.name}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "var(--fg-secondary)" }}>
          <span>{source.stats.totalItemsSynced} art.</span>
          <span style={{ color: "var(--fg-invisible)" }}>|</span>
          <span>{(source.stats.successRate * 100).toFixed(0)}%</span>
        </div>

        {/* Expand toggle */}
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          className="px-4 pb-4 space-y-3"
          style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
        >
          {/* Alert list */}
          {source.alerts.length > 0 && (
            <div className="space-y-1 pt-2">
              {source.alerts.map((alert, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <AlertTriangle
                    className="w-3.5 h-3.5 flex-none"
                    style={{
                      color: alert.severity === "critical" ? "var(--error)" : "var(--warning, #f59e0b)",
                    }}
                  />
                  <span style={{ color: "var(--fg-secondary)" }}>{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatItem icon={Database} label="Totale sync" value={source.stats.totalSyncs} />
            <StatItem icon={Clock} label="Durata media" value={`${Math.round(source.stats.avgDurationMs / 1000)}s`} />
            <StatItem label="Successi" value={source.stats.successCount} color="var(--success)" />
            <StatItem label="Fallimenti" value={source.stats.failureCount} color="var(--error)" />
            <StatItem label="Errori 24h" value={source.stats.errorsLast24h} />
            <StatItem label="Errori 7g" value={source.stats.errorsLast7d} />
          </div>

          {/* Last sync details */}
          {source.lastSync && (
            <div className="text-xs space-y-1 pt-1" style={{ color: "var(--fg-secondary)" }}>
              <div>Ultimo sync: {new Date(source.lastSync.startedAt).toLocaleString("it-IT")}</div>
              <div>Stato: <span style={{ color: source.lastSync.status === "completed" ? "var(--success)" : "var(--error)" }}>
                {source.lastSync.status}
              </span></div>
              {source.lastSync.errors > 0 && (
                <div>Errori nel sync: {source.lastSync.errors}</div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-2 text-xs pt-1" style={{ color: "var(--fg-invisible)" }}>
            <span>Tipo: {source.type}</span>
            <span>|</span>
            <span>Verticale: {source.vertical}</span>
            <span>|</span>
            <span>Lifecycle: {source.lifecycle}</span>
          </div>

          {/* Force sync button */}
          <button
            onClick={(e) => { e.stopPropagation(); onForceSync(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all mt-2"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-secondary)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            <Play className="w-3 h-3" />
            Force Sync
          </button>
        </div>
      )}
    </div>
  );
}
```

### 3.5. IntegrationAlertBanner

File: `components/ops/IntegrationAlertBanner.tsx`

Mostra un banner in cima al pannello se ci sono alert critici. Collassabile.

```typescript
"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  sources: IntegrationSourceHealth[];
}

export function IntegrationAlertBanner({ sources }: Props) {
  const [expanded, setExpanded] = useState(true);

  const criticalSources = sources.filter((s) => s.health === "red");
  const warningSources = sources.filter((s) => s.health === "yellow");

  if (criticalSources.length === 0 && warningSources.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: criticalSources.length > 0
          ? "rgba(229,141,120,0.06)"
          : "rgba(245,158,11,0.06)",
        border: `1px solid ${
          criticalSources.length > 0
            ? "rgba(229,141,120,0.2)"
            : "rgba(245,158,11,0.2)"
        }`,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-2 text-sm font-medium"
        style={{
          color: criticalSources.length > 0 ? "var(--error)" : "var(--warning, #f59e0b)",
        }}
      >
        <AlertTriangle className="w-4 h-4" />
        <span>
          {criticalSources.length > 0
            ? `${criticalSources.length} integrazioni critiche`
            : `${warningSources.length} integrazioni con avvisi`}
        </span>
        <div className="flex-1" />
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {[...criticalSources, ...warningSources].map((source) => (
            <div key={source.sourceId} className="flex items-center gap-2 text-xs">
              <span
                className="w-2 h-2 rounded-full flex-none"
                style={{
                  background: source.health === "red" ? "var(--error)" : "var(--warning, #f59e0b)",
                }}
              />
              <span style={{ color: "var(--fg-primary)" }}>{source.shortName}</span>
              <span style={{ color: "var(--fg-secondary)" }}>
                {source.alerts.map((a) => a.message).join(" | ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3.6. IntegrationSyncHistory (componente opzionale per drill-down futuro)

Mostra lo storico dettagliato degli ultimi N sync per una fonte. Da implementare come espansione futura dentro la card, con query dedicata a `getSyncHistory(sourceId, 20)`.

---

## 4. Sistema di Alert

### 4.1. Regole Alert

| Condizione | Tipo | Severita | Messaggio |
|-----------|------|----------|-----------|
| 3+ sync consecutivi falliti | `consecutive_failures` | `critical` | "{N} sync consecutivi falliti" |
| Nessun sync nelle ultime 24h (fonte loaded) | `stale_sync` | `warning` | "Nessun sync nelle ultime 24h" |
| Success rate < 90% (su almeno 5 sync) | `low_success_rate` | `warning` (< 50% = `critical`) | "Success rate: {N}%" |
| Sync in corso da > 30 minuti | `running_too_long` | `warning` | "Sync in corso da {N} minuti" |

### 4.2. Mapping Health Color

```
red    = almeno un alert con severity "critical"
yellow = almeno un alert con severity "warning" (nessun critical)
green  = nessun alert
```

### 4.3. Integrazione con Header di /ops

Il `systemHealth` gia calcolato nel header di OpsPageClient potrebbe includere anche lo stato integrazioni. Fase 2 (non in questo piano): aggiungere un fetch parallelo a integration-health nella `fetchData()` principale e includere nel calcolo `systemHealth`.

---

## 5. Integrazione con OpsPageClient.tsx

### 5.1. Modifiche al file

```typescript
// 1. Import
import { IntegrationHealthPanel } from "@/components/ops/IntegrationHealthPanel";
import { Plug } from "lucide-react";

// 2. Tipo TabId — aggiungere "integrations"
type TabId = ... | "integrations";

// 3. Array TABS — aggiungere dopo "agents"
{ id: "integrations", label: "Integrazioni", icon: Plug },

// 4. Content area — aggiungere blocco render
{activeTab === "integrations" && (
  <div className="h-full overflow-y-auto p-4 md:p-6">
    <IntegrationHealthPanel />
  </div>
)}
```

### 5.2. Nota su Data Fetching

Il pannello `IntegrationHealthPanel` gestisce il proprio fetch indipendente (non passa da `fetchData()` di OpsPageClient). Questo perche:

1. I dati di integration health sono piu pesanti (30 giorni di log aggregati)
2. Il tab potrebbe non essere attivo — inutile caricare dati non visualizzati
3. Il refresh a 30s interno al pannello e sufficiente
4. Evita di appesantire la risposta di `/api/company/status` (che deve restare leggera per il polling globale)

---

## 6. Query SQL e Performance

### 6.1. Query principale (usata dall'endpoint)

```sql
-- Tutti i sync log degli ultimi 30 giorni, ordinati per data
SELECT *
FROM connector_sync_log
WHERE started_at >= NOW() - INTERVAL '30 days'
ORDER BY started_at DESC;
```

Questa query singola viene poi raggruppata in memoria per `source_id` nel codice TypeScript. Con ~30 fonti e ~2-5 sync ciascuna al mese, il result set e dell'ordine di 100-200 righe — nessun problema di performance.

### 6.2. Indici esistenti (sufficienti)

```sql
-- Gia presenti in migration 009
CREATE INDEX idx_sync_log_source ON connector_sync_log(source_id);
CREATE INDEX idx_sync_log_status ON connector_sync_log(status);
```

### 6.3. Indice raccomandato (opzionale, per performance su archivio storico)

Se il volume di sync log cresce significativamente (>10.000 righe), aggiungere:

```sql
-- Indice composito per query temporale + fonte
CREATE INDEX idx_sync_log_source_time
ON connector_sync_log(source_id, started_at DESC);
```

Per ora non necessario — le ~200 righe vengono gestite efficientemente dal planner PostgreSQL con gli indici esistenti.

### 6.4. Query per Sync History (drill-down futuro)

```sql
-- Storico dettagliato per una fonte specifica
SELECT
  id, status, sync_type, phase,
  started_at, completed_at,
  items_fetched, items_inserted, items_updated, items_skipped,
  errors, error_details
FROM connector_sync_log
WHERE source_id = $1
ORDER BY started_at DESC
LIMIT 20;
```

Questa query e gia implementata in `getSyncHistory()` in `sync-log.ts`.

---

## 7. Checklist di Implementazione

### File da creare

| # | File | Descrizione |
|---|------|-------------|
| 1 | `app/api/company/integration-health/route.ts` | GET endpoint salute integrazioni |
| 2 | `app/api/company/integration-health/sync/route.ts` | POST endpoint force sync |
| 3 | `components/ops/IntegrationHealthPanel.tsx` | Pannello principale |
| 4 | `components/ops/IntegrationSourceCard.tsx` | Card singola fonte |
| 5 | `components/ops/IntegrationAlertBanner.tsx` | Banner alert aggregato |

### File da modificare

| # | File | Modifica |
|---|------|----------|
| 1 | `app/ops/OpsPageClient.tsx` | Aggiungere tab "Integrazioni", import pannello, render condizionale |

### Nessuna migrazione DB necessaria

Lo schema `connector_sync_log` esistente contiene gia tutti i campi necessari. Gli indici esistenti sono sufficienti per il volume attuale.

### Ordine di implementazione raccomandato

1. API endpoint `GET /api/company/integration-health` (testabile con curl)
2. `IntegrationSourceCard.tsx` (componente foglia, nessuna dipendenza)
3. `IntegrationAlertBanner.tsx` (componente foglia)
4. `IntegrationHealthPanel.tsx` (compone i precedenti)
5. Modifica `OpsPageClient.tsx` (wiring finale)
6. API endpoint `POST /api/company/integration-health/sync` (opzionale, fase 2)

### Stima effort

- Backend (endpoint): ~1h
- Frontend (3 componenti + wiring): ~2h
- Testing manuale su /ops: ~30min
- **Totale**: ~3.5h

---

## 8. Evoluzione Futura (fuori scope di questo piano)

1. **Integrazione con header /ops**: includere health integrazioni nel calcolo `systemHealth` nel header globale
2. **Notifiche Telegram**: alert automatico su Telegram quando un connettore passa a stato "red"
3. **Sync History drill-down**: modale con storico dettagliato di ogni sync, error details espandibili
4. **Cron monitoring**: aggiungere health check del cron job data-connector (se/quando attivato)
5. **Auto-retry su failure**: logica per ri-tentare automaticamente sync falliti dopo N minuti
