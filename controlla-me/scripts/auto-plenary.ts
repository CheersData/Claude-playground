/**
 * Auto-Plenary — ADR-015 Step 2
 *
 * Reads all dept status.json files + CLAUDE.md sections 17 (features incomplete) + 19 (tech debt),
 * then generates 5-15 concrete tasks using deterministic rules.
 *
 * No LLM calls — zero API cost.
 *
 * Usage:
 *   npx tsx scripts/auto-plenary.ts              # Generate tasks + plenary minutes
 *   npx tsx scripts/auto-plenary.ts --dry-run     # Print proposed tasks without creating them
 *
 * Output (stdout): JSON array of proposed tasks (for cme-autorun.ts to parse).
 * Side effect: saves plenary minutes to company/plenary-minutes/.
 *
 * Idempotent: checks for existing open tasks with similar titles to avoid duplicates.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { getOpenTasks } from "../lib/company/tasks";
import type { Task } from "../lib/company/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const COMPANY_DIR = path.join(ROOT, "company");
const PLENARY_DIR = path.join(COMPANY_DIR, "plenary-minutes");
const CLAUDE_MD_PATH = path.join(ROOT, "CLAUDE.md");

const MAX_TASKS = 15;
const MIN_DEPARTMENTS = 3;

const ALL_DEPARTMENTS: string[] = [
  "ufficio-legale",
  "trading",
  "data-engineering",
  "quality-assurance",
  "architecture",
  "finance",
  "operations",
  "security",
  "strategy",
  "marketing",
  "ux-ui",
  "protocols",
  "acceleration",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProposedTask {
  title: string;
  dept: string;
  priority: "critical" | "high" | "medium" | "low";
  desc: string;
  reason: string; // why this task was generated (for plenary minutes)
  type: "concrete" | "planning"; // 70% concrete, 30% planning allowed
}

interface DeptStatus {
  dept: string;
  health: string;
  summary: string;
  open_tasks: Array<{ id: string; title: string; priority: string; status?: string }>;
  blockers: Array<{ id: string; title: string; priority?: string }>;
  gaps: Array<{ id: string; description: string; severity: string }>;
  next_actions?: string[];
  notes?: string;
  [key: string]: unknown;
}

interface TechDebtItem {
  id: string;
  description: string;
  status: "active" | "resolved";
}

interface IncompleteFeature {
  id: number;
  description: string;
  status: "incomplete" | "partial" | "completed";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readStatusJson(dept: string): DeptStatus | null {
  const p = path.join(COMPANY_DIR, dept, "status.json");
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return {
      dept,
      health: raw.health ?? "ok",
      summary: raw.summary ?? "",
      open_tasks: raw.open_tasks ?? [],
      blockers: raw.blockers ?? [],
      gaps: raw.gaps ?? [],
      next_actions: raw.next_actions,
      notes: raw.notes,
      ...raw,
    };
  } catch {
    return null;
  }
}

function readAllStatusJsons(): DeptStatus[] {
  const statuses: DeptStatus[] = [];
  for (const dept of ALL_DEPARTMENTS) {
    const s = readStatusJson(dept);
    if (s) statuses.push(s);
  }
  return statuses;
}

/**
 * Extract tech debt items from CLAUDE.md section 19.
 * Looks for the table rows with TD-* IDs.
 */
function extractTechDebt(): TechDebtItem[] {
  if (!fs.existsSync(CLAUDE_MD_PATH)) return [];
  const content = fs.readFileSync(CLAUDE_MD_PATH, "utf-8");

  // Find section 19
  const section19Match = content.match(
    /## 19\. TECH DEBT CRITICO[\s\S]*?(?=\n## \d|$)/
  );
  if (!section19Match) return [];
  const section = section19Match[0];

  const items: TechDebtItem[] = [];

  // Extract table rows: | TD-N | file | problem | impact | effort |
  const rows = section.match(/\| TD-\d+[^\n]+/g) ?? [];
  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const id = cells[1]; // TD-N
    const description = cells[3]; // Problem column
    const isResolved =
      description.includes("RISOLTO") ||
      description.includes("~~") ||
      cells[4]?.includes("—");
    items.push({
      id,
      description,
      status: isResolved ? "resolved" : "active",
    });
  }

  // Also check "Debiti tecnici minori" section for non-table items
  const minorMatch = section.match(
    /### Debiti tecnici minori[\s\S]*?(?=\n###|$)/
  );
  if (minorMatch) {
    const lines = minorMatch[0].split("\n");
    for (const line of lines) {
      const bulletMatch = line.match(/^- (.+)/);
      if (bulletMatch) {
        const desc = bulletMatch[1];
        const isResolved =
          desc.includes("RISOLTO") || desc.startsWith("~~");
        if (!isResolved) {
          items.push({
            id: `TD-minor-${items.length}`,
            description: desc.replace(/~~.*?~~/g, "").trim(),
            status: "active",
          });
        }
      }
    }
  }

  return items;
}

/**
 * Extract incomplete features from CLAUDE.md section 17.
 * Looks for numbered list items, marks completed/partial/incomplete.
 */
function extractIncompleteFeatures(): IncompleteFeature[] {
  if (!fs.existsSync(CLAUDE_MD_PATH)) return [];
  const content = fs.readFileSync(CLAUDE_MD_PATH, "utf-8");

  // Find section 17
  const section17Match = content.match(
    /## 17\. FEATURE INCOMPLETE[\s\S]*?(?=\n## \d|$)/
  );
  if (!section17Match) return [];
  const section = section17Match[0];

  const items: IncompleteFeature[] = [];
  const lines = section.split("\n");

  for (const line of lines) {
    const itemMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (!itemMatch) continue;

    const id = parseInt(itemMatch[1], 10);
    const description = itemMatch[2];

    let status: IncompleteFeature["status"] = "incomplete";
    if (
      description.includes("**COMPLETATO**") ||
      (description.includes("~~") && !description.includes("PARZIALMENTE"))
    ) {
      status = "completed";
    } else if (description.includes("**PARZIALMENTE COMPLETATO**")) {
      status = "partial";
    }

    items.push({ id, description, status });
  }

  return items;
}

/**
 * Check if a similar task already exists open/in_progress for this dept.
 * Uses simple keyword matching to avoid duplicates.
 */
function hasSimilarOpenTask(
  proposed: ProposedTask,
  existingTasks: Task[]
): boolean {
  const proposedLower = proposed.title.toLowerCase();
  const deptTasks = existingTasks.filter(
    (t) =>
      t.department === proposed.dept &&
      (t.status === "open" || t.status === "in_progress")
  );

  for (const existing of deptTasks) {
    const existingLower = existing.title.toLowerCase();
    // Check for significant word overlap (3+ shared words of length >= 4)
    const proposedWords = proposedLower.split(/\s+/).filter((w) => w.length >= 4);
    const existingWords = new Set(
      existingLower.split(/\s+/).filter((w) => w.length >= 4)
    );
    const overlap = proposedWords.filter((w) => existingWords.has(w)).length;
    if (overlap >= 3) return true;
    // Exact title match
    if (existingLower === proposedLower) return true;
  }

  return false;
}

// ─── Task Generation Rules ───────────────────────────────────────────────────

function generateTasks(
  statuses: DeptStatus[],
  techDebt: TechDebtItem[],
  incompleteFeatures: IncompleteFeature[],
  existingTasks: Task[]
): ProposedTask[] {
  const proposed: ProposedTask[] = [];

  // ── Rule 1: health=critical → fix gap task (critical priority) ──
  for (const dept of statuses) {
    if (dept.health === "critical") {
      const criticalGaps = (dept.gaps ?? []).filter(
        (g) => g.severity === "critical"
      );
      for (const gap of criticalGaps) {
        proposed.push({
          title: `Fix critical gap: ${gap.description.slice(0, 80)}`,
          dept: dept.dept,
          priority: "critical",
          desc: `Il dipartimento ${dept.dept} ha un gap critico (${gap.id}): ${gap.description}. Risolvere immediatamente.`,
          reason: `health=critical, gap ${gap.id} severity=critical`,
          type: "concrete",
        });
      }
    }
  }

  // ── Rule 2: health=warning + blockers → unblock task (high) ──
  for (const dept of statuses) {
    if (dept.health === "warning" && dept.blockers.length > 0) {
      proposed.push({
        title: `Unblock ${dept.dept}: ${dept.blockers[0].title.slice(0, 60)}`,
        dept: dept.dept,
        priority: "high",
        desc: `Il dipartimento ${dept.dept} ha ${dept.blockers.length} task bloccati. Primo blocker: "${dept.blockers[0].title}". Sbloccare il task rimuovendo la dipendenza o risolvendo il problema.`,
        reason: `health=warning, ${dept.blockers.length} blocked tasks`,
        type: "concrete",
      });
    }
  }

  // ── Rule 3: dept idle (0 open tasks) → task from vision/mission (medium) ──
  for (const dept of statuses) {
    const isIdle = dept.open_tasks.length === 0 && dept.blockers.length === 0;
    if (isIdle) {
      // Try to use next_actions from status.json if available
      const nextAction = dept.next_actions?.[0];
      if (nextAction) {
        proposed.push({
          title: `${dept.dept}: ${nextAction.slice(0, 70)}`,
          dept: dept.dept,
          priority: "medium",
          desc: `Dipartimento idle (0 task aperti). Azione suggerita dal status.json: ${nextAction}`,
          reason: `dept idle, next_action from status.json`,
          type: "concrete",
        });
      } else {
        // Generate a review/maintenance task
        proposed.push({
          title: `Review stato ${dept.dept} e proponi prossimi task`,
          dept: dept.dept,
          priority: "medium",
          desc: `Dipartimento ${dept.dept} idle (0 task aperti, 0 bloccati). Leggere department.md, verificare gap e priorita operative, proporre 2-3 task concreti allineati alla vision.`,
          reason: `dept idle, no next_actions in status.json`,
          type: "planning",
        });
      }
    }
  }

  // ── Rule 4: open gaps with severity != closed → fix gap (medium) ──
  for (const dept of statuses) {
    const openGaps = (dept.gaps ?? []).filter(
      (g) =>
        g.severity !== "closed" &&
        g.severity !== "low" &&
        g.severity !== "critical" // critical already handled in rule 1
    );
    for (const gap of openGaps.slice(0, 1)) {
      // max 1 per dept to avoid flooding
      proposed.push({
        title: `Fix gap ${gap.id}: ${gap.description.slice(0, 60)}`,
        dept: dept.dept,
        priority: "medium",
        desc: `Gap aperto (${gap.id}, severity=${gap.severity}): ${gap.description}`,
        reason: `open gap ${gap.id} severity=${gap.severity}`,
        type: "concrete",
      });
    }
  }

  // ── Rule 5: tech debt active (CLAUDE.md 19) → fix debt (medium) ──
  const activeTechDebt = techDebt.filter((td) => td.status === "active");
  for (const td of activeTechDebt.slice(0, 2)) {
    // max 2 tech debt tasks
    proposed.push({
      title: `Fix tech debt ${td.id}: ${td.description.slice(0, 60)}`,
      dept: "architecture",
      priority: "medium",
      desc: `Tech debt attivo da CLAUDE.md sezione 19: ${td.description}`,
      reason: `tech debt ${td.id} active in CLAUDE.md §19`,
      type: "concrete",
    });
  }

  // ── Rule 6: incomplete features (CLAUDE.md 17) → implement (medium) ──
  const incompleteOnly = incompleteFeatures.filter(
    (f) => f.status === "incomplete" || f.status === "partial"
  );
  for (const feature of incompleteOnly.slice(0, 2)) {
    // max 2 feature tasks
    // Map features to departments
    const deptMapping: Record<string, string> = {
      OCR: "ufficio-legale",
      referral: "ufficio-legale",
      "CI/CD": "quality-assurance",
      test: "quality-assurance",
      corpus: "data-engineering",
      "Verticale HR": "data-engineering",
      dashboard: "operations",
    };
    let targetDept = "architecture"; // default
    for (const [keyword, dept] of Object.entries(deptMapping)) {
      if (feature.description.includes(keyword)) {
        targetDept = dept;
        break;
      }
    }

    // Clean description: remove strikethrough markers and completion notes
    const cleanDesc = feature.description
      .replace(/~~.*?~~/g, "")
      .replace(/\*\*.*?\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();

    proposed.push({
      title: `Implement feature #${feature.id}: ${cleanDesc.slice(0, 55)}`,
      dept: targetDept,
      priority: "medium",
      desc: `Feature incompleta da CLAUDE.md sezione 17 (#${feature.id}): ${feature.description.slice(0, 200)}`,
      reason: `feature incomplete #${feature.id} in CLAUDE.md §17`,
      type: "concrete",
    });
  }

  // ── Dedup: remove tasks that already have a similar open task ──
  const deduped = proposed.filter(
    (p) => !hasSimilarOpenTask(p, existingTasks)
  );

  // ── Enforce limits ──
  // Sort by priority: critical > high > medium > low
  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  deduped.sort(
    (a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
  );

  // Cap at MAX_TASKS
  let final = deduped.slice(0, MAX_TASKS);

  // Enforce 70/30 concrete/planning split
  const concrete = final.filter((t) => t.type === "concrete");
  const planning = final.filter((t) => t.type === "planning");
  const maxPlanning = Math.floor(final.length * 0.3);
  if (planning.length > maxPlanning) {
    final = [...concrete, ...planning.slice(0, maxPlanning)];
  }

  // Ensure minimum department spread
  const deptsTouched = new Set(final.map((t) => t.dept));
  if (deptsTouched.size < MIN_DEPARTMENTS && final.length >= MIN_DEPARTMENTS) {
    // Already doing our best — the rules naturally spread across departments
    // This is a soft constraint; we don't artificially add tasks to hit the minimum
    console.log(
      `  NOTE: Only ${deptsTouched.size} departments touched (min target: ${MIN_DEPARTMENTS})`
    );
  }

  return final;
}

// ─── Plenary Minutes ─────────────────────────────────────────────────────────

function generatePlenaryMinutes(
  statuses: DeptStatus[],
  proposedTasks: ProposedTask[],
  techDebt: TechDebtItem[],
  incompleteFeatures: IncompleteFeature[]
): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16);

  const lines: string[] = [];

  lines.push(`# Plenaria Automatica — ${dateStr} ${timeStr}`);
  lines.push("");
  lines.push("> Generata da `scripts/auto-plenary.ts` (ADR-015). Zero LLM. Regole deterministiche.");
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Department Health Overview ──
  lines.push("## Stato Dipartimenti");
  lines.push("");
  lines.push("| Dipartimento | Health | Open | Blocked | Summary |");
  lines.push("|-------------|--------|------|---------|---------|");

  for (const dept of statuses) {
    const icon =
      dept.health === "ok" ? "OK" : dept.health === "warning" ? "WARN" : "CRIT";
    const summaryShort =
      dept.summary.length > 60
        ? dept.summary.slice(0, 57) + "..."
        : dept.summary;
    lines.push(
      `| ${dept.dept} | ${icon} | ${dept.open_tasks.length} | ${dept.blockers.length} | ${summaryShort} |`
    );
  }
  lines.push("");

  // ── Warnings ──
  const warnings = statuses.filter((d) => d.health !== "ok");
  if (warnings.length > 0) {
    lines.push("## Avvisi");
    lines.push("");
    for (const w of warnings) {
      lines.push(
        `- **${w.dept}** (${w.health}): ${w.summary}`
      );
      if (w.blockers.length > 0) {
        for (const b of w.blockers) {
          lines.push(`  - Bloccato: ${b.title}`);
        }
      }
    }
    lines.push("");
  }

  // ── Idle Departments ──
  const idleDepts = statuses.filter(
    (d) => d.open_tasks.length === 0 && d.blockers.length === 0
  );
  if (idleDepts.length > 0) {
    lines.push("## Dipartimenti Idle");
    lines.push("");
    for (const d of idleDepts) {
      lines.push(`- **${d.dept}**: ${d.summary}`);
    }
    lines.push("");
  }

  // ── Tech Debt ──
  const activeTD = techDebt.filter((td) => td.status === "active");
  if (activeTD.length > 0) {
    lines.push("## Tech Debt Attivo");
    lines.push("");
    for (const td of activeTD) {
      lines.push(`- **${td.id}**: ${td.description}`);
    }
    lines.push("");
  }

  // ── Incomplete Features ──
  const incomplete = incompleteFeatures.filter(
    (f) => f.status !== "completed"
  );
  if (incomplete.length > 0) {
    lines.push("## Feature Incomplete");
    lines.push("");
    for (const f of incomplete) {
      const badge = f.status === "partial" ? " (parziale)" : "";
      lines.push(`- **#${f.id}${badge}**: ${f.description.slice(0, 120)}`);
    }
    lines.push("");
  }

  // ── Proposed Tasks ──
  lines.push("## Task Proposti");
  lines.push("");
  lines.push(
    `Generati: **${proposedTasks.length}** task (${proposedTasks.filter((t) => t.type === "concrete").length} concreti, ${proposedTasks.filter((t) => t.type === "planning").length} planning)`
  );
  lines.push("");
  lines.push("| # | Dept | Priority | Title | Type | Reason |");
  lines.push("|---|------|----------|-------|------|--------|");

  for (let i = 0; i < proposedTasks.length; i++) {
    const t = proposedTasks[i];
    lines.push(
      `| ${i + 1} | ${t.dept} | ${t.priority} | ${t.title} | ${t.type} | ${t.reason} |`
    );
  }
  lines.push("");

  // ── Department Coverage ──
  const deptsTouched = new Set(proposedTasks.map((t) => t.dept));
  lines.push(
    `Dipartimenti coinvolti: **${deptsTouched.size}** (${[...deptsTouched].join(", ")})`
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    `_Generato da auto-plenary.ts il ${now.toISOString()}_`
  );

  return lines.join("\n");
}

function savePlenaryMinutes(content: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16).replace(":", "-");
  const fileName = `${dateStr}-auto-${timeStr}.md`;
  const filePath = path.join(PLENARY_DIR, fileName);

  try {
    if (!fs.existsSync(PLENARY_DIR)) {
      fs.mkdirSync(PLENARY_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (err) {
    console.error(`[auto-plenary] Failed to write ${filePath}:`, err);
  }
  return filePath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.error(
    "\n[auto-plenary] Generating automatic plenary...\n"
  );

  // Step 1: Read all dept statuses
  const statuses = readAllStatusJsons();
  console.error(`  Read ${statuses.length} department status files`);

  // Step 2: Extract tech debt and incomplete features from CLAUDE.md
  const techDebt = extractTechDebt();
  const incompleteFeatures = extractIncompleteFeatures();
  console.error(
    `  CLAUDE.md: ${techDebt.filter((t) => t.status === "active").length} active tech debt, ${incompleteFeatures.filter((f) => f.status !== "completed").length} incomplete features`
  );

  // Step 3: Get existing tasks (for dedup)
  const existingTasks = await getOpenTasks({ limit: 500 });
  console.error(`  Existing tasks: ${existingTasks.length}`);

  // Step 4: Generate proposed tasks
  const proposedTasks = generateTasks(
    statuses,
    techDebt,
    incompleteFeatures,
    existingTasks
  );
  console.error(`  Proposed tasks: ${proposedTasks.length}`);

  // Step 5: Generate and save plenary minutes
  const minutes = generatePlenaryMinutes(
    statuses,
    proposedTasks,
    techDebt,
    incompleteFeatures
  );
  const minutesPath = savePlenaryMinutes(minutes);
  console.error(`  Plenary minutes saved: ${minutesPath}`);

  if (dryRun) {
    console.error("\n[auto-plenary] DRY RUN — tasks NOT created:\n");
    for (const t of proposedTasks) {
      console.error(
        `  [${t.priority.toUpperCase()}] ${t.dept}: ${t.title}`
      );
      console.error(`    desc: ${t.desc.slice(0, 100)}`);
      console.error(`    reason: ${t.reason}`);
      console.error("");
    }
  }

  // Output: JSON to stdout (for cme-autorun.ts to parse and create tasks)
  const output = proposedTasks.map((t) => ({
    title: t.title,
    dept: t.dept,
    priority: t.priority,
    desc: t.desc,
  }));
  console.log(JSON.stringify(output));

  console.error(`\n[auto-plenary] Done. ${proposedTasks.length} tasks proposed.\n`);
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  process.exit(1);
});
