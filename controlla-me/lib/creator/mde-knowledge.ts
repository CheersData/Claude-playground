/**
 * MDE Knowledge — Dynamic knowledge loader for creator employees (MDE).
 *
 * Replaces the static PLATFORM_KNOWLEDGE constant in cme-prompt.ts.
 * Loads department-card.json and status.json from all company departments,
 * formats them into a concise knowledge block, caches in memory for 5 minutes.
 *
 * This is the "cordone ombelicale" — the MDE knows what the CME knows
 * because it reads the same sources in real time.
 */

import * as fs from "fs";
import * as path from "path";

const COMPANY_DIR = path.resolve(process.cwd(), "company");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedKnowledge {
  text: string;
  loadedAt: number;
}

let _cache: CachedKnowledge | null = null;

interface DeptSummary {
  name: string;
  id: string;
  type: "ufficio" | "staff";
  capabilities: string[];
  health: string;
  summary: string;
}

/**
 * Load platform knowledge dynamically from department cards and status files.
 * Returns a formatted text block ready to inject into the MDE prompt.
 * Cached in memory for 5 minutes.
 */
export async function loadPlatformKnowledge(): Promise<string> {
  const now = Date.now();
  if (_cache && now - _cache.loadedAt < CACHE_TTL_MS) {
    return _cache.text;
  }

  const departments = loadDepartments();
  const text = formatKnowledge(departments);

  _cache = { text, loadedAt: now };
  return text;
}

/**
 * Force-invalidate the knowledge cache.
 * Useful when department cards or status files are updated mid-session.
 */
export function invalidateKnowledgeCache(): void {
  _cache = null;
}

// ─── Internal ───

const UFFICI = new Set([
  "ufficio-legale",
  "trading",
  "integration",
  "music",
]);

function loadDepartments(): DeptSummary[] {
  const results: DeptSummary[] = [];

  let deptDirs: string[];
  try {
    deptDirs = fs.readdirSync(COMPANY_DIR).filter((d) => {
      try {
        return fs.statSync(path.join(COMPANY_DIR, d)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    console.warn("[mde-knowledge] Could not read company directory:", COMPANY_DIR);
    return results;
  }

  for (const dir of deptDirs) {
    try {
      const summary = loadSingleDepartment(dir);
      if (summary) results.push(summary);
    } catch (err) {
      // Skip malformed departments silently
      console.warn(`[mde-knowledge] Skipping ${dir}: ${(err as Error).message}`);
    }
  }

  return results;
}

function loadSingleDepartment(dir: string): DeptSummary | null {
  const cardPath = path.join(COMPANY_DIR, dir, "department-card.json");
  if (!fs.existsSync(cardPath)) return null;

  const cardRaw = fs.readFileSync(cardPath, "utf-8");
  const card = JSON.parse(cardRaw);

  // Extract capability descriptions (concise)
  const capabilities: string[] = [];
  if (Array.isArray(card.capabilities)) {
    for (const cap of card.capabilities) {
      if (cap.id && cap.description) {
        const cost = cap.costEstimate ? ` (${cap.costEstimate})` : "";
        capabilities.push(`${cap.id}: ${cap.description}${cost}`);
      }
    }
  }

  // Load status.json for live health
  let health = card.status || "unknown";
  let statusSummary = "";
  const statusPath = path.join(COMPANY_DIR, dir, "status.json");
  try {
    if (fs.existsSync(statusPath)) {
      const statusRaw = fs.readFileSync(statusPath, "utf-8");
      const status = JSON.parse(statusRaw);
      health = status.health || health;
      statusSummary = status.summary || "";
    }
  } catch {
    // Status file missing or malformed — use card status
  }

  return {
    name: card.name || dir,
    id: card.id || dir,
    type: UFFICI.has(card.id || dir) ? "ufficio" : "staff",
    capabilities,
    health,
    summary: statusSummary,
  };
}

function formatKnowledge(departments: DeptSummary[]): string {
  if (departments.length === 0) {
    return "Nessun dipartimento disponibile al momento.";
  }

  const uffici = departments.filter((d) => d.type === "ufficio");
  const staff = departments.filter((d) => d.type === "staff");

  const lines: string[] = [];

  lines.push("### Uffici (producono valore diretto)");
  for (const dept of uffici) {
    lines.push(formatDept(dept));
  }

  lines.push("");
  lines.push("### Staff (supportano i progetti)");
  for (const dept of staff) {
    lines.push(formatDept(dept));
  }

  return lines.join("\n");
}

function formatDept(dept: DeptSummary): string {
  const healthIcon = dept.health === "ok" || dept.health === "active" ? "[OK]" : `[${dept.health.toUpperCase()}]`;
  const caps = dept.capabilities.length > 0
    ? dept.capabilities.map((c) => `  - ${c}`).join("\n")
    : "  - (nessuna capability dichiarata)";
  const statusLine = dept.summary ? `  Stato: ${dept.summary}` : "";

  return `- **${dept.name}** ${healthIcon}${statusLine ? "\n" + statusLine : ""}\n${caps}`;
}
