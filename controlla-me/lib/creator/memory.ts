/**
 * Creator Memory — layer di memoria per i creator.
 *
 * Usa le tabelle Forma Mentis esistenti (company_sessions, department_memory)
 * con namespace "creator:{userId}" per isolamento.
 *
 * Graceful degradation: tutti gli errori vengono loggati ma mai rilanciati.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Session History ───

/**
 * Salva un summary di sessione per il creator.
 * Usa company_sessions con session_id = "creator:{userId}:{timestamp}".
 */
export async function saveCreatorSession(
  userId: string,
  summary: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    const sessionId = `creator:${userId}:${Date.now()}`;
    await admin.from("company_sessions").insert({
      session_id: sessionId,
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      summary,
      tasks_completed: 0,
      decisions_made: 0,
    });
  } catch (err) {
    console.error("[creator-memory] saveCreatorSession failed:", err);
  }
}

/**
 * Recupera gli ultimi N summary di sessione del creator.
 */
export async function getCreatorHistory(
  userId: string,
  limit = 5
): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("company_sessions")
      .select("summary")
      .like("session_id", `creator:${userId}:%`)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data
      .map((row) => row.summary as string)
      .filter(Boolean);
  } catch (err) {
    console.error("[creator-memory] getCreatorHistory failed:", err);
    return [];
  }
}

// ─── Preferences ───

/**
 * Salva una preferenza key-value per il creator.
 * Usa department_memory con department = "creator:{userId}".
 * Fa upsert: se la key esiste, aggiorna il content.
 */
export async function saveCreatorPreference(
  userId: string,
  key: string,
  value: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    const dept = `creator:${userId}`;
    const content = `${key}:${value}`;

    // Check if key already exists
    const { data: existing } = await admin
      .from("department_memory")
      .select("id")
      .eq("department", dept)
      .eq("memory_type", "preference")
      .like("content", `${key}:%`)
      .limit(1);

    if (existing && existing.length > 0) {
      await admin
        .from("department_memory")
        .update({ content, importance: 5 })
        .eq("id", existing[0].id);
    } else {
      await admin.from("department_memory").insert({
        department: dept,
        memory_type: "preference",
        content,
        importance: 5,
      });
    }
  } catch (err) {
    console.error("[creator-memory] saveCreatorPreference failed:", err);
  }
}

/**
 * Recupera tutte le preferenze del creator come Record<key, value>.
 */
export async function getCreatorPreferences(
  userId: string
): Promise<Record<string, string>> {
  try {
    const admin = createAdminClient();
    const dept = `creator:${userId}`;

    const { data, error } = await admin
      .from("department_memory")
      .select("content")
      .eq("department", dept)
      .eq("memory_type", "preference");

    if (error || !data) return {};

    const prefs: Record<string, string> = {};
    for (const row of data) {
      const content = row.content as string;
      const colonIdx = content.indexOf(":");
      if (colonIdx > 0) {
        prefs[content.slice(0, colonIdx)] = content.slice(colonIdx + 1);
      }
    }
    return prefs;
  } catch (err) {
    console.error("[creator-memory] getCreatorPreferences failed:", err);
    return {};
  }
}

/**
 * Recupera il nome del creator dalla memoria (se salvato).
 */
export async function getCreatorName(userId: string): Promise<string | null> {
  const prefs = await getCreatorPreferences(userId);
  return prefs["name"] || null;
}

// ─── Employee Name ───

/**
 * Salva il nome dell'employee personale del creator (es. "MDE", "Martina DiDomenicantonio Employee").
 * Il creator puo' scegliere come chiamare il suo employee.
 */
export async function saveEmployeeName(
  userId: string,
  name: string
): Promise<void> {
  await saveCreatorPreference(userId, "employee_name", name);
}

/**
 * Recupera il nome dell'employee personale del creator.
 * Ritorna null se non e' stato configurato (il caller usera' un default).
 */
export async function getEmployeeName(
  userId: string
): Promise<string | null> {
  const prefs = await getCreatorPreferences(userId);
  return prefs["employee_name"] || null;
}
