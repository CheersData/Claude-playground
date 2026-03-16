/**
 * Schema Discovery — Cache Layer
 *
 * Persists discovered schemas in the `discovered_schemas` Supabase table.
 * TTL: 7 days (enforced by `expires_at` column in migration 037).
 *
 * Used by the discovery pipeline to avoid re-introspecting APIs on every sync.
 *
 * NOTE: Types are defined in ./types.ts (single source of truth).
 * EntityRelationship is imported from protocol.ts via types.ts.
 * SchemaField is the discovery engine's internal type — a subset of
 * protocol.ts DiscoveredField. Use schemaFieldToDiscoveredField() from
 * protocol.ts to convert when needed.
 */

import { createClient } from "@supabase/supabase-js";
import type {
  EntityRelationship,
  SchemaField,
  DiscoveredSchema,
  CachedSchemaRow,
} from "./types";

// Re-export types for backward compatibility
export type { EntityRelationship, SchemaField, DiscoveredSchema, CachedSchemaRow };

// ─── Cache Operations ───

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

/**
 * Get cached schema for a specific entity, or null if expired/missing.
 */
export async function getCachedSchema(
  connectionId: string,
  entityName: string
): Promise<DiscoveredSchema | null> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("discovered_schemas")
    .select("*")
    .eq("connection_id", connectionId)
    .eq("entity_name", entityName)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  const row = data as CachedSchemaRow;
  return {
    entityName: row.entity_name,
    connectorType: row.connector_type,
    fields: row.schema_data.fields ?? [],
    relationships: row.schema_data.relationships ?? [],
    recordCount: row.record_count ?? undefined,
    apiVersion: row.api_version ?? undefined,
    discoveredAt: row.discovered_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Get all cached schemas for a connection.
 */
export async function getCachedSchemas(
  connectionId: string
): Promise<DiscoveredSchema[]> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("discovered_schemas")
    .select("*")
    .eq("connection_id", connectionId)
    .gt("expires_at", new Date().toISOString())
    .order("entity_name");

  if (error || !data) return [];

  return (data as CachedSchemaRow[]).map((row) => ({
    entityName: row.entity_name,
    connectorType: row.connector_type,
    fields: row.schema_data.fields ?? [],
    relationships: row.schema_data.relationships ?? [],
    recordCount: row.record_count ?? undefined,
    apiVersion: row.api_version ?? undefined,
    discoveredAt: row.discovered_at,
    expiresAt: row.expires_at,
  }));
}

/**
 * Upsert a discovered schema into the cache.
 * Uses the unique index (connection_id, entity_name) for conflict resolution.
 */
export async function cacheSchema(
  userId: string,
  connectionId: string,
  schema: DiscoveredSchema
): Promise<void> {
  const supabase = getAdminClient();
  const now = new Date();
  const ttlDays = 7;
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("discovered_schemas").upsert(
    {
      user_id: userId,
      connection_id: connectionId,
      connector_type: schema.connectorType,
      entity_name: schema.entityName,
      schema_data: {
        fields: schema.fields,
        relationships: schema.relationships,
      },
      record_count: schema.recordCount ?? null,
      api_version: schema.apiVersion ?? null,
      discovered_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: "connection_id,entity_name" }
  );

  if (error) {
    throw new Error(`Failed to cache schema for ${schema.entityName}: ${error.message}`);
  }
}

/**
 * Invalidate cached schemas for a connection (e.g., after config change).
 */
export async function invalidateCache(connectionId: string): Promise<number> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("discovered_schemas")
    .delete()
    .eq("connection_id", connectionId)
    .select("id");

  if (error) {
    throw new Error(`Failed to invalidate cache: ${error.message}`);
  }

  return data?.length ?? 0;
}

/**
 * Cleanup expired schemas across all connections.
 */
export async function cleanupExpired(): Promise<number> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("discovered_schemas")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    throw new Error(`Failed to cleanup expired schemas: ${error.message}`);
  }

  return data?.length ?? 0;
}
