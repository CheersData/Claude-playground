/**
 * API Integration Health Status — GET
 *
 * Returns connector health data for the Integration Health panel in /ops.
 * Queries connector_sync_log and legal_articles for real data.
 * Falls back to empty state if Supabase is unavailable.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Types ────────────────────────────────────────────────────────────────────

interface ConnectorStatus {
  id: string;
  name: string;
  status: "healthy" | "warning" | "error" | "unknown";
  articleCount: number;
  lastSyncAt: string | null;
  lastSyncDuration: number | null;
  lastSyncResult: "success" | "partial" | "failed" | null;
  errorCount7d: number;
  articlesAdded7d: number;
  articlesUpdated7d: number;
}

interface SyncHistoryDay {
  date: string;
  dayLabel: string;
  success: number;
  failed: number;
  partial: number;
}

interface SyncError {
  id: string;
  sourceId: string;
  sourceName: string;
  timestamp: string;
  severity: "error" | "warning" | "info";
  message: string;
  details?: string;
  resolved: boolean;
}

// ── Source name map (known connectors) ───────────────────────────────────────

const SOURCE_NAMES: Record<string, string> = {
  codice_civile: "Codice Civile",
  codice_penale: "Codice Penale",
  codice_consumo: "Codice del Consumo",
  codice_proc_civile: "Codice di Procedura Civile",
  statuto_lavoratori: "Statuto dei Lavoratori",
  tu_edilizia: "Testo Unico Edilizia",
  dlgs_231_2001: "D.Lgs. 231/2001",
  dlgs_122_2005: "D.Lgs. 122/2005",
  dlgs_276_2003: "D.Lgs. 276/2003",
  dlgs_23_2015: "D.Lgs. 23/2015",
  dlgs_82_2005: "D.Lgs. 82/2005 (CAD)",
  dlgs_28_2010: "D.Lgs. 28/2010",
  legge_431_1998: "L. 431/1998",
  legge_392_1978: "L. 392/1978",
  legge_590_1965: "L. 590/1965",
  legge_817_1971: "L. 817/1971",
  dpr_602_1973: "DPR 602/1973",
  tub_dlgs_385_1993: "TUB D.Lgs. 385/1993",
  gdpr: "GDPR (Reg. EU 2016/679)",
  dir_93_13_clausole_abusive: "Dir. 93/13 Clausole Abusive",
  dir_2011_83_consumatori: "Dir. 2011/83 Consumatori",
  dir_2019_771_vendita_beni: "Dir. 2019/771 Vendita Beni",
  reg_roma_i: "Reg. Roma I",
  dsa: "Digital Services Act",
  ai_act: "AI Act",
  reg_261_2004_passeggeri_aerei: "Reg. 261/2004 Passeggeri Aerei",
  nis2: "NIS2",
  statpearls: "StatPearls",
  europepmc: "Europe PMC",
  openstax: "OpenStax",
  tuir: "TUIR",
  dpr_633_1972_iva: "DPR 633/1972 (IVA)",
  statuto_contribuente: "Statuto del Contribuente",
  stripe_business: "Stripe",
  hubspot_crm: "HubSpot CRM",
  google_drive_files: "Google Drive",
  salesforce_crm: "Salesforce CRM",
};

function getSourceName(sourceId: string): string {
  return SOURCE_NAMES[sourceId] ?? sourceId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Real data queries ────────────────────────────────────────────────────────

type SyncRow = Record<string, unknown>;

function computeStatus(
  lastSync: SyncRow | null,
  errorCount7d: number
): "healthy" | "warning" | "error" | "unknown" {
  if (!lastSync) return "unknown";

  const status = lastSync.status as string;
  if (status === "failed") return "error";

  const completedAt = lastSync.completed_at as string | null;
  if (!completedAt) return status === "running" ? "healthy" : "unknown";

  const ageMs = Date.now() - new Date(completedAt).getTime();
  const ONE_DAY = 86_400_000;
  const SEVEN_DAYS = 7 * ONE_DAY;

  if (errorCount7d >= 5) return "error";
  if (ageMs > SEVEN_DAYS) return "error";
  if (ageMs > ONE_DAY || errorCount7d > 0) return "warning";
  return "healthy";
}

function computeDuration(row: SyncRow): number | null {
  const started = row.started_at as string | null;
  const completed = row.completed_at as string | null;
  if (!started || !completed) return null;
  return new Date(completed).getTime() - new Date(started).getTime();
}

function mapSyncResult(status: string): "success" | "partial" | "failed" | null {
  if (status === "completed") return "success";
  if (status === "failed") return "failed";
  return null;
}

async function fetchRealData() {
  const admin = createAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  // 1. All sync logs from last 7 days (for history, errors, per-connector stats)
  const { data: recentLogs } = await admin
    .from("connector_sync_log")
    .select("*")
    .gte("started_at", sevenDaysAgo)
    .order("started_at", { ascending: false })
    .limit(500);

  // 2. Latest sync per source (for current status) — all time
  const { data: allLogs } = await admin
    .from("connector_sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1000);

  // 3. Article counts per source
  const { data: articleCounts } = await admin
    .from("legal_articles")
    .select("source_id")
    .limit(10000);

  const logs = (recentLogs ?? []) as SyncRow[];
  const allSyncLogs = (allLogs ?? []) as SyncRow[];

  // ── Build article count map ──
  const articleCountMap = new Map<string, number>();
  for (const row of (articleCounts ?? []) as Array<{ source_id: string }>) {
    articleCountMap.set(row.source_id, (articleCountMap.get(row.source_id) ?? 0) + 1);
  }

  // ── Group all logs by source ──
  const bySource = new Map<string, SyncRow[]>();
  for (const row of allSyncLogs) {
    const sid = row.source_id as string;
    if (!bySource.has(sid)) bySource.set(sid, []);
    bySource.get(sid)!.push(row);
  }

  // ── Group recent logs by source ──
  const recentBySource = new Map<string, SyncRow[]>();
  for (const row of logs) {
    const sid = row.source_id as string;
    if (!recentBySource.has(sid)) recentBySource.set(sid, []);
    recentBySource.get(sid)!.push(row);
  }

  // ── Build connectors ──
  // Include all sources that appear in sync logs OR article counts
  const allSourceIds = new Set(
    Array.from(bySource.keys()).concat(Array.from(articleCountMap.keys()))
  );
  const connectors: ConnectorStatus[] = [];

  for (const sourceId of Array.from(allSourceIds)) {
    const sourceLogs = bySource.get(sourceId) ?? [];
    const recent = recentBySource.get(sourceId) ?? [];
    const lastSync = sourceLogs[0] ?? null; // already sorted desc

    const errorCount7d = recent.filter((r) => r.status === "failed").length;
    const articlesAdded7d = recent.reduce((sum, r) => sum + ((r.items_inserted as number) ?? 0), 0);
    const articlesUpdated7d = recent.reduce((sum, r) => sum + ((r.items_updated as number) ?? 0), 0);

    connectors.push({
      id: sourceId,
      name: getSourceName(sourceId),
      status: computeStatus(lastSync, errorCount7d),
      articleCount: articleCountMap.get(sourceId) ?? 0,
      lastSyncAt: (lastSync?.completed_at as string) ?? (lastSync?.started_at as string) ?? null,
      lastSyncDuration: lastSync ? computeDuration(lastSync) : null,
      lastSyncResult: lastSync ? mapSyncResult(lastSync.status as string) : null,
      errorCount7d,
      articlesAdded7d,
      articlesUpdated7d,
    });
  }

  // Sort: errors first, then warnings, then healthy, then unknown
  const statusOrder = { error: 0, warning: 1, healthy: 2, unknown: 3 };
  connectors.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  // ── Build sync history (7 days) ──
  const dayLabels = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const syncHistory: SyncHistoryDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLogs = logs.filter((r) => (r.started_at as string).slice(0, 10) === dateStr);
    return {
      date: dateStr,
      dayLabel: dayLabels[d.getDay()],
      success: dayLogs.filter((r) => r.status === "completed").length,
      failed: dayLogs.filter((r) => r.status === "failed").length,
      partial: dayLogs.filter((r) => r.status === "running").length,
    };
  });

  // ── Build errors (from failed syncs + error_details in last 7 days) ──
  const errors: SyncError[] = [];
  for (const row of logs) {
    const status = row.status as string;
    const sourceId = row.source_id as string;
    const errorDetails = (row.error_details ?? []) as Array<{ item: string; error: string }>;

    if (status === "failed") {
      const firstError = errorDetails[0];
      errors.push({
        id: row.id as string,
        sourceId,
        sourceName: getSourceName(sourceId),
        timestamp: (row.completed_at ?? row.started_at) as string,
        severity: "error",
        message: firstError?.error ?? `Sync fallita per ${getSourceName(sourceId)}`,
        details: errorDetails.length > 1
          ? errorDetails.map((e) => `${e.item}: ${e.error}`).join("\n")
          : undefined,
        resolved: false,
      });
    } else if (status === "completed" && (row.errors as number) > 0) {
      for (const detail of errorDetails.slice(0, 3)) {
        errors.push({
          id: `${row.id}-${detail.item}`,
          sourceId,
          sourceName: getSourceName(sourceId),
          timestamp: (row.completed_at ?? row.started_at) as string,
          severity: "warning",
          message: detail.error,
          details: `Item: ${detail.item}`,
          resolved: true,
        });
      }
    }
  }

  // Sort errors by timestamp desc
  errors.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { connectors, syncHistory, errors: errors.slice(0, 50) };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const { connectors, syncHistory, errors } = await fetchRealData();

    const summary = {
      totalConnectors: connectors.length,
      healthy: connectors.filter((c) => c.status === "healthy").length,
      warning: connectors.filter((c) => c.status === "warning").length,
      error: connectors.filter((c) => c.status === "error").length,
      unknown: connectors.filter((c) => c.status === "unknown").length,
      totalArticles: connectors.reduce((sum, c) => sum + c.articleCount, 0),
      lastGlobalSync: connectors
        .map((c) => c.lastSyncAt)
        .filter(Boolean)
        .sort()
        .pop() ?? null,
    };

    return NextResponse.json({
      connectors,
      syncHistory,
      errors,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
