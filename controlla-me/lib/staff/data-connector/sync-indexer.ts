/**
 * Sync Indexer — Indexes metadata from synced CRM/ERP records into the vector DB.
 *
 * This is complementary to the document analysis indexing (which indexes full
 * legal analysis results). The sync indexer captures lightweight metadata
 * from ALL synced records (contacts, deals, invoices) so they become
 * searchable in future analyses.
 *
 * For example, if a user syncs HubSpot contacts and later analyzes a contract
 * mentioning one of those contacts, the RAG pipeline can surface the CRM data
 * as relevant context.
 *
 * Only indexes records that have mapped_fields with sufficient data.
 * Uses batch embedding generation for efficiency.
 */

import type { SyncItem } from "./sync-dispatcher";

/**
 * Index metadata from synced records into the legal_knowledge table.
 *
 * Creates searchable entries for CRM/ERP records so they can be found
 * by the RAG pipeline during future analyses.
 *
 * @param connectorId - Source connector ID
 * @param userId - User who owns the records
 * @param items - Synced items to index
 * @param log - Logger function
 * @returns Number of entries successfully indexed
 */
export async function indexSyncMetadata(
  connectorId: string,
  userId: string,
  items: SyncItem[],
  log: (msg: string) => void = console.log
): Promise<number> {
  // Only index items that have meaningful mapped fields
  const indexableItems = items.filter((item) => {
    if (!item.mapped_fields || Object.keys(item.mapped_fields).length === 0) return false;
    // Skip items that are purely system fields
    const meaningfulKeys = Object.keys(item.mapped_fields).filter(
      (k) => !k.startsWith("_")
    );
    return meaningfulKeys.length >= 2;
  });

  if (indexableItems.length === 0) return 0;

  // Cap at 50 items per sync to avoid excessive embedding costs
  const itemsToIndex = indexableItems.slice(0, 50);

  try {
    const { generateEmbeddings, truncateForEmbedding, isVectorDBEnabled } = await import("@/lib/embeddings");
    if (!isVectorDBEnabled()) return 0;

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    // Build text representations for each record
    const texts = itemsToIndex.map((item) => {
      const fields = item.mapped_fields ?? {};
      const parts: string[] = [
        `Tipo: ${item.entity_type} (${connectorId})`,
      ];

      // Add meaningful mapped fields
      for (const [key, value] of Object.entries(fields)) {
        if (key.startsWith("_")) continue;
        if (value === null || value === undefined || value === "") continue;
        const label = key.replace(/_/g, " ");
        parts.push(`${label}: ${String(value).slice(0, 200)}`);
      }

      return truncateForEmbedding(parts.join("\n"));
    });

    // Generate embeddings in batch
    const embeddings = await generateEmbeddings(texts);
    if (!embeddings) {
      log(`[SYNC-INDEXER] Failed to generate embeddings for ${texts.length} items`);
      return 0;
    }

    // Upsert into legal_knowledge
    let indexed = 0;
    for (let i = 0; i < itemsToIndex.length; i++) {
      const item = itemsToIndex[i];
      const title = buildRecordTitle(item);

      const { error } = await admin.rpc("upsert_legal_knowledge", {
        p_category: "clause_pattern", // Reuse existing category for business context
        p_title: `[${connectorId}] ${title}`,
        p_content: texts[i],
        p_metadata: {
          connectorId,
          userId,
          entityType: item.entity_type,
          externalId: item.external_id,
          source: "sync_indexer",
        },
        p_embedding: JSON.stringify(embeddings[i]),
        p_source_analysis_id: `sync-${connectorId}-${item.external_id}`,
      });

      if (!error) {
        indexed++;
      }
    }

    log(
      `[SYNC-INDEXER] Indexed ${indexed}/${itemsToIndex.length} records from ${connectorId}`
    );

    return indexed;
  } catch (err) {
    log(
      `[SYNC-INDEXER] Error: ${err instanceof Error ? err.message : String(err)}`
    );
    return 0;
  }
}

/**
 * Builds a human-readable title for a synced record.
 */
function buildRecordTitle(item: SyncItem): string {
  const fields = item.mapped_fields ?? item.data;

  // Try common name fields
  const name =
    fields.full_name ??
    fields.company_name ??
    fields.deal_name ??
    fields.subject ??
    fields.file_name ??
    fields.name ??
    fields.Name;

  if (typeof name === "string" && name.length > 0) {
    return `${item.entity_type}: ${name}`;
  }

  return `${item.entity_type} ${item.external_id}`;
}
