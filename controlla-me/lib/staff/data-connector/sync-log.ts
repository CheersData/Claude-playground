/**
 * Sync Log — Tracciamento sincronizzazioni Data Connector.
 * CRUD sulla tabella connector_sync_log.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncLogEntry, StoreResult, ConnectResult, ModelResult } from "./types";

export async function startSync(
  sourceId: string,
  syncType: string,
  phase?: string
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("connector_sync_log")
    .insert({
      source_id: sourceId,
      sync_type: syncType,
      phase: phase ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (error) throw new Error(`[SYNC-LOG] Errore startSync: ${error.message}`);
  return data.id;
}

export async function completeSync(
  syncId: string,
  status: "completed" | "failed",
  result?: Partial<{
    itemsFetched: number;
    itemsInserted: number;
    itemsUpdated: number;
    itemsSkipped: number;
    errors: number;
    errorDetails: Array<{ item: string; error: string }>;
    metadata: Record<string, unknown>;
  }>
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("connector_sync_log")
    .update({
      status,
      completed_at: new Date().toISOString(),
      items_fetched: result?.itemsFetched ?? 0,
      items_inserted: result?.itemsInserted ?? 0,
      items_updated: result?.itemsUpdated ?? 0,
      items_skipped: result?.itemsSkipped ?? 0,
      errors: result?.errors ?? 0,
      error_details: result?.errorDetails ?? [],
      metadata: result?.metadata ?? {},
    })
    .eq("id", syncId);

  if (error) console.error(`[SYNC-LOG] Errore completeSync: ${error.message}`);
}

export async function getLastSuccessfulSync(
  sourceId: string
): Promise<SyncLogEntry | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("connector_sync_log")
    .select("*")
    .eq("source_id", sourceId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

export async function getSyncHistory(
  sourceId: string,
  limit = 10
): Promise<SyncLogEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("connector_sync_log")
    .select("*")
    .eq("source_id", sourceId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapRow);
}

export async function getConnectorStatus(): Promise<
  Array<{
    sourceId: string;
    lastSync: SyncLogEntry | null;
    totalSyncs: number;
  }>
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("connector_sync_log")
    .select("source_id, status, completed_at, sync_type, phase")
    .order("completed_at", { ascending: false });

  if (error || !data) return [];

  const bySource = new Map<string, { last: SyncLogEntry | null; total: number }>();
  for (const row of data) {
    const sid = (row as Record<string, unknown>).source_id as string;
    if (!bySource.has(sid)) {
      bySource.set(sid, { last: mapRow(row as Record<string, unknown>), total: 0 });
    }
    bySource.get(sid)!.total++;
  }

  return Array.from(bySource.entries()).map(([sourceId, info]) => ({
    sourceId,
    lastSync: info.last,
    totalSyncs: info.total,
  }));
}

function mapRow(row: Record<string, unknown>): SyncLogEntry {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    syncType: row.sync_type as string,
    phase: (row.phase as string) ?? null,
    status: row.status as "running" | "completed" | "failed",
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string) ?? null,
    itemsFetched: (row.items_fetched as number) ?? 0,
    itemsInserted: (row.items_inserted as number) ?? 0,
    itemsUpdated: (row.items_updated as number) ?? 0,
    itemsSkipped: (row.items_skipped as number) ?? 0,
    errors: (row.errors as number) ?? 0,
    errorDetails: (row.error_details as Array<{ item: string; error: string }>) ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}
