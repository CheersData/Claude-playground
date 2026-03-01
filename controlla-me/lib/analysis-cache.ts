/**
 * analysis-cache.ts — Cache sessioni analisi su Supabase.
 *
 * ARCH-007: migrata da filesystem (.analysis-cache/*.json) a Supabase
 * per compatibilità con ambiente serverless (Vercel) e multi-istanza.
 * API pubblica invariata — nessuna modifica ai caller.
 *
 * Tabella: public.analysis_sessions (migration 007_analysis_sessions.sql)
 * Accesso: solo service_role (createAdminClient)
 * TTL: 24h, cleanup via cleanup_old_analysis_sessions() SQL function
 */

import crypto from "crypto";
import { createAdminClient } from "./supabase/admin";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
  AgentPhase,
} from "./types";

export interface PhaseTiming {
  startedAt: string;   // ISO timestamp
  completedAt: string; // ISO timestamp
  durationMs: number;
}

export interface CachedAnalysis {
  sessionId: string;
  documentHash: string;
  createdAt: string;
  updatedAt: string;
  // SEC-005: documentTextPreview rimosso — conteneva testo grezzo del contratto in plaintext.
  // Non necessario per nessuna funzione di business; violazione GDPR art. 5 (minimizzazione).
  classification: ClassificationResult | null;
  analysis: AnalysisResult | null;
  investigation: InvestigationResult | null;
  advice: AdvisorResult | null;
  /** Actual measured durations for each phase (added after first run) */
  phaseTiming?: Partial<Record<AgentPhase, PhaseTiming>>;
}

/** Generate a deterministic hash of the document text */
function hashDocument(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Map DB row → CachedAnalysis */
function rowToCache(row: Record<string, unknown>): CachedAnalysis {
  return {
    sessionId: row.session_id as string,
    documentHash: row.document_hash as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    classification: (row.classification as ClassificationResult | null) ?? null,
    analysis: (row.analysis as AnalysisResult | null) ?? null,
    investigation: (row.investigation as InvestigationResult | null) ?? null,
    advice: (row.advice as AdvisorResult | null) ?? null,
    phaseTiming: (row.phase_timing as Partial<Record<AgentPhase, PhaseTiming>>) ?? {},
  };
}

/** Create a new cache session and return its ID */
export async function createSession(documentText: string): Promise<string> {
  const docHash = hashDocument(documentText);
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const sessionId = `${docHash}-${randomPart}`;
  const now = new Date().toISOString();

  const supabase = createAdminClient();
  const { error } = await supabase.from("analysis_sessions").insert({
    session_id: sessionId,
    document_hash: docHash,
    created_at: now,
    updated_at: now,
    classification: null,
    analysis: null,
    investigation: null,
    advice: null,
    phase_timing: {},
  });

  if (error) {
    console.error(`[CACHE] Errore creazione sessione: ${error.message}`);
    throw new Error(`Cache createSession failed: ${error.message}`);
  }

  console.log(`[CACHE] Sessione creata: ${sessionId}`);
  return sessionId;
}

/** Load an existing cached session */
export async function loadSession(
  sessionId: string
): Promise<CachedAnalysis | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("analysis_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .single();

  if (error || !data) return null;

  const cache = rowToCache(data);
  console.log(
    `[CACHE] Sessione caricata: ${sessionId} | ` +
      `classifier: ${cache.classification ? "OK" : "-"} | ` +
      `analyzer: ${cache.analysis ? "OK" : "-"} | ` +
      `investigator: ${cache.investigation ? "OK" : "-"} | ` +
      `advisor: ${cache.advice ? "OK" : "-"}`
  );
  return cache;
}

/** Save a single phase result to the cache */
export async function savePhaseResult(
  sessionId: string,
  phase: "classification" | "analysis" | "investigation" | "advice",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("analysis_sessions")
    .update({
      [phase]: data,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId);

  if (error) {
    console.error(`[CACHE] Errore salvataggio ${phase}: ${error.message}`);
    return;
  }
  console.log(`[CACHE] Salvato ${phase} per sessione ${sessionId}`);
}

/** Find if there's an existing incomplete session for this document */
export async function findSessionByDocument(
  documentText: string
): Promise<CachedAnalysis | null> {
  const docHash = hashDocument(documentText);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("analysis_sessions")
    .select("*")
    .eq("document_hash", docHash)
    .is("advice", null)           // Solo sessioni incomplete
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const cache = rowToCache(data);
  console.log(
    `[CACHE] Trovata sessione precedente per lo stesso documento: ${cache.sessionId}`
  );
  return cache;
}

/** List recent sessions (for debugging) */
export async function listSessions(): Promise<CachedAnalysis[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("analysis_sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error || !data) return [];
  return data.map(rowToCache);
}

/** Save timing info for a single phase */
export async function savePhaseTiming(
  sessionId: string,
  phase: AgentPhase,
  timing: PhaseTiming
): Promise<void> {
  // Leggi phase_timing corrente, aggiorna la fase, riscrivi
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("analysis_sessions")
    .select("phase_timing")
    .eq("session_id", sessionId)
    .single();

  const currentTiming: Partial<Record<AgentPhase, PhaseTiming>> =
    (data?.phase_timing as Partial<Record<AgentPhase, PhaseTiming>>) ?? {};

  currentTiming[phase] = timing;

  const { error } = await supabase
    .from("analysis_sessions")
    .update({
      phase_timing: currentTiming,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId);

  if (error) {
    console.error(`[CACHE] Errore salvataggio timing ${phase}: ${error.message}`);
    return;
  }
  console.log(
    `[CACHE] Timing ${phase}: ${(timing.durationMs / 1000).toFixed(1)}s per sessione ${sessionId}`
  );
}

/** Default phase estimates (seconds) used when no historical data exists */
const DEFAULT_ESTIMATES: Record<AgentPhase, number> = {
  classifier: 12,
  analyzer: 25,
  investigator: 22,
  advisor: 18,
};

/**
 * Compute average phase durations from recent completed sessions.
 * Falls back to defaults if not enough data.
 * Also triggers async cleanup of expired sessions (TTL 24h).
 */
export async function getAverageTimings(): Promise<Record<AgentPhase, number>> {
  const supabase = createAdminClient();
  const phases: AgentPhase[] = ["classifier", "analyzer", "investigator", "advisor"];

  // Fire-and-forget cleanup (non blocca l'analisi)
  void (async () => {
    try {
      const { data: deleted } = await supabase.rpc("cleanup_old_analysis_sessions", { retention_hours: 24 });
      if (deleted && deleted > 0) {
        console.log(`[CACHE] TTL cleanup: ${deleted} sessioni scadute rimosse`);
      }
    } catch { /* non fatale */ }
  })();

  // Ultime 30 sessioni complete con timing
  const { data, error } = await supabase
    .from("analysis_sessions")
    .select("phase_timing")
    .not("advice", "is", null)
    .neq("phase_timing", "{}")
    .order("updated_at", { ascending: false })
    .limit(30);

  const result = { ...DEFAULT_ESTIMATES };

  if (error || !data || data.length === 0) {
    console.log(`[CACHE] Nessun dato storico, uso stime default`);
    return result;
  }

  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const p of phases) { sums[p] = 0; counts[p] = 0; }

  for (const row of data) {
    const pt = row.phase_timing as Partial<Record<AgentPhase, PhaseTiming>>;
    if (!pt) continue;
    for (const p of phases) {
      const t = pt[p];
      if (t && t.durationMs > 0) {
        sums[p] += t.durationMs / 1000;
        counts[p]++;
      }
    }
  }

  for (const p of phases) {
    if (counts[p] >= 1) {
      result[p] = Math.round((sums[p] / counts[p]) * 10) / 10;
    }
  }

  console.log(
    `[CACHE] Medie tempi: ${phases.map((p) => `${p}=${result[p]}s (n=${counts[p]})`).join(", ")}`
  );
  return result;
}

/**
 * SEC-005 / ARCH-007: Cleanup sessioni più vecchie di maxAgeMs (default 24h).
 * Con Supabase delega al DB via RPC — nessun filesystem da gestire.
 */
export async function cleanupOldSessions(
  maxAgeMs: number = 24 * 3600 * 1000
): Promise<void> {
  const retentionHours = Math.ceil(maxAgeMs / 3600_000);
  const supabase = createAdminClient();
  const { data: deleted, error } = await supabase.rpc(
    "cleanup_old_analysis_sessions",
    { retention_hours: retentionHours }
  );

  if (error) {
    console.error(`[CACHE] Errore cleanup: ${error.message}`);
    return;
  }
  if (deleted && deleted > 0) {
    console.log(`[CACHE] TTL cleanup: ${deleted} sessioni scadute rimosse`);
  }
}
