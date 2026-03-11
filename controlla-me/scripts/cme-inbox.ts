#!/usr/bin/env npx tsx
/**
 * CME Inbox — Il motore di auto-alimentazione
 *
 * Raccoglie informazioni da tutti i canali e produce un inbox prioritizzato.
 * Opzionalmente "harvesta" suggestedNext e li converte in task reali.
 *
 * Usage:
 *   npx tsx scripts/cme-inbox.ts                   # Mostra inbox completo
 *   npx tsx scripts/cme-inbox.ts --harvest          # Crea follow-up task da suggestedNext
 *   npx tsx scripts/cme-inbox.ts --status           # Panoramica salute dipartimenti
 *   npx tsx scripts/cme-inbox.ts --harvest --dry-run # Mostra cosa creerebbe senza farlo
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { createTask, getOpenTasks, getTaskBoard } from "@/lib/company/tasks";
import type { Task } from "@/lib/company/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTelegramConfigured, sendMessage } from "./lib/telegram";

// ─── Config ──────────────────────────────────────────────────────────

const COMPANY_DIR = path.resolve(__dirname, "../company");
const PLENARY_DIR = path.join(COMPANY_DIR, "plenary-minutes");

// Tutti i dipartimenti con status.json (inclusi quelli fuori dal type Department)
const ALL_DEPTS = [
  "architecture",
  "security",
  "operations",
  "finance",
  "protocols",
  "ux-ui",
  "ufficio-legale",
  "acceleration",
  "data-engineering",
  "quality-assurance",
  "trading",
  "marketing",
  "strategy",
];

// ─── Types ───────────────────────────────────────────────────────────

interface DeptStatus {
  dept: string;
  health: string;
  summary: string;
  gaps: Array<{ id: string; description: string; severity: string }>;
  blockers: Array<{ id?: string; description?: string; severity?: string; [key: string]: unknown }>;
  openTasks: unknown[];
  lastUpdated: string;
  updatedBy: string;
}

interface InboxItem {
  priority: number; // 1=highest
  source: string;
  department: string;
  title: string;
  detail: string;
  action: string;
}

interface HarvestCandidate {
  taskId: string;
  taskSeqNum: number | undefined;
  taskTitle: string;
  department: string;
  suggestedNext: string;
  completedAt: string | null;
}

// ─── Status Reader ───────────────────────────────────────────────────

function readAllDeptStatuses(): DeptStatus[] {
  const statuses: DeptStatus[] = [];

  for (const dept of ALL_DEPTS) {
    const statusFile = path.join(COMPANY_DIR, dept, "status.json");
    if (!fs.existsSync(statusFile)) {
      statuses.push({
        dept,
        health: "unknown",
        summary: "NESSUN status.json — dipartimento invisibile",
        gaps: [],
        blockers: [],
        openTasks: [],
        lastUpdated: "mai",
        updatedBy: "nessuno",
      });
      continue;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(statusFile, "utf-8"));
      statuses.push({
        dept,
        health: raw.health ?? "unknown",
        summary: raw.summary ?? "",
        gaps: (raw.gaps ?? []).filter(
          (g: { severity?: string }) => g.severity !== "closed"
        ),
        blockers: raw.blockers ?? [],
        openTasks: raw.open_tasks ?? [],
        lastUpdated: raw._meta?.last_updated ?? "unknown",
        updatedBy: raw._meta?.updated_by ?? "unknown",
      });
    } catch {
      statuses.push({
        dept,
        health: "error",
        summary: `Errore parsing status.json`,
        gaps: [],
        blockers: [],
        openTasks: [],
        lastUpdated: "error",
        updatedBy: "error",
      });
    }
  }

  return statuses;
}

// ─── Harvest: suggestedNext → task ───────────────────────────────────

async function findHarvestCandidates(): Promise<HarvestCandidate[]> {
  const supabase = createAdminClient();

  // Query task completati con suggestedNext non vuoto
  const { data, error } = await supabase
    .from("company_tasks")
    .select("id, seq_num, title, department, suggested_next, completed_at")
    .eq("status", "done")
    .not("suggested_next", "is", null)
    .order("completed_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Errore query suggestedNext:", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Filtra: escludi task il cui suggestedNext è già stato creato come task
  const candidates: HarvestCandidate[] = [];

  for (const row of data) {
    const suggestedNext = row.suggested_next as string;

    // Controlla se esiste già un task con titolo simile (fuzzy match: contiene la keyword)
    const keywords = suggestedNext
      .split(/\s+/)
      .filter((w: string) => w.length > 4)
      .slice(0, 3);

    if (keywords.length === 0) continue;

    // Cerca task esistenti con lo stesso parent o titolo simile
    const { data: existing } = await supabase
      .from("company_tasks")
      .select("id")
      .eq("parent_task_id", row.id)
      .limit(1);

    if (existing && existing.length > 0) continue; // Già harvested

    candidates.push({
      taskId: row.id,
      taskSeqNum: row.seq_num,
      taskTitle: row.title,
      department: row.department,
      suggestedNext: suggestedNext,
      completedAt: row.completed_at,
    });
  }

  return candidates;
}

async function harvestSuggestedNext(
  dryRun: boolean
): Promise<{ created: number; candidates: HarvestCandidate[] }> {
  const candidates = await findHarvestCandidates();

  if (candidates.length === 0) {
    return { created: 0, candidates: [] };
  }

  let created = 0;

  for (const c of candidates) {
    if (dryRun) {
      console.log(
        `  [DRY-RUN] Creerebbe: "${c.suggestedNext}" → ${c.department} (da #${c.taskSeqNum ?? c.taskId.slice(0, 8)})`
      );
      continue;
    }

    try {
      const validDepts = [
        "ufficio-legale", "trading", "data-engineering", "quality-assurance",
        "architecture", "finance", "operations", "security", "strategy",
        "marketing", "ux-ui",
      ];
      const dept = validDepts.includes(c.department) ? c.department : "operations";

      await createTask({
        title: c.suggestedNext.slice(0, 120),
        description: `Auto-harvested da task #${c.taskSeqNum ?? "?"} ("${c.taskTitle}"). Suggerimento originale: ${c.suggestedNext}`,
        department: dept as any,
        priority: "medium",
        createdBy: "cme-inbox-harvest",
        parentTaskId: c.taskId,
        routingExempt: true,
        routingReason: "auto-harvest da suggestedNext — routing implicito dal task parent",
      });
      created++;
      console.log(
        `  [CREATED] "${c.suggestedNext.slice(0, 80)}..." → ${dept}`
      );
    } catch (err) {
      console.error(
        `  [ERROR] Harvest fallito per #${c.taskSeqNum}: ${(err as Error).message}`
      );
    }
  }

  return { created, candidates };
}

// ─── Plenary Scanner ─────────────────────────────────────────────────

interface PlenaryProposal {
  file: string;
  date: string;
  proposals: string[];
}

function scanPlenaryMinutes(): PlenaryProposal[] {
  if (!fs.existsSync(PLENARY_DIR)) return [];

  const files = fs
    .readdirSync(PLENARY_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, 5); // Ultime 5 plenarie

  const results: PlenaryProposal[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(PLENARY_DIR, file), "utf-8");

    // Estrai proposte dalla tabella task proposti
    const proposals: string[] = [];
    const lines = content.split("\n");
    let inTable = false;

    for (const line of lines) {
      if (line.includes("Task proposti") || line.includes("task proposti")) {
        inTable = true;
        continue;
      }
      if (inTable && line.startsWith("|") && !line.includes("---") && !line.includes("Dipartimento")) {
        const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
        if (cols.length >= 3) {
          proposals.push(`[${cols[1]}] ${cols[2]} (${cols[3] ?? "medium"})`);
        }
      }
      if (inTable && line.trim() === "") {
        inTable = false;
      }
    }

    if (proposals.length > 0) {
      // Estrai data dal filename (formato: YYYY-MM-DD-HH-MM-piano-N.md)
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      results.push({
        file,
        date: dateMatch?.[1] ?? "unknown",
        proposals,
      });
    }
  }

  return results;
}

// ─── Inbox Builder ───────────────────────────────────────────────────

async function buildInbox(): Promise<InboxItem[]> {
  const items: InboxItem[] = [];
  const now = Date.now();
  const statuses = readAllDeptStatuses();
  const board = await getTaskBoard();

  // 1. Dipartimenti in warning/critical
  for (const s of statuses) {
    if (s.health === "critical") {
      items.push({
        priority: 1,
        source: "dept-status",
        department: s.dept,
        title: `CRITICAL: ${s.dept}`,
        detail: s.summary,
        action: `Intervento immediato su ${s.dept}`,
      });
    }
    if (s.health === "warning") {
      items.push({
        priority: 2,
        source: "dept-status",
        department: s.dept,
        title: `WARNING: ${s.dept}`,
        detail: s.summary,
        action: `Verifica stato ${s.dept} e crea task correttivi`,
      });
    }
  }

  // 2. Blockers attivi
  for (const s of statuses) {
    for (const b of s.blockers) {
      const desc = typeof b === "string" ? b : (b.description ?? JSON.stringify(b));
      items.push({
        priority: 2,
        source: "dept-blocker",
        department: s.dept,
        title: `Blocker in ${s.dept}`,
        detail: desc,
        action: `Rimuovi blocker: ${desc}`,
      });
    }
  }

  // 3. Gap con severita high
  for (const s of statuses) {
    for (const g of s.gaps) {
      if (g.severity === "high" || g.severity === "critical") {
        items.push({
          priority: 3,
          source: "dept-gap",
          department: s.dept,
          title: `Gap ${g.id}: ${s.dept}`,
          detail: g.description,
          action: `Crea task per chiudere gap ${g.id}`,
        });
      }
    }
  }

  // 4. Task in review (aspettano approvazione) — con escalation temporale
  const REVIEW_ESCALATION_MS = 24 * 60 * 60 * 1000; // 24 ore
  if (board.reviewPending && board.reviewPending.length > 0) {
    for (const t of board.reviewPending) {
      const createdAt = new Date(t.createdAt).getTime();
      const ageMs = now - createdAt;
      const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
      const isEscalated = ageMs > REVIEW_ESCALATION_MS;

      items.push({
        priority: isEscalated ? 2 : 3, // Escalation: P2 se >24h
        source: isEscalated ? "review-escalation" : "task-review",
        department: t.department,
        title: isEscalated
          ? `ESCALATION Review >24h: #${t.seqNum ?? t.id.slice(0, 8)} (${ageHours}h)`
          : `Review pendente: #${t.seqNum ?? t.id.slice(0, 8)}`,
        detail: t.title,
        action: `Approva o rigetta: npx tsx scripts/company-tasks.ts update ${t.id.slice(0, 8)} --status open`,
      });
    }
  }

  // 5. Task blocked
  const blockedTasks = await getOpenTasks({ status: "blocked" });
  for (const t of blockedTasks) {
    items.push({
      priority: 2,
      source: "task-blocked",
      department: t.department,
      title: `Task bloccato: #${t.seqNum ?? t.id.slice(0, 8)}`,
      detail: `${t.title} — ${t.resultSummary ?? "nessun dettaglio"}`,
      action: `Sblocca o chiudi: verifica blockedBy e risolvi`,
    });
  }

  // 6. Status.json stale (>3 giorni senza aggiornamento)
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  for (const s of statuses) {
    if (s.lastUpdated === "mai" || s.lastUpdated === "unknown" || s.lastUpdated === "error") continue;
    const lastUpdate = new Date(s.lastUpdated).getTime();
    if (now - lastUpdate > THREE_DAYS) {
      const daysAgo = Math.floor((now - lastUpdate) / (24 * 60 * 60 * 1000));
      items.push({
        priority: 4,
        source: "stale-status",
        department: s.dept,
        title: `Status stale: ${s.dept} (${daysAgo}gg fa)`,
        detail: `Ultimo aggiornamento: ${s.lastUpdated}`,
        action: `Aggiorna: npx tsx scripts/update-dept-status.ts ${s.dept} --set health=... --summary "..."`,
      });
    }
  }

  // 7. Board idle (< 5 task attivi)
  const activeCount =
    (board.byStatus.open ?? 0) + (board.byStatus.in_progress ?? 0);
  if (activeCount < 5) {
    items.push({
      priority: 3,
      source: "board-idle",
      department: "cme",
      title: `Board quasi vuoto: ${activeCount} task attivi`,
      detail: `Soglia: 5. Serve pianificazione nuovi task.`,
      action: `Genera nuovi task: consultare strategy + plenarie pendenti`,
    });
  }

  // Sort by priority
  items.sort((a, b) => a.priority - b.priority);

  return items;
}

// ─── Output Formatters ───────────────────────────────────────────────

function printInbox(items: InboxItem[]): void {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║              CME INBOX                               ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  if (items.length === 0) {
    console.log("  Inbox vuoto. Nessuna azione richiesta.\n");
    return;
  }

  const priorityLabel: Record<number, string> = {
    1: "P1-CRITICAL",
    2: "P2-HIGH    ",
    3: "P3-MEDIUM  ",
    4: "P4-LOW     ",
  };

  let lastPriority = 0;
  for (const item of items) {
    if (item.priority !== lastPriority) {
      if (lastPriority > 0) console.log("");
      lastPriority = item.priority;
    }

    const label = priorityLabel[item.priority] ?? `P${item.priority}`;
    console.log(`  [${label}] ${item.title}`);
    console.log(`    Source: ${item.source} | Dept: ${item.department}`);
    console.log(`    Detail: ${item.detail}`);
    console.log(`    Action: ${item.action}`);
  }

  console.log(`\n  Totale: ${items.length} item nell'inbox\n`);
}

function printDeptStatuses(statuses: DeptStatus[]): void {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║        PANORAMICA DIPARTIMENTI                       ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const healthIcon: Record<string, string> = {
    ok: "OK",
    warning: "WARN",
    critical: "CRIT",
    unknown: "????",
    error: "ERR!",
  };

  for (const s of statuses) {
    const icon = healthIcon[s.health] ?? "????";
    const gapCount = s.gaps.length;
    const blockerCount = s.blockers.length;

    console.log(
      `  [${icon}] ${s.dept.padEnd(20)} | ${s.summary.slice(0, 80)}`
    );
    if (gapCount > 0 || blockerCount > 0) {
      console.log(
        `       gaps: ${gapCount} | blockers: ${blockerCount} | updated: ${s.lastUpdated.slice(0, 10)}`
      );
    }
  }

  const critical = statuses.filter((s) => s.health === "critical").length;
  const warning = statuses.filter((s) => s.health === "warning").length;
  const ok = statuses.filter((s) => s.health === "ok").length;
  const unknown = statuses.filter(
    (s) => s.health === "unknown" || s.health === "error"
  ).length;

  console.log(
    `\n  Riepilogo: ${ok} ok | ${warning} warning | ${critical} critical | ${unknown} senza status\n`
  );
}

// ─── Telegram Notifications ──────────────────────────────────────────

async function notifyEscalations(items: InboxItem[]): Promise<number> {
  if (!isTelegramConfigured()) {
    console.log("  [TELEGRAM] Non configurato — skip notifiche");
    return 0;
  }

  const escalations = items.filter(
    (i) => i.source === "review-escalation" || (i.priority <= 1)
  );

  if (escalations.length === 0) return 0;

  const lines = [
    `<b>CME INBOX — ${escalations.length} escalation</b>`,
    "",
  ];

  for (const e of escalations) {
    const icon = e.priority === 1 ? "🔴" : "🟠";
    lines.push(`${icon} <b>${e.title}</b>`);
    lines.push(`   ${e.detail.slice(0, 100)}`);
    lines.push("");
  }

  lines.push(`Totale inbox: ${items.length} item`);

  try {
    await sendMessage(lines.join("\n"));
    console.log(`  [TELEGRAM] Inviata notifica: ${escalations.length} escalation`);
    return escalations.length;
  } catch (err) {
    console.error(`  [TELEGRAM] Errore invio: ${(err as Error).message}`);
    return 0;
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const doHarvest = args.includes("--harvest");
  const dryRun = args.includes("--dry-run");
  const showStatus = args.includes("--status");
  const doNotify = args.includes("--notify");
  const showHelp = args.includes("--help") || args.includes("-h");

  if (showHelp) {
    console.log(`
CME Inbox — Il motore di auto-alimentazione

Usage:
  npx tsx scripts/cme-inbox.ts                    Mostra inbox prioritizzato
  npx tsx scripts/cme-inbox.ts --harvest          Crea follow-up task da suggestedNext
  npx tsx scripts/cme-inbox.ts --harvest --dry-run  Mostra cosa creerebbe (senza farlo)
  npx tsx scripts/cme-inbox.ts --notify           Invia escalation via Telegram (P1 + review >24h)
  npx tsx scripts/cme-inbox.ts --status           Panoramica salute tutti i dipartimenti

L'inbox raccoglie:
  P1 - Dipartimenti CRITICAL
  P2 - Blockers attivi + task bloccati + warning dipartimenti
  P3 - Gap high severity + task in review + board idle
  P4 - Status stale (>3 giorni)

Harvest: converte suggestedNext dei task completati in nuovi task reali.
`);
    return;
  }

  // ── Status overview ──
  if (showStatus) {
    const statuses = readAllDeptStatuses();
    printDeptStatuses(statuses);
    return;
  }

  // ── Harvest suggestedNext ──
  if (doHarvest) {
    console.log("\n── HARVEST suggestedNext ──\n");
    const result = await harvestSuggestedNext(dryRun);

    if (result.candidates.length === 0) {
      console.log("  Nessun suggestedNext da harvesting.\n");
    } else {
      console.log(
        `\n  Candidati: ${result.candidates.length} | Creati: ${result.created}\n`
      );
    }
  }

  // ── Inbox ──
  console.log("  Costruisco inbox...\n");
  const items = await buildInbox();
  printInbox(items);

  // ── Telegram notify (escalation P1 + review >24h) ──
  if (doNotify) {
    await notifyEscalations(items);
  }

  // ── Plenary proposals ──
  const plenaries = scanPlenaryMinutes();
  if (plenaries.length > 0) {
    console.log("── PLENARIE con proposte non processate ──\n");
    for (const p of plenaries) {
      console.log(`  ${p.file} (${p.date}):`);
      for (const prop of p.proposals) {
        console.log(`    - ${prop}`);
      }
      console.log("");
    }
  }
}

main().catch((err) => {
  console.error("CME Inbox errore:", err);
  process.exit(1);
});
