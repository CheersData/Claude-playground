/**
 * Learning Loop — L4: Salvataggio e recupero mapping confermati dall'utente.
 *
 * Quando un utente conferma o corregge un mapping proposto dal sistema,
 * la correzione viene salvata nel DB (integration_field_mappings).
 * Al prossimo mapping dello stesso connettore, i mapping confermati
 * hanno priorita L0 (prima di regole, similarity e LLM).
 *
 * Tabella: integration_field_mappings
 *   - connector_type: es. "salesforce", "hubspot"
 *   - source_field: nome campo sorgente originale
 *   - target_field: nome campo target confermato dall'utente
 *   - confirmed_by: user_id
 *   - usage_count: quante volte e stato riusato automaticamente
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ───

export interface LearnedMapping {
  id: string;
  connectorType: string;
  sourceField: string;
  targetField: string;
  confirmedBy: string;
  confirmedAt: string;
  usageCount: number;
}

// ─── Save ───

/**
 * Salva un mapping confermato dall'utente nel DB.
 *
 * Se il mapping esiste gia (stesso connector_type + source_field + confirmed_by),
 * viene aggiornato (upsert). Questo permette all'utente di correggere
 * un mapping precedente.
 *
 * @param connectorType - ID connettore (es. "hubspot", "salesforce")
 * @param sourceField - Nome campo sorgente originale
 * @param targetField - Nome campo target confermato/corretto
 * @param userId - ID utente che conferma
 */
export async function saveLearnedMapping(
  connectorType: string,
  sourceField: string,
  targetField: string,
  userId: string
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("integration_field_mappings")
      .upsert(
        {
          connector_type: connectorType,
          source_field: sourceField,
          target_field: targetField,
          confirmed_by: userId,
          confirmed_at: new Date().toISOString(),
          usage_count: 0,
        },
        {
          onConflict: "connector_type,source_field,confirmed_by",
          ignoreDuplicates: false,
        }
      );

    if (error) {
      console.error(`[LEARNING] Salvataggio fallito: ${error.message}`);
      throw new Error(`Failed to save learned mapping: ${error.message}`);
    }

    console.log(
      `[LEARNING] Mapping confermato: ${connectorType}/${sourceField} → ${targetField} (user: ${userId})`
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Failed to save")) {
      throw err;
    }
    // Tabella potrebbe non esistere ancora — log e silenzioso
    console.warn(
      `[LEARNING] Errore salvataggio (tabella non disponibile?):`,
      err instanceof Error ? err.message : err
    );
  }
}

// ─── Lookup ───

/**
 * Cerca un mapping confermato dall'utente per un campo specifico.
 *
 * Ordine di priorita:
 *   1. Mapping confermato dall'utente specifico (userId)
 *   2. Mapping confermato da qualsiasi utente (piu usato)
 *
 * Se userId non e fornito, cerca solo mapping globali (piu usati).
 *
 * @param connectorType - ID connettore
 * @param sourceField - Nome campo sorgente
 * @param userId - User ID per lookup personale (opzionale)
 * @returns Campo target confermato, o null se nessun mapping trovato
 */
export async function getLearnedMapping(
  connectorType: string,
  sourceField: string,
  userId?: string
): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    // 1. Cerca mapping specifico dell'utente
    if (userId) {
      const { data: userMapping, error: userError } = await supabase
        .from("integration_field_mappings")
        .select("target_field")
        .eq("connector_type", connectorType)
        .eq("source_field", sourceField)
        .eq("confirmed_by", userId)
        .maybeSingle();

      if (!userError && userMapping) {
        // Incrementa usage_count (fire-and-forget)
        incrementUsageCount(connectorType, sourceField, userId).catch(() => {});
        return userMapping.target_field;
      }
    }

    // 2. Cerca mapping globale piu usato (qualsiasi utente)
    const { data: globalMapping, error: globalError } = await supabase
      .from("integration_field_mappings")
      .select("target_field")
      .eq("connector_type", connectorType)
      .eq("source_field", sourceField)
      .order("usage_count", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!globalError && globalMapping) {
      return globalMapping.target_field;
    }

    return null;
  } catch {
    // Tabella potrebbe non esistere ancora
    return null;
  }
}

/**
 * Cerca tutti i mapping confermati per un connettore (batch lookup).
 * Usato all'inizio del MappingEngine.resolveFields per caricare tutto in una query.
 *
 * @param connectorType - ID connettore
 * @param sourceFields - Lista campi sorgente da cercare
 * @param userId - User ID per lookup personale (opzionale)
 * @returns Mappa sourceField -> targetField per i campi trovati
 */
export async function getLearnedMappingsBatch(
  connectorType: string,
  sourceFields: string[],
  userId?: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (sourceFields.length === 0) return result;

  try {
    const supabase = createAdminClient();

    // Query per mapping specifici dell'utente
    if (userId) {
      const { data: userMappings, error: userError } = await supabase
        .from("integration_field_mappings")
        .select("source_field, target_field")
        .eq("connector_type", connectorType)
        .eq("confirmed_by", userId)
        .in("source_field", sourceFields);

      if (!userError && userMappings) {
        for (const m of userMappings) {
          result.set(m.source_field, m.target_field);
        }
      }
    }

    // Query per mapping globali (campi non ancora risolti dal lookup utente)
    const unresolvedFields = sourceFields.filter((f) => !result.has(f));
    if (unresolvedFields.length > 0) {
      const { data: globalMappings, error: globalError } = await supabase
        .from("integration_field_mappings")
        .select("source_field, target_field, usage_count")
        .eq("connector_type", connectorType)
        .in("source_field", unresolvedFields)
        .order("usage_count", { ascending: false });

      if (!globalError && globalMappings) {
        // Prendi il mapping piu usato per ogni campo (gia ordinato per usage_count DESC)
        for (const m of globalMappings) {
          if (!result.has(m.source_field)) {
            result.set(m.source_field, m.target_field);
          }
        }
      }
    }
  } catch {
    // Tabella potrebbe non esistere ancora — ritorna risultato parziale
    console.warn("[LEARNING] Batch lookup fallito (tabella non disponibile?)");
  }

  return result;
}

/**
 * Ritorna tutti i mapping confermati per un connettore.
 * Utile per la UI di gestione mapping.
 *
 * @param connectorType - ID connettore
 * @param userId - Filtra per utente specifico (opzionale)
 */
export async function getAllLearnedMappings(
  connectorType: string,
  userId?: string
): Promise<LearnedMapping[]> {
  try {
    const supabase = createAdminClient();

    let query = supabase
      .from("integration_field_mappings")
      .select("id, connector_type, source_field, target_field, confirmed_by, confirmed_at, usage_count")
      .eq("connector_type", connectorType)
      .order("usage_count", { ascending: false });

    if (userId) {
      query = query.eq("confirmed_by", userId);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(`[LEARNING] getAllLearnedMappings fallito: ${error.message}`);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      connectorType: row.connector_type,
      sourceField: row.source_field,
      targetField: row.target_field,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at,
      usageCount: row.usage_count,
    }));
  } catch {
    return [];
  }
}

// ─── Internal ───

/**
 * Incrementa il contatore usage_count per un mapping confermato.
 * Fire-and-forget: non blocca il flusso principale.
 */
async function incrementUsageCount(
  connectorType: string,
  sourceField: string,
  userId: string
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.rpc("increment_mapping_usage", {
      p_connector_type: connectorType,
      p_source_field: sourceField,
      p_confirmed_by: userId,
    });
  } catch {
    // RPC potrebbe non esistere — silenzioso
    // Fallback: update diretto
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("integration_field_mappings")
        .select("usage_count")
        .eq("connector_type", connectorType)
        .eq("source_field", sourceField)
        .eq("confirmed_by", userId)
        .maybeSingle();

      if (data) {
        await supabase
          .from("integration_field_mappings")
          .update({ usage_count: (data.usage_count ?? 0) + 1 })
          .eq("connector_type", connectorType)
          .eq("source_field", sourceField)
          .eq("confirmed_by", userId);
      }
    } catch {
      // Ignore silently
    }
  }
}
