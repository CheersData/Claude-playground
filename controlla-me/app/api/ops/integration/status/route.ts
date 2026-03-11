/**
 * API Integration Health Status — GET
 *
 * Returns connector health data for the Integration Health panel in /ops.
 * Uses mock data for now; will be wired to connector_sync_log when available.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

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

// ── Mock data ────────────────────────────────────────────────────────────────

function getMockConnectors(): ConnectorStatus[] {
  const now = new Date();
  return [
    {
      id: "normattiva",
      name: "Normattiva Open Data",
      status: "healthy",
      articleCount: 2969,
      lastSyncAt: new Date(now.getTime() - 2 * 3600_000).toISOString(),
      lastSyncDuration: 45_000,
      lastSyncResult: "success",
      errorCount7d: 0,
      articlesAdded7d: 0,
      articlesUpdated7d: 3,
    },
    {
      id: "eurlex",
      name: "EUR-Lex Cellar",
      status: "warning",
      articleCount: 1245,
      lastSyncAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      lastSyncDuration: 150_000,
      lastSyncResult: "success",
      errorCount7d: 2,
      articlesAdded7d: 12,
      articlesUpdated7d: 5,
    },
    {
      id: "openstax",
      name: "OpenStax",
      status: "error",
      articleCount: 47,
      lastSyncAt: new Date(now.getTime() - 1 * 86_400_000).toISOString(),
      lastSyncDuration: null,
      lastSyncResult: "failed",
      errorCount7d: 15,
      articlesAdded7d: 0,
      articlesUpdated7d: 0,
    },
    {
      id: "statpearls",
      name: "StatPearls",
      status: "healthy",
      articleCount: 47,
      lastSyncAt: new Date(now.getTime() - 6 * 3600_000).toISOString(),
      lastSyncDuration: 32_000,
      lastSyncResult: "success",
      errorCount7d: 0,
      articlesAdded7d: 2,
      articlesUpdated7d: 0,
    },
    {
      id: "europepmc",
      name: "Europe PMC",
      status: "unknown",
      articleCount: 0,
      lastSyncAt: null,
      lastSyncDuration: null,
      lastSyncResult: null,
      errorCount7d: 0,
      articlesAdded7d: 0,
      articlesUpdated7d: 0,
    },
    {
      id: "codice-civile",
      name: "Codice Civile",
      status: "healthy",
      articleCount: 892,
      lastSyncAt: new Date(now.getTime() - 12 * 3600_000).toISOString(),
      lastSyncDuration: 67_000,
      lastSyncResult: "success",
      errorCount7d: 0,
      articlesAdded7d: 0,
      articlesUpdated7d: 0,
    },
  ];
}

function getMockSyncHistory(): SyncHistoryDay[] {
  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86_400_000);
    return {
      date: d.toISOString().slice(0, 10),
      dayLabel: days[d.getDay()],
      success: Math.floor(Math.random() * 5) + 1,
      failed: Math.random() > 0.7 ? Math.floor(Math.random() * 3) : 0,
      partial: Math.random() > 0.8 ? 1 : 0,
    };
  });
}

function getMockErrors(): SyncError[] {
  const now = new Date();
  return [
    {
      id: "err-001",
      sourceId: "openstax",
      sourceName: "OpenStax",
      timestamp: new Date(now.getTime() - 1 * 3600_000).toISOString(),
      severity: "error",
      message: "HTTP 404 — /api/v1/books endpoint non raggiungibile",
      details: "GET https://openstax.org/api/v1/books returned 404 Not Found. L'API potrebbe essere stata aggiornata.",
      resolved: false,
    },
    {
      id: "err-002",
      sourceId: "eurlex",
      sourceName: "EUR-Lex Cellar",
      timestamp: new Date(now.getTime() - 18 * 3600_000).toISOString(),
      severity: "warning",
      message: "Timeout dopo 30s sulla query Cellar SPARQL",
      details: "La query SPARQL per i regolamenti EU ha superato il timeout di 30 secondi. Retry riuscito al secondo tentativo.",
      resolved: true,
    },
    {
      id: "err-003",
      sourceId: "eurlex",
      sourceName: "EUR-Lex Cellar",
      timestamp: new Date(now.getTime() - 20 * 3600_000).toISOString(),
      severity: "warning",
      message: "OAuth token scaduto — rinnovato automaticamente",
      resolved: true,
    },
    {
      id: "err-004",
      sourceId: "openstax",
      sourceName: "OpenStax",
      timestamp: new Date(now.getTime() - 48 * 3600_000).toISOString(),
      severity: "error",
      message: "Parser fallito: struttura JSON inattesa dal nuovo endpoint v2",
      details: "Il campo 'chapters' non esiste nella risposta v2. Necessario aggiornare il parser OpenStax.",
      resolved: false,
    },
    {
      id: "err-005",
      sourceId: "normattiva",
      sourceName: "Normattiva",
      timestamp: new Date(now.getTime() - 72 * 3600_000).toISOString(),
      severity: "info",
      message: "WAF block evitato — User-Agent aggiornato",
      resolved: true,
    },
  ];
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
    const connectors = getMockConnectors();
    const syncHistory = getMockSyncHistory();
    const errors = getMockErrors();

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
