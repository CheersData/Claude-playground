import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
  AgentPhase,
} from "./types";

const CACHE_DIR = path.join(process.cwd(), ".analysis-cache");

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
  documentTextPreview: string;
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

/** Ensure cache directory exists */
async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

/** Get cache file path for a session */
function cachePath(sessionId: string): string {
  return path.join(CACHE_DIR, `${sessionId}.json`);
}

/** Create a new cache session and return its ID */
export async function createSession(documentText: string): Promise<string> {
  await ensureCacheDir();

  const docHash = hashDocument(documentText);
  // UUID v4 random per rendere il sessionId non prevedibile
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const sessionId = `${docHash}-${randomPart}`;
  const now = new Date().toISOString();

  const cache: CachedAnalysis = {
    sessionId,
    documentHash: docHash,
    createdAt: now,
    updatedAt: now,
    documentTextPreview: documentText.slice(0, 200),
    classification: null,
    analysis: null,
    investigation: null,
    advice: null,
  };

  await fs.writeFile(cachePath(sessionId), JSON.stringify(cache, null, 2));
  console.log(`[CACHE] Sessione creata: ${sessionId}`);
  return sessionId;
}

/** Load an existing cached session */
export async function loadSession(
  sessionId: string
): Promise<CachedAnalysis | null> {
  try {
    const data = await fs.readFile(cachePath(sessionId), "utf-8");
    const cache: CachedAnalysis = JSON.parse(data);
    console.log(
      `[CACHE] Sessione caricata: ${sessionId} | ` +
        `classifier: ${cache.classification ? "OK" : "-"} | ` +
        `analyzer: ${cache.analysis ? "OK" : "-"} | ` +
        `investigator: ${cache.investigation ? "OK" : "-"} | ` +
        `advisor: ${cache.advice ? "OK" : "-"}`
    );
    return cache;
  } catch {
    return null;
  }
}

/** Save a single phase result to the cache */
export async function savePhaseResult(
  sessionId: string,
  phase: "classification" | "analysis" | "investigation" | "advice",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): Promise<void> {
  const cache = await loadSession(sessionId);
  if (!cache) {
    console.error(`[CACHE] Sessione non trovata: ${sessionId}`);
    return;
  }

  cache[phase] = data;
  cache.updatedAt = new Date().toISOString();

  await fs.writeFile(cachePath(sessionId), JSON.stringify(cache, null, 2));
  console.log(`[CACHE] Salvato ${phase} per sessione ${sessionId}`);
}

/** Find if there's an existing session for this document */
export async function findSessionByDocument(
  documentText: string
): Promise<CachedAnalysis | null> {
  await ensureCacheDir();
  const docHash = hashDocument(documentText);

  try {
    const files = await fs.readdir(CACHE_DIR);
    // Find most recent session for this document hash
    const matching = files
      .filter((f) => f.startsWith(docHash) && f.endsWith(".json"))
      .sort()
      .reverse();

    if (matching.length > 0) {
      const data = await fs.readFile(
        path.join(CACHE_DIR, matching[0]),
        "utf-8"
      );
      const cache: CachedAnalysis = JSON.parse(data);
      // Only return if not fully complete (otherwise start fresh)
      if (!cache.advice) {
        console.log(
          `[CACHE] Trovata sessione precedente per lo stesso documento: ${cache.sessionId}`
        );
        return cache;
      }
    }
  } catch {
    // Directory doesn't exist yet, no cached sessions
  }

  return null;
}

/** List recent sessions (for debugging) */
export async function listSessions(): Promise<CachedAnalysis[]> {
  await ensureCacheDir();
  try {
    const files = await fs.readdir(CACHE_DIR);
    const sessions: CachedAnalysis[] = [];
    for (const f of files.filter((f) => f.endsWith(".json")).slice(-10)) {
      const data = await fs.readFile(path.join(CACHE_DIR, f), "utf-8");
      sessions.push(JSON.parse(data));
    }
    return sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

/** Save timing info for a single phase */
export async function savePhaseTiming(
  sessionId: string,
  phase: AgentPhase,
  timing: PhaseTiming
): Promise<void> {
  const cache = await loadSession(sessionId);
  if (!cache) return;

  if (!cache.phaseTiming) cache.phaseTiming = {};
  cache.phaseTiming[phase] = timing;
  cache.updatedAt = new Date().toISOString();

  await fs.writeFile(cachePath(sessionId), JSON.stringify(cache, null, 2));
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
 * Compute average phase durations from cached sessions.
 * Falls back to defaults if not enough data.
 */
export async function getAverageTimings(): Promise<Record<AgentPhase, number>> {
  await ensureCacheDir();

  const phases: AgentPhase[] = ["classifier", "analyzer", "investigator", "advisor"];
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const p of phases) {
    sums[p] = 0;
    counts[p] = 0;
  }

  try {
    const files = await fs.readdir(CACHE_DIR);
    // Read last 30 sessions max for averages
    const jsonFiles = files.filter((f) => f.endsWith(".json")).slice(-30);

    for (const f of jsonFiles) {
      try {
        const data = await fs.readFile(path.join(CACHE_DIR, f), "utf-8");
        const session: CachedAnalysis = JSON.parse(data);
        if (!session.phaseTiming) continue;

        for (const p of phases) {
          const t = session.phaseTiming[p];
          if (t && t.durationMs > 0) {
            sums[p] += t.durationMs / 1000;
            counts[p]++;
          }
        }
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // No cache directory
  }

  const result = { ...DEFAULT_ESTIMATES };
  for (const p of phases) {
    if (counts[p] >= 1) {
      result[p] = Math.round((sums[p] / counts[p]) * 10) / 10; // 1 decimal
    }
  }

  console.log(
    `[CACHE] Medie tempi: ${phases.map((p) => `${p}=${result[p]}s (n=${counts[p]})`).join(", ")}`
  );
  return result;
}
