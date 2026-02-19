import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
} from "./types";

const CACHE_DIR = path.join(process.cwd(), ".analysis-cache");

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
  const sessionId = `${docHash}-${Date.now().toString(36)}`;
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
