/**
 * API Company Cron — Task automatici periodici.
 *
 * Chiamato da Vercel Cron o manualmente.
 * - Task stale (open > 7 giorni) → alert CME
 * - Sync gap (nessun sync > 7 giorni) → task per Data Engineering
 * - Costo giornaliero > soglia → alert Finance
 */

import { NextResponse } from "next/server";
import { getOpenTasks, createTask } from "@/lib/company/tasks";
import { getTotalSpend } from "@/lib/company/cost-logger";
import { getConnectorStatus } from "@/lib/staff/data-connector/sync-log";

const STALE_DAYS = 7;
const SYNC_GAP_DAYS = 7;
const DAILY_COST_THRESHOLD = 1.0;

export async function POST() {
  const alerts: string[] = [];

  try {
    // 1. Stale tasks
    const openTasks = await getOpenTasks({ status: "open" });
    const now = Date.now();
    const staleTasks = openTasks.filter((t) => {
      const age = now - new Date(t.createdAt).getTime();
      return age > STALE_DAYS * 24 * 60 * 60 * 1000;
    });

    if (staleTasks.length > 0) {
      await createTask({
        title: `${staleTasks.length} stale tasks (open > ${STALE_DAYS} days)`,
        department: "operations",
        priority: "medium",
        createdBy: "cron",
        description: `Stale tasks: ${staleTasks.map((t) => `${t.id.slice(0, 8)}: ${t.title}`).join("; ")}`,
        labels: ["auto", "stale"],
      });
      alerts.push(`${staleTasks.length} stale tasks`);
    }

    // 2. Sync gap
    const pipeline = await getConnectorStatus().catch(() => []);
    const staleSources = pipeline.filter((s) => {
      if (!s.lastSync?.completedAt) return true;
      const age = now - new Date(s.lastSync.completedAt).getTime();
      return age > SYNC_GAP_DAYS * 24 * 60 * 60 * 1000;
    });

    if (staleSources.length > 0) {
      await createTask({
        title: `${staleSources.length} sources need sync update`,
        department: "data-engineering",
        priority: "medium",
        createdBy: "cron",
        description: `Sources needing update: ${staleSources.map((s) => s.sourceId).join(", ")}`,
        labels: ["auto", "sync-gap"],
      });
      alerts.push(`${staleSources.length} sources need sync`);
    }

    // 3. Cost threshold
    const costs = await getTotalSpend(1);
    if (costs.total > DAILY_COST_THRESHOLD) {
      await createTask({
        title: `Daily cost alert: $${costs.total.toFixed(2)} exceeds $${DAILY_COST_THRESHOLD} threshold`,
        department: "finance",
        priority: "high",
        createdBy: "cron",
        description: `Today's spend: $${costs.total.toFixed(2)} across ${costs.calls} calls. Avg: $${costs.avgPerCall.toFixed(4)}/call.`,
        labels: ["auto", "cost-alert"],
      });
      alerts.push(`daily cost $${costs.total.toFixed(2)}`);
    }

    return NextResponse.json({
      ok: true,
      alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
