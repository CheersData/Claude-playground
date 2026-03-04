/**
 * GET /api/company/summary
 *
 * Legge il daily plan e il master report di oggi, estrae le sezioni chiave
 * e le restituisce come JSON strutturato per l'OverviewSummaryPanel.
 * Include anche i report dei dipartimenti (status.json) con data ultimo aggiornamento.
 *
 * Auth: requireConsoleAuth
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingDecision {
  id: string;
  text: string;
  urgency: "high" | "medium" | "low";
}

interface NextAction {
  dept: string;
  priority: "critical" | "high" | "medium";
  text: string;
}

interface DeptSummary {
  name: string;
  status: "green" | "yellow" | "red";
  note: string;
}

interface DeptReport {
  dept: string;
  health: string;
  summary: string;
  lastUpdated: string | null;
  updatedBy: string | null;
  openTasks: string[];
  blockers: string[];
  gaps: Array<{ id: string; description: string; severity: string }>;
  nextActions: string[];
  notes: string;
}

interface SummaryResponse {
  date: string;
  focus: string;
  pendingDecisions: PendingDecision[];
  nextActions: NextAction[];
  deptStatus: DeptSummary[];
  deptReports: DeptReport[];
  masterExists: boolean;
  masterUpdated: string | null;
  planExists: boolean;
  planUpdated: string | null;
}

// ─── Dept status readers ──────────────────────────────────────────────────────

const DEPT_STATUS_DIRS = [
  "trading",
  "quality-assurance",
  "data-engineering",
  "architecture",
  "security",
  "finance",
  "operations",
  "strategy",
  "marketing",
  "protocols",
  "ux-ui",
  "ufficio-legale",
  "acceleration",
];

function readDeptReports(root: string): DeptReport[] {
  const results: DeptReport[] = [];
  for (const dept of DEPT_STATUS_DIRS) {
    const statusPath = path.join(root, "company", dept, "status.json");
    if (!fs.existsSync(statusPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
      const gaps: DeptReport["gaps"] = [];
      if (Array.isArray(raw.gaps)) {
        for (const g of raw.gaps) {
          if (g.severity !== "closed") {
            gaps.push({ id: g.id ?? "", description: g.description ?? "", severity: g.severity ?? "" });
          }
        }
      }
      results.push({
        dept,
        health: raw.health ?? "unknown",
        summary: raw.summary ?? "",
        lastUpdated: raw._meta?.last_updated ?? null,
        updatedBy: raw._meta?.updated_by ?? null,
        openTasks: Array.isArray(raw.open_tasks) ? raw.open_tasks.filter((t: unknown) => typeof t === "string") : [],
        blockers: Array.isArray(raw.blockers) ? raw.blockers.filter((b: unknown) => typeof b === "string") : [],
        gaps,
        nextActions: Array.isArray(raw.next_actions) ? raw.next_actions.filter((a: unknown) => typeof a === "string").slice(0, 4) : [],
        notes: typeof raw.notes === "string" ? raw.notes : "",
      });
    } catch {
      // skip malformed files
    }
  }
  return results;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function extractSection(md: string, heading: string): string {
  const lines = md.split("\n");
  let inSection = false;
  const result: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## ") && line.includes(heading)) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) break;
    if (inSection) result.push(line);
  }
  return result.join("\n").trim();
}

function parsePendingDecisions(master: string): PendingDecision[] {
  const section = extractSection(master, "DECISIONI IN SOSPESO");
  if (!section) return [];
  const decisions: PendingDecision[] = [];
  const rows = section.split("\n").filter((l) => l.startsWith("|") && !l.includes("---") && !l.includes("Decisione"));
  for (const row of rows) {
    const cols = row.split("|").map((c) => c.trim()).filter(Boolean);
    if (cols.length >= 3) {
      const urgencyRaw = (cols[2] ?? "").toLowerCase();
      const urgency: PendingDecision["urgency"] =
        urgencyRaw.includes("alta") ? "high" :
        urgencyRaw.includes("media") ? "medium" : "low";
      decisions.push({
        id: cols[0] ?? `D-${decisions.length + 1}`,
        text: cols[1] ?? "",
        urgency,
      });
    }
  }
  return decisions.slice(0, 6);
}

function parseNextActions(master: string): NextAction[] {
  const section = extractSection(master, "PIANO OGGI");
  if (!section) return [];
  const actions: NextAction[] = [];
  const rows = section.split("\n").filter((l) => l.startsWith("|") && !l.includes("---") && !l.includes("Task") && !l.includes("#"));
  for (const row of rows) {
    const cols = row.split("|").map((c) => c.trim()).filter(Boolean);
    if (cols.length >= 4) {
      const priorityRaw = (cols[3] ?? "").toLowerCase();
      const priority: NextAction["priority"] =
        priorityRaw.includes("critical") ? "critical" :
        priorityRaw.includes("high") ? "high" : "medium";
      actions.push({
        dept: cols[2] ?? "",
        priority,
        text: cols[1] ?? "",
      });
    }
  }
  return actions.slice(0, 8);
}

function parseDeptStatus(master: string): DeptSummary[] {
  const section = extractSection(master, "SINTESI ESECUTIVA");
  if (!section) return [];
  const depts: DeptSummary[] = [];
  const rows = section.split("\n").filter((l) => l.startsWith("|") && !l.includes("---") && !l.includes("Dipartimento"));
  for (const row of rows) {
    const cols = row.split("|").map((c) => c.trim()).filter(Boolean);
    if (cols.length >= 4) {
      const statusRaw = cols[2] ?? "";
      const status: DeptSummary["status"] =
        statusRaw.includes("🟢") ? "green" :
        statusRaw.includes("🟡") ? "yellow" : "red";
      depts.push({
        name: cols[0] ?? "",
        status,
        note: cols[3] ?? "",
      });
    }
  }
  return depts;
}

function parseFocus(plan: string): string {
  const section = extractSection(plan, "Focus Raccomandato");
  if (!section) return "Nessun focus identificato per oggi.";
  return section.replace(/^_|_$/gm, "").replace(/`[^`]+`/g, "").trim().slice(0, 300);
}

function fileMtime(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    return stat.mtime.toISOString();
  } catch {
    return null;
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireConsoleAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const today = new Date().toISOString().split("T")[0];
  const root = path.join(process.cwd());

  const masterPath = path.join(root, "company", "reports", today, "00-master.md");
  const planPath = path.join(root, "company", "daily-plans", `${today}.md`);

  const masterExists = fs.existsSync(masterPath);
  const planExists = fs.existsSync(planPath);

  const master = masterExists ? fs.readFileSync(masterPath, "utf-8") : "";
  const plan = planExists ? fs.readFileSync(planPath, "utf-8") : "";

  const deptReports = readDeptReports(root);

  const response: SummaryResponse = {
    date: today,
    focus: parseFocus(plan),
    pendingDecisions: parsePendingDecisions(master),
    nextActions: parseNextActions(master),
    deptStatus: parseDeptStatus(master),
    deptReports,
    masterExists,
    masterUpdated: masterExists ? fileMtime(masterPath) : null,
    planExists,
    planUpdated: planExists ? fileMtime(planPath) : null,
  };

  return NextResponse.json(response);
}
