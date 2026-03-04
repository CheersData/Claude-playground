/**
 * company-scheduler-daemon.ts — CME Scheduler con approvazione Telegram
 *
 * COMPORTAMENTO AUTONOMO:
 *   1. Board check ogni 2h
 *   2. Se open > 0       → triggerCMEExecution() → spawna claude -p per eseguire i task
 *   3. Se open=0 + ip=0  → onBoardEmpty() → plenaria virtuale + piano nuovo su Telegram
 *   4. Boss clicca ✅ Approva → task creati sul board
 *   5. Boss clicca ❌ Annulla → cooldown 30 min
 *   6. /esegui manuale   → trigger immediato esecuzione (utile in demo)
 *
 * SETUP RICHIESTO in .env.local:
 *   TELEGRAM_BOT_TOKEN=... (da @BotFather)
 *   TELEGRAM_CHAT_ID=...   (usa --setup per scoprirlo)
 *
 * USAGE:
 *   npx tsx scripts/company-scheduler-daemon.ts            # Avvia daemon
 *   npx tsx scripts/company-scheduler-daemon.ts --setup    # Mostra chat ID
 *   npx tsx scripts/company-scheduler-daemon.ts --test        # Invia messaggio test
 *   npx tsx scripts/company-scheduler-daemon.ts --check-once  # Esecuzione singola (per PowerShell/cron)
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { savePlan, updatePlanStatus, getVision } from "./lib/company-vision";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ─── Config ───────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const STATE_FILE = path.resolve(__dirname, "../company/scheduler-daemon-state.json");
const LATEST_PLAN_FILE = path.resolve(__dirname, "../company/latest-scheduler-plan.md");
const BOARD_POLL_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 ore (come il piano)
const PLAN_INTERVAL_MS = 2 * 60 * 60 * 1000;  // Piano ogni 2 ore
const OPEN_TASK_REMINDER_MS = 5 * 60 * 1000;  // Reminder task open ogni 5 min
const TELEGRAM_POLL_TIMEOUT_S = 30;            // long polling timeout
const CANCEL_COOLDOWN_MS = 30 * 60 * 1000;    // 30 min cooldown dopo annulla

const ROOT = path.resolve(__dirname, "..");

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelegramChat {
  id: number;
}

interface TelegramMessage {
  chat: TelegramChat;
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessage;
}

interface TaskProposal {
  dept: string;
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  desc: string;
}

interface PendingPlan {
  planNumber: number;
  generatedAt: string;
  messageId: number | null;
  planText: string;
  tasks: TaskProposal[];
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface StartupInterview {
  date: string;  // YYYY-MM-DD
  status: "q1_sent" | "q2_sent" | "q3_sent" | "done";
  focus: string | null;
  urgenze: string | null;
  trading: string | null;
}

interface DaemonState {
  updateOffset: number;
  pendingPlan: PendingPlan | null;
  planCountToday: number;
  lastPlanDate: string;
  lastCancelledAt: string | null;
  lastApprovedAt: string | null;
  lastPlanGeneratedAt: string | null;
  chatHistory: ChatMsg[];
  startupInterview: StartupInterview | null;
  /** Se true: board idle, in attesa che CME (in sessione Claude Code) generi il piano */
  needsPlan?: boolean;
  /** Se true: daemon sta eseguendo task via claude -p (blocca ulteriori trigger) */
  isExecuting?: boolean;
  /** ISO timestamp di inizio ultima esecuzione (per timeout/stall detection) */
  lastExecutionStart?: string | null;
}

// ─── State persistence ────────────────────────────────────────────────────────

function loadState(): DaemonState {
  const defaults: DaemonState = {
    updateOffset: 0,
    pendingPlan: null,
    planCountToday: 0,
    lastPlanDate: "",
    lastCancelledAt: null,
    lastApprovedAt: null,
    lastPlanGeneratedAt: null,
    chatHistory: [],
    startupInterview: null,
    needsPlan: false,
  };
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      return { ...defaults, ...saved };
    }
  } catch {}
  return defaults;
}

function saveState(state: DaemonState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ─── Board ────────────────────────────────────────────────────────────────────

interface BoardStats {
  open: number;
  inProgress: number;
  done: number;
  total: number;
}

function getBoardStats(): BoardStats {
  try {
    const raw = execSync("npx tsx scripts/company-tasks.ts board", {
      encoding: "utf-8",
      cwd: ROOT,
      timeout: 30_000,
    });
    const openMatch = raw.match(/Open:\s*(\d+)/i);
    const inProgressMatch = raw.match(/In Progress:\s*(\d+)/i);
    const doneMatch = raw.match(/Done:\s*(\d+)/i);
    const totalMatch = raw.match(/Totale:\s*(\d+)/i);
    return {
      open: parseInt(openMatch?.[1] ?? "0"),
      inProgress: parseInt(inProgressMatch?.[1] ?? "0"),
      done: parseInt(doneMatch?.[1] ?? "0"),
      total: parseInt(totalMatch?.[1] ?? "0"),
    };
  } catch (e) {
    log(`Board read error: ${(e as Error).message}`);
    return { open: 0, inProgress: 0, done: 0, total: 0 };
  }
}

// ─── Trading status ───────────────────────────────────────────────────────────

async function getTradingStatus(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return "Supabase non configurato — stato trading non disponibile.";
  }
  try {
    // Raw HTTP calls to Supabase REST API (no import needed)
    const headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    };

    const [posRes, snapRes, sigRes, cfgRes, riskRes] = await Promise.allSettled([
      fetch(`${SUPABASE_URL}/rest/v1/portfolio_positions?select=symbol,qty,market_value,unrealized_pl&limit=10`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/portfolio_snapshots?select=equity,daily_pl,total_pl,created_at&order=created_at.desc&limit=1`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/trading_signals?select=signal_type,data,created_at&order=created_at.desc&limit=5`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/trading_config?select=mode,enabled,kill_switch_active&limit=1`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/risk_events?select=event_type,description,created_at&order=created_at.desc&limit=3`, { headers }),
    ]);

    const positions = posRes.status === "fulfilled" && posRes.value.ok ? await posRes.value.json() : [];
    const snapshots = snapRes.status === "fulfilled" && snapRes.value.ok ? await snapRes.value.json() : [];
    const signals = sigRes.status === "fulfilled" && sigRes.value.ok ? await sigRes.value.json() : [];
    const configs = cfgRes.status === "fulfilled" && cfgRes.value.ok ? await cfgRes.value.json() : [];
    const riskEvents = riskRes.status === "fulfilled" && riskRes.value.ok ? await riskRes.value.json() : [];

    const cfg = configs[0];
    const snap = snapshots[0];

    const lines: string[] = [];
    lines.push(`Modalità: ${cfg?.mode?.toUpperCase() ?? "SCONOSCIUTA"}${cfg?.kill_switch_active ? " ⚠️ KILL SWITCH ATTIVO" : ""}`);
    lines.push(`Posizioni aperte: ${positions.length}`);

    if (positions.length > 0) {
      for (const p of positions) {
        const pl = p.unrealized_pl != null ? `PnL $${Number(p.unrealized_pl).toFixed(2)}` : "PnL n/a";
        lines.push(`  ${p.symbol}: ${p.qty} share | ${pl}`);
      }
    }

    if (snap) {
      lines.push(`Ultimo snapshot: equity=$${Number(snap.equity ?? 0).toFixed(2)} | daily_pl=$${Number(snap.daily_pl ?? 0).toFixed(2)} | total_pl=$${Number(snap.total_pl ?? 0).toFixed(2)}`);
    }

    if (signals.length > 0) {
      const sigSummary = signals.map((s: Record<string, unknown>) => {
        const d = (s.data ?? {}) as Record<string, unknown>;
        return `${s.signal_type}${d.symbol ? `(${d.symbol})` : ""}`;
      }).join(", ");
      lines.push(`Segnali recenti: ${sigSummary}`);
    }

    if (riskEvents.length > 0) {
      lines.push(`Eventi risk: ${riskEvents.map((r: Record<string, unknown>) => r.event_type).join(", ")}`);
    }

    return lines.join("\n");
  } catch (e) {
    return `Stato trading non disponibile: ${(e as Error).message}`;
  }
}

// ─── Plan types ───────────────────────────────────────────────────────────────
// La generazione piani avviene in sessione Claude Code (CME), non nel daemon.
// Il daemon riceve i piani via state file (pendingPlan con messageId=null) e li invia su Telegram.

interface GeneratedPlan {
  planText: string;
  tasks: TaskProposal[];
  recommendations?: string[];
}

// ─── Task creation ────────────────────────────────────────────────────────────

function createTasks(tasks: TaskProposal[]): number {
  let created = 0;
  for (const t of tasks) {
    const dept = t.dept.toLowerCase().replace(/\s+/g, "-");
    const priority = (t.priority || "medium").toLowerCase();
    // routing: i task del daemon sono sempre operativi di routine (L1 auto-approved)
    const routing = t.dept === "trading" ? "trading-operations:routine" : "company-operations:routine";
    try {
      execSync(
        `npx tsx scripts/company-tasks.ts create --title ${JSON.stringify(t.title)} --dept ${dept} --priority ${priority} --by cme --routing ${JSON.stringify(routing)} --desc ${JSON.stringify(t.desc)}`,
        { encoding: "utf-8", cwd: ROOT, timeout: 15_000 }
      );
      created++;
      log(`Task creato: [${dept}] ${t.title}`);
    } catch (e) {
      log(`WARN: task creation failed [${dept}] ${t.title}: ${(e as Error).message}`);
    }
  }
  return created;
}

// ─── Telegram API (fetch nativa Node 18+) ────────────────────────────────────

/** Escape caratteri speciali per Telegram Markdown v1 (_, *, `, [) */
function escapeMd(text: string): string {
  return text.replace(/([_*`\[])/g, "\\$1");
}

async function telegramRequest(method: string, body: object): Promise<Record<string, unknown>> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN non configurato");
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return (data.result as Record<string, unknown>) ?? {};
}

async function sendMessage(text: string, replyMarkup?: object): Promise<number | null> {
  try {
    const result = await telegramRequest("sendMessage", {
      chat_id: CHAT_ID,
      text: text.slice(0, 4096), // Telegram limit
      parse_mode: "Markdown",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return (result?.message_id as number) ?? null;
  } catch (e) {
    log(`sendMessage error: ${(e as Error).message}`);
    return null;
  }
}

async function editMessage(messageId: number, text: string): Promise<void> {
  try {
    await telegramRequest("editMessageText", {
      chat_id: CHAT_ID,
      message_id: messageId,
      text: text.slice(0, 4096),
      parse_mode: "Markdown",
    });
  } catch {} // ignora se già modificato
}

async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
  try {
    await telegramRequest("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    });
  } catch {}
}

async function getUpdates(offset: number): Promise<TelegramUpdate[]> {
  if (!BOT_TOKEN) return [];
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=${TELEGRAM_POLL_TIMEOUT_S}&offset=${offset}`;
    const res = await fetch(url);
    const data = await res.json() as Record<string, unknown>;
    return (data.result as TelegramUpdate[]) ?? [];
  } catch {
    return [];
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

// ─── Startup Interview ────────────────────────────────────────────────────────

const INTERVIEW_QUESTIONS = [
  "*1/3 — FOCUS* 🎯\nSu cosa vuoi concentrarti oggi? (es. sviluppo, test, trading, strategia, altro)",
  "*2/3 — URGENZE* ⚡\nCi sono urgenze o blocchi da gestire prima di tutto il resto?",
  "*3/3 — TRADING* 📈\nDirettive per l'ufficio trading oggi? (es. avvia backtest, monitora solo, aspetta, nessuna)",
];

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isInterviewDoneToday(state: DaemonState): boolean {
  return (
    state.startupInterview?.status === "done" &&
    state.startupInterview?.date === todayDateStr()
  );
}

async function startInterview(state: DaemonState): Promise<DaemonState> {
  const today = todayDateStr();
  await sendMessage(
    `👋 *Buongiorno boss!*\n\nPrima di iniziare, 3 domande rapide per calibrare il piano di oggi.\n\n${INTERVIEW_QUESTIONS[0]}`
  );
  state.startupInterview = {
    date: today,
    status: "q1_sent",
    focus: null,
    urgenze: null,
    trading: null,
  };
  saveState(state);
  log("Intervista avvio inviata — in attesa risposta Q1");
  return state;
}

async function handleInterviewAnswer(
  answer: string,
  state: DaemonState
): Promise<DaemonState> {
  const iv = state.startupInterview!;

  if (iv.status === "q1_sent") {
    iv.focus = answer;
    iv.status = "q2_sent";
    await sendMessage(INTERVIEW_QUESTIONS[1]);
    log(`Intervista Q1 ricevuta: "${answer.slice(0, 60)}"`);
  } else if (iv.status === "q2_sent") {
    iv.urgenze = answer;
    iv.status = "q3_sent";
    await sendMessage(INTERVIEW_QUESTIONS[2]);
    log(`Intervista Q2 ricevuta: "${answer.slice(0, 60)}"`);
  } else if (iv.status === "q3_sent") {
    iv.trading = answer;
    iv.status = "done";
    log(`Intervista Q3 ricevuta: "${answer.slice(0, 60)}"`);
    await sendMessage(
      `✅ *Contesto acquisito — grazie boss!*\n\n` +
        `🎯 Focus: ${iv.focus}\n` +
        `⚡ Urgenze: ${iv.urgenze}\n` +
        `📈 Trading: ${iv.trading}\n\n` +
        `_Il piano di oggi terrà conto di queste indicazioni. Monitoraggio board attivo._`
    );
    log("Intervista avvio completata — contesto iniettato nel generatore piani");
  }

  saveState(state);
  return state;
}

// ─── Plan message formatting ──────────────────────────────────────────────────

function formatPlanMessage(plan: GeneratedPlan, planNumber: number): string {
  const header = `🤖 *CME — Piano #${planNumber}*\n📅 ${new Date().toLocaleString("it-IT")}\n\n`;
  const footer = `\n\n📋 _Task proposti: ${plan.tasks.length}_`;
  const maxBody = 4096 - header.length - footer.length - 100;
  const body = plan.planText.length > maxBody
    ? plan.planText.slice(0, maxBody) + "\n_[...troncato]_"
    : plan.planText;
  return header + body + footer;
}

function buildApprovalKeyboard(planNumber: number): object {
  return {
    inline_keyboard: [[
      { text: "✅ Approva", callback_data: `approve_${planNumber}` },
      { text: "✏️ Modifica", callback_data: `modify_${planNumber}` },
      { text: "❌ Annulla", callback_data: `cancel_${planNumber}` },
    ]],
  };
}

// ─── Board watcher ────────────────────────────────────────────────────────────

const COMPANY_DIR = path.resolve(__dirname, "../company");
const PLENARY_DIR = path.resolve(COMPANY_DIR, "plenary-minutes");

interface DeptStatus {
  dept: string;
  health: string;
  summary: string;
  gaps?: Array<{ id: string; description: string; severity: string }>;
  open_tasks?: unknown[];
  blockers?: unknown[];
  [key: string]: unknown;
}

/**
 * Legge tutti i status.json disponibili nei dipartimenti.
 * Restituisce solo quelli trovati (dipartimenti senza file vengono saltati).
 */
function readAllDeptStatuses(): DeptStatus[] {
  const depts = [
    "trading", "quality-assurance", "data-engineering", "architecture",
    "security", "finance", "operations", "strategy", "marketing",
    "protocols", "ux-ui", "ufficio-legale", "acceleration",
  ];
  const statuses: DeptStatus[] = [];
  for (const dept of depts) {
    const filePath = path.join(COMPANY_DIR, dept, "status.json");
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      statuses.push({ dept, ...raw } as DeptStatus);
    } catch {
      log(`WARN: impossibile leggere status.json per ${dept}`);
    }
  }
  return statuses;
}

function healthEmoji(health: string): string {
  switch (health) {
    case "ok": return "🟢";
    case "warning": return "🟡";
    case "critical": return "🔴";
    default: return "⚪";
  }
}

/**
 * Genera il verbale della riunione plenaria virtuale.
 *
 * Legge tutti i status.json, produce un markdown in company/plenary-minutes/
 * e restituisce i task proposti sulla base dello stato reale dei dipartimenti.
 */
function generatePlenaryMinutes(
  state: DaemonState,
  planNumber: number
): { filePath: string; summary: string; tasksFromStatus: TaskProposal[] } {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16).replace(":", "-");
  const fileName = `${dateStr}-${timeStr}-piano-${planNumber}.md`;

  if (!fs.existsSync(PLENARY_DIR)) {
    fs.mkdirSync(PLENARY_DIR, { recursive: true });
  }
  const filePath = path.join(PLENARY_DIR, fileName);

  const statuses = readAllDeptStatuses();
  const tasksFromStatus: TaskProposal[] = [];

  // ── Analisi per dipartimento ────────────────────────────────────────────────

  for (const s of statuses) {
    const health = s.health ?? "unknown";
    const criticalGaps = (s.gaps ?? []).filter((g) => g.severity === "critical");
    const blockers = s.blockers ?? [];

    if (health === "critical" || blockers.length > 0) {
      tasksFromStatus.push({
        dept: s.dept,
        title: `🔴 [${s.dept}] Issue critica — intervento immediato`,
        priority: "critical",
        desc: `Health: ${health}. ${blockers.length > 0 ? `Blockers: ${(blockers as string[]).join(", ")}. ` : ""}Summary: ${s.summary}`,
      });
    } else if (health === "warning") {
      const gapNote = criticalGaps.length > 0
        ? ` Gap critici: ${criticalGaps.map((g) => `[${g.id}] ${g.description}`).join("; ")}.`
        : "";
      tasksFromStatus.push({
        dept: s.dept,
        title: `[${s.dept}] Review — health warning`,
        priority: "high",
        desc: `Health warning rilevato.${gapNote} Summary: ${s.summary}`,
      });
    }

    // Trading-specific: kill switch
    const runtime = s["runtime"] as Record<string, unknown> | undefined;
    if (s.dept === "trading" && runtime?.["kill_switch_active"] === true) {
      tasksFromStatus.push({
        dept: "trading",
        title: "🔴 KILL SWITCH attivo — analisi post-mortem",
        priority: "critical",
        desc: "Il kill switch trading è attivo. Analizzare causa, verificare P&L, decidere se disabilitare manualmente. Runbook: risk-management.md",
      });
    }
  }

  // ── Generazione markdown verbale ────────────────────────────────────────────

  const focus = state.startupInterview?.focus ?? "generico";
  const urgenze = state.startupInterview?.urgenze ?? "nessuna";

  let md = `# Riunione Plenaria — ${dateStr} ${now.toISOString().slice(11, 16)} UTC\n\n`;
  md += `**Piano #${planNumber}** | Focus: *${focus}* | Urgenze: *${urgenze}*\n\n`;

  md += `## Presenti (dipartimenti con status.json)\n\n`;
  if (statuses.length === 0) {
    md += `_Nessun dipartimento ha ancora uno status.json._\n\n`;
  } else {
    md += `| Dipartimento | Health | Stato |\n`;
    md += `|---|---|---|\n`;
    for (const s of statuses) {
      const emoji = healthEmoji(s.health ?? "unknown");
      const summary = (s.summary ?? "").slice(0, 80);
      md += `| ${s.dept} | ${emoji} ${s.health ?? "?"} | ${summary} |\n`;
    }
    md += `\n`;
  }

  if (tasksFromStatus.length > 0) {
    md += `## Issue rilevate dai dipartimenti\n\n`;
    for (const s of statuses) {
      const dept = s.dept;
      const deptTasks = tasksFromStatus.filter((t) => t.dept === dept);
      if (deptTasks.length === 0) continue;
      md += `### ${dept}\n\n`;
      md += `- Health: ${healthEmoji(s.health ?? "unknown")} ${s.health ?? "unknown"}\n`;
      const gaps = (s.gaps ?? []).filter((g) => g.severity === "critical");
      if (gaps.length > 0) {
        md += `- Gap critici: ${gaps.map((g) => `[${g.id}]`).join(", ")}\n`;
      }
      const blockers = s.blockers ?? [];
      if (blockers.length > 0) md += `- Blockers: ${blockers.length}\n`;
      md += `\n`;
    }
  } else {
    md += `## Stato generale\n\nTutti i dipartimenti con status.json sono in stato OK. Nessuna issue critica.\n\n`;
  }

  md += `## Task proposti dalla plenaria\n\n`;
  if (tasksFromStatus.length === 0) {
    md += `_Nessun task derivato da health/gap. Il piano si basa sull'intervista di avvio._\n\n`;
  } else {
    for (let i = 0; i < tasksFromStatus.length; i++) {
      const t = tasksFromStatus[i];
      md += `${i + 1}. **[${t.dept}]** *(${t.priority})* ${t.title}\n`;
      md += `   > ${t.desc}\n\n`;
    }
  }

  md += `---\n_Verbale generato automaticamente dal daemon — Piano #${planNumber}_\n`;

  fs.writeFileSync(filePath, md, "utf-8");
  log(`Verbale plenaria salvato: ${path.relative(ROOT, filePath)}`);

  const summary = statuses.length > 0
    ? `${statuses.length} dept in riunione — ${tasksFromStatus.length} issue rilevate`
    : "Nessun status.json trovato — piano da intervista";

  return { filePath, summary, tasksFromStatus };
}

/**
 * Genera automaticamente un set di task per il board.
 *
 * Strategia:
 * 1. Riunione plenaria: legge status.json di tutti i dipartimenti → task da issue reali
 * 2. Intervista di avvio: aggiunge task basati su focus area (trading / legal / default)
 * 3. Deduplica per dipartimento (max 1 task/dept da plenaria, max 1 da intervista)
 */
function buildAutoTasks(state: DaemonState, planNumber: number): TaskProposal[] {
  // 1. Riunione plenaria virtuale
  const plenary = generatePlenaryMinutes(state, planNumber);
  const tasks: TaskProposal[] = [...plenary.tasksFromStatus];
  const deptsCovered = new Set(tasks.map((t) => t.dept));

  // 2. Task da intervista (solo per dipartimenti non già coperti dalla plenaria)
  const focus = state.startupInterview?.focus?.toLowerCase() ?? "";
  const trading = state.startupInterview?.trading ?? "";

  if ((focus.includes("trading") || trading) && !deptsCovered.has("trading")) {
    tasks.push({
      dept: "trading",
      title: `Trading review ciclo #${planNumber} — P&L e segnali`,
      priority: "high",
      desc: `Review automatico del ciclo di trading: controlla P&L paper account, segnali slope generati, stato trailing stop. Contesto intervista: "${trading || "nessuno"}". Runbook: trading-pipeline.md`,
    });
    deptsCovered.add("trading");
  }
  if ((focus.includes("trading") || trading) && !deptsCovered.has("operations")) {
    tasks.push({
      dept: "operations",
      title: `Dashboard /ops — verifica metriche trading ciclo #${planNumber}`,
      priority: "medium",
      desc: "Verifica che la dashboard /ops mostri correttamente: segnali slope, P&L, stato posizioni. Se ci sono anomalie, aprire subtask. Controllare API /api/trading/signals.",
    });
  } else if ((focus.includes("legal") || focus.includes("legale")) && !deptsCovered.has("ufficio-legale")) {
    tasks.push({
      dept: "ufficio-legale",
      title: `Review pipeline analisi legale — ciclo #${planNumber}`,
      priority: "high",
      desc: "Review automatico: controlla gli ultimi errori nella pipeline di analisi, qualità output agenti, copertura corpus. Runbook: ufficio-legale/runbooks/.",
    });
  } else if (!focus.includes("trading") && !trading && !focus.includes("legal") && !focus.includes("legale")) {
    // Default generico: solo se i dept non sono già coperti dalla plenaria
    if (!deptsCovered.has("architecture")) {
      tasks.push({
        dept: "architecture",
        title: `Architecture review — ciclo #${planNumber}`,
        priority: "medium",
        desc: "Review automatico: tech debt aperto, dipendenze da aggiornare, ADR da completare. Vedi CLAUDE.md sezione 19.",
      });
    }
    if (!deptsCovered.has("quality-assurance")) {
      tasks.push({
        dept: "quality-assurance",
        title: `QA review — gap di copertura test ciclo #${planNumber}`,
        priority: "medium",
        desc: "Identifica gap di copertura test. Priorità: agent-runner (P1), tiers.ts (P2), console-token (P3). Vedi CLAUDE.md sezione 17.",
      });
    }
  }

  return tasks;
}

async function onBoardEmpty(state: DaemonState): Promise<DaemonState> {
  // Controlla cooldown dopo annulla
  if (state.lastCancelledAt) {
    const elapsed = Date.now() - new Date(state.lastCancelledAt).getTime();
    if (elapsed < CANCEL_COOLDOWN_MS) {
      const remaining = Math.ceil((CANCEL_COOLDOWN_MS - elapsed) / 60_000);
      log(`Cooldown attivo dopo annulla — ancora ${remaining} min`);
      return state;
    }
  }

  // Non generare se c'è già un piano CME in attesa di approvazione
  if (state.pendingPlan) {
    log("Piano CME in attesa di approvazione — skip auto-tasks");
    return state;
  }

  // Reset contatore se giorno nuovo
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastPlanDate !== today) {
    state.planCountToday = 0;
    state.lastPlanDate = today;
  }
  state.planCountToday++;

  const planNum = state.planCountToday;
  log(`Board vuoto — riunione plenaria + Piano #${planNum} (focus: ${state.startupInterview?.focus ?? "generico"})`);

  // Genera task (include riunione plenaria virtuale + verbale markdown)
  const tasks = buildAutoTasks(state, planNum);
  const created = createTasks(tasks);

  state.needsPlan = false;
  state.lastPlanGeneratedAt = new Date().toISOString();
  state.lastApprovedAt = new Date().toISOString();
  saveState(state);

  const taskList = tasks.map((t) => `• [${t.dept}] ${t.title}`).join("\n");
  log(`Piano #${planNum}: ${created}/${tasks.length} task creati`);
  const statusCount = readAllDeptStatuses().length;
  await sendMessage(
    `✅ *Piano #${planNum} — ${created} task creati automaticamente*\n\n` +
    `Focus: *${state.startupInterview?.focus ?? "generico"}* | Plenaria: ${statusCount} dept\n\n` +
    `${taskList}\n\n` +
    `_Verbale in company/plenary-minutes/. CME al lavoro._`
  );

  return state;
}

/**
 * Esecuzione autonoma dei task aperti via claude -p.
 *
 * Quando ci sono task open, spawna `claude -p` con un prompt CME che:
 * 1. Legge department.md + runbook di ogni dipartimento coinvolto
 * 2. Clama e esegue ogni task in ordine di priorità (critical→high→medium→low)
 * 3. Marca done con summary
 *
 * Blocca il daemon per tutta la durata dell'esecuzione (max 25 min).
 * In ambiente demo, claude -p fallisce con ENOENT o credit balance — gestito in catch.
 */
async function triggerCMEExecution(state: DaemonState): Promise<DaemonState> {
  // Stall detection: se isExecuting=true da più di 30 min → considera finito
  if (state.isExecuting && state.lastExecutionStart) {
    const elapsed = Date.now() - new Date(state.lastExecutionStart).getTime();
    if (elapsed < 30 * 60 * 1000) {
      log(`CME già in esecuzione da ${Math.floor(elapsed / 60_000)} min — skip`);
      return state;
    }
    log(`WARN: stall rilevato (${Math.floor(elapsed / 60_000)} min) — reset isExecuting`);
  }

  // Recupera lista task open con dettagli
  let listRaw = "";
  try {
    listRaw = execSync("npx tsx scripts/company-tasks.ts list --status open", {
      encoding: "utf-8", cwd: ROOT, timeout: 30_000,
    });
  } catch {
    log("WARN: impossibile leggere lista task open");
    return state;
  }

  // Parse: righe [open] PRIORITY | Title [id] + riga seguente dept
  const lines = listRaw.split("\n");
  const tasks: Array<{ id: string; title: string; dept: string; priority: string; desc: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\[open\]\s+(\w+)\s+\|\s+(.+?)\s+\[([0-9a-f]{8})\]/i);
    if (m) {
      const priority = m[1], title = m[2].trim(), id = m[3];
      const deptMatch = (lines[i + 1] ?? "").match(/dept:\s+(\S+)/);
      const descMatch = (lines[i + 2] ?? "").match(/desc:\s+(.+)/);
      tasks.push({
        id, title, priority,
        dept: deptMatch?.[1] ?? "cme",
        desc: descMatch?.[1]?.trim() ?? title,
      });
    }
  }

  if (tasks.length === 0) {
    log("triggerCMEExecution: nessun task open trovato — skip");
    return state;
  }

  // Marca executing
  state.isExecuting = true;
  state.lastExecutionStart = new Date().toISOString();
  saveState(state);

  const taskLines = tasks.map(t => `• [${t.dept}] ${t.priority.toUpperCase()} — ${t.title}`).join("\n");
  await sendMessage(
    `🚀 *CME in esecuzione — ${tasks.length} task open*\n\n` +
    `${taskLines}\n\n` +
    `_Esecuzione autonoma via claude -p. Durata stimata: 10-20 min._`
  );

  const taskDetail = tasks
    .map(t => `- [${t.id}] **${t.title}** (dept: ${t.dept}, priority: ${t.priority})\n  Descrizione: ${t.desc}`)
    .join("\n");

  const prompt =
    `Sei CME (CEO virtuale) di controlla.me. Il company scheduler ti ha incaricato di eseguire autonomamente i task aperti sul board.\n\n` +
    `TASK APERTI (${tasks.length}):\n${taskDetail}\n\n` +
    `ISTRUZIONI:\n` +
    `Per ogni task, in ordine critical→high→medium→low:\n` +
    `1. Leggi company/<dept>/department.md per capire il dipartimento\n` +
    `2. Leggi il runbook pertinente in company/<dept>/runbooks/\n` +
    `3. Claim: npx tsx scripts/company-tasks.ts claim <id> --agent <dept>-lead\n` +
    `4. Esegui il lavoro del task (analisi, report, proposta tecnica, ecc.)\n` +
    `5. Done: npx tsx scripts/company-tasks.ts done <id> --summary "cosa hai fatto + risultati"\n\n` +
    `Esegui TUTTI i task autonomamente. Non chiedere conferme. Non saltare task.\n` +
    `Working directory: ${ROOT}`;

  try {
    log(`Spawn claude -p — ${tasks.length} task da eseguire...`);
    const output = execSync(`claude -p ${JSON.stringify(prompt)}`, {
      encoding: "utf-8",
      cwd: ROOT,
      timeout: 25 * 60 * 1000, // 25 min max
    });
    log(`Esecuzione completata: ${output.length} chars output`);

    const finalStats = getBoardStats();
    await sendMessage(
      `✅ *CME ha completato l'esecuzione*\n\n` +
      `Board: open=${finalStats.open}, in_progress=${finalStats.inProgress}, done=${finalStats.done}\n\n` +
      `_Task rimasti open (se > 0) verranno ritentati al prossimo ciclo._`
    );
  } catch (e) {
    const err = (e as Error).message ?? String(e);
    const isDemoError = err.includes("ENOENT") || err.includes("Credit balance") || err.includes("exit code 1");
    log(`WARN: claude -p execution: ${err.slice(0, 200)}`);
    if (isDemoError) {
      await sendMessage(
        `⚠️ *Esecuzione automatica non disponibile*\n\n` +
        `Ambiente demo: \`claude\` non nel PATH o crediti insufficienti.\n\n` +
        `*Task da eseguire manualmente:*\n${taskLines}\n\n` +
        `_Apri Claude Code e esegui: i task sono sul board._`
      );
    } else {
      await sendMessage(`⚠️ *Errore esecuzione CME*\n\n\`${err.slice(0, 300)}\``);
    }
  }

  state.isExecuting = false;
  state.lastExecutionStart = null;
  saveState(state);
  return state;
}

/**
 * Invia su Telegram un pendingPlan scritto da CME in sessione (messageId === null).
 * Chiamato dal state-file watcher quando rileva un nuovo piano iniettato esternamente.
 */
async function sendCMEInjectedPlan(state: DaemonState): Promise<DaemonState> {
  if (!state.pendingPlan || state.pendingPlan.messageId !== null) return state;

  const plan: GeneratedPlan = {
    planText: state.pendingPlan.planText,
    tasks: state.pendingPlan.tasks,
  };
  const text = formatPlanMessage(plan, state.pendingPlan.planNumber);
  const keyboard = buildApprovalKeyboard(state.pendingPlan.planNumber);

  const messageId = await sendMessage(text, keyboard);
  log(`Piano CME #${state.pendingPlan.planNumber} inviato su Telegram (messageId: ${messageId})`);

  state.pendingPlan.messageId = messageId;
  state.needsPlan = false;
  saveState(state);

  // Scrivi file locale leggibile
  try {
    const ts = new Date().toLocaleString("it-IT");
    const taskLines = state.pendingPlan.tasks
      .map(t => `- [${t.dept}] **${t.priority.toUpperCase()}** — ${t.title}`)
      .join("\n");
    const md = [
      `# Piano #${state.pendingPlan.planNumber} — ${ts}`,
      `> Status: in attesa di approvazione su Telegram`,
      "",
      state.pendingPlan.planText,
      "",
      `## Task proposti (${state.pendingPlan.tasks.length})`,
      taskLines,
    ].join("\n");
    fs.writeFileSync(LATEST_PLAN_FILE, md, "utf-8");
  } catch {}

  return state;
}

// ─── Telegram callback handler ────────────────────────────────────────────────

async function handleCallback(
  state: DaemonState,
  callbackQueryId: string,
  data: string
): Promise<DaemonState> {

  if (data.startsWith("approve_")) {
    const planNum = parseInt(data.replace("approve_", ""));
    if (!state.pendingPlan || state.pendingPlan.planNumber !== planNum) {
      await answerCallback(callbackQueryId, "Piano non più valido.");
      return state;
    }

    await answerCallback(callbackQueryId, "Approvato! Creo i task...");

    const created = createTasks(state.pendingPlan.tasks);
    state.lastApprovedAt = new Date().toISOString();

    // Save approved plan to Supabase audit trail (R7/R8)
    try {
      const vision = await getVision();
      const planId = await savePlan({
        plan_content: { planText: state.pendingPlan.planText, tasks: state.pendingPlan.tasks },
        vision_snapshot: vision?.vision ?? undefined,
        mission_snapshot: vision?.mission ?? undefined,
        recommendations: (state.pendingPlan as PendingPlan & { recommendations?: string[] }).recommendations ?? [],
        plan_number: planNum,
      });
      if (planId) {
        await updatePlanStatus(planId, "approved");
        log(`Piano salvato su Supabase: ${planId}`);
      }
    } catch (e) {
      log(`WARN: Failed to save plan to Supabase: ${(e as Error).message}`);
    }

    const confirmText = `✅ *Piano #${planNum} approvato*\n\n${created} task creati sul board.\nIl CME li eseguirà alla prossima sessione.`;
    if (state.pendingPlan.messageId) {
      await editMessage(state.pendingPlan.messageId, confirmText);
    } else {
      await sendMessage(confirmText);
    }

    log(`Piano #${planNum} approvato — ${created} task creati`);
    state.pendingPlan = null;

  } else if (data.startsWith("modify_")) {
    const planNum = parseInt(data.replace("modify_", ""));
    if (!state.pendingPlan || state.pendingPlan.planNumber !== planNum) {
      await answerCallback(callbackQueryId, "Piano non più valido.");
      return state;
    }

    await answerCallback(callbackQueryId, "Piano rifiutato — genero un piano alternativo...");
    const rejectText = `✏️ *Piano #${planNum} rifiutato*\n\nGenero piano alternativo automaticamente...`;
    if (state.pendingPlan.messageId) {
      await editMessage(state.pendingPlan.messageId, rejectText);
    } else {
      await sendMessage(rejectText);
    }
    state.pendingPlan = null;
    state.lastCancelledAt = null;
    state.needsPlan = false;

    log(`Piano #${planNum} rifiutato — genero piano alternativo automaticamente`);
    saveState(state);
    state = await onBoardEmpty(state);
    return state;

  } else if (data.startsWith("cancel_")) {
    const planNum = parseInt(data.replace("cancel_", ""));
    await answerCallback(callbackQueryId, "Piano annullato. Cooldown 30 min.");

    const cancelText = `❌ *Piano #${planNum} annullato*\n\nCooldown: il prossimo piano verrà generato tra 30 minuti.`;
    if (state.pendingPlan?.messageId) {
      await editMessage(state.pendingPlan.messageId, cancelText);
    } else {
      await sendMessage(cancelText);
    }

    log(`Piano #${planNum} annullato — cooldown 30 min`);
    state.pendingPlan = null;
    state.lastCancelledAt = new Date().toISOString();
  }

  saveState(state);
  return state;
}

// ─── CME Chat via Telegram ───────────────────────────────────────────────────

async function chatWithCME(userMessage: string, state: DaemonState): Promise<{ reply: string; state: DaemonState }> {
  // Chat CME non disponibile in ambiente demo (claude -p richiede crediti API).
  // Restituisce stato board + comandi disponibili come risposta contestuale.
  const stats = getBoardStats();
  const tradingStatus = await getTradingStatus();

  const reply =
    `*CME — risposta automatica* (modalità demo)\n\n` +
    `Hai scritto: _"${escapeMd(userMessage.slice(0, 100))}"_\n\n` +
    `*Board:* Open=${stats.open} | In Progress=${stats.inProgress} | Done=${stats.done}\n` +
    `*Pending plan:* ${state.pendingPlan ? `Piano #${state.pendingPlan.planNumber} in attesa` : "nessuno"}\n` +
    `*Eseguendo:* ${state.isExecuting ? "si (claude -p attivo)" : "no"}\n\n` +
    `*Trading:*\n${escapeMd(tradingStatus)}\n\n` +
    `_Chat CME attiva solo con crediti API. Usa i comandi: /status /piano /piano\\_default /esegui /help_`;

  log(`Chat CME (demo): "${userMessage.slice(0, 60)}" → risposta automatica`);
  return { reply, state };
}

// ─── Headless daemon (senza Telegram) ─────────────────────────────────────────

/**
 * Modalità headless: nessuna interazione Telegram.
 * Polling board ogni 2h. Se idle → crea task di pianificazione via checkIdleAndPlan().
 * Nessun approccio LLM — usa la logica di daily-controls.ts.
 */
async function runHeadlessDaemon(): Promise<void> {
  log("=== Headless daemon avviato — board check ogni 2h ===");
  const { checkIdleAndPlan } = await import("./daily-controls");
  const { saveStateOfCompany } = await import("./lib/state-of-company");

  let lastCheck = 0;

  while (true) {
    const now = Date.now();
    if (now - lastCheck >= BOARD_POLL_INTERVAL_MS) {
      lastCheck = now;
      const date = new Date().toISOString().slice(0, 10);
      const stats = getBoardStats();
      log(`Board check: open=${stats.open}, in_progress=${stats.inProgress}`);

      if (stats.open === 0 && stats.inProgress === 0) {
        log("Board idle — creo task di pianificazione...");
        try {
          const result = await checkIdleAndPlan(date);
          if (result.tasksCreated > 0) {
            log(`✅ ${result.tasksCreated} task di pianificazione creati`);
          } else {
            log("Task già presenti per oggi — skip");
          }
        } catch (e) {
          log(`WARN: checkIdleAndPlan: ${(e as Error).message}`);
        }
      }

      // State of Company giornaliero
      try {
        const socPath = await saveStateOfCompany(date);
        log(`📊 State of Company aggiornato: ${path.basename(socPath)}`);
      } catch (e) {
        log(`WARN: State of Company: ${(e as Error).message}`);
      }
    }

    await new Promise((r) => setTimeout(r, 60_000)); // check ogni minuto se è ora di girare
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function runDaemon(): Promise<void> {
  log("=== CME Company Scheduler Daemon avviato ===");
  log(`Board poll: ogni ${BOARD_POLL_INTERVAL_MS / 60_000} min`);
  log(`Piano periodico: ogni ${PLAN_INTERVAL_MS / 3_600_000}h`);
  log(`Telegram long-poll timeout: ${TELEGRAM_POLL_TIMEOUT_S}s`);

  if (!BOT_TOKEN || !CHAT_ID) {
    // Headless mode: senza Telegram, il daemon gira in modalità silenziosa
    // Fa solo board check e crea task via checkIdleAndPlan() quando idle
    log("⚠️  TELEGRAM non configurato — modalità headless attiva");
    log("   Il daemon monitorerà il board e creerà task di pianificazione automaticamente.");
    log("   Per Telegram: aggiungi TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID in .env.local");
    await runHeadlessDaemon();
    return;
  }

  let state = loadState();
  let lastBoardCheck = 0;
  let lastReminderMs = 0; // reminder task open ogni 5 min (in-memory, non persistito)

  // All'avvio: se intervista di oggi non completata, avvia il flow
  if (!isInterviewDoneToday(state)) {
    // Reset intervista se è di un altro giorno
    if (state.startupInterview && state.startupInterview.date !== todayDateStr()) {
      state.startupInterview = null;
      saveState(state);
    }
    // Avvia intervista (manda Q1 direttamente)
    state = await startInterview(state);
  } else {
    // Intervista già fatta oggi → messaggio di avvio standard
    await sendMessage("🟢 *CME Scheduler avviato*\nBoard check + piano automatico ogni 2h.\n\n💬 Scrivi qualsiasi messaggio per parlare con CME.\n📋 /status — stato board\n📝 /piano — genera piano ora\n🔄 /reset — resetta conversazione");
  }

  // Telegram + board loop combinato
  let lastStateMtime = fs.existsSync(STATE_FILE) ? fs.statSync(STATE_FILE).mtimeMs : 0;
  while (true) {
    // ── Telegram long-poll ──
    const updates = await getUpdates(state.updateOffset);

    for (const update of updates) {
      state.updateOffset = update.update_id + 1;

      // Callback da bottoni inline
      if (update.callback_query) {
        const cb = update.callback_query;
        // Solo il boss autorizzato (verifica chat ID)
        if (String(cb.message?.chat?.id) === String(CHAT_ID)) {
          state = await handleCallback(state, cb.id, cb.data ?? "");
        } else {
          await answerCallback(cb.id, "Non autorizzato.");
        }
      }

      // Messaggi di testo (comandi base)
      if (update.message?.text && String(update.message.chat.id) === String(CHAT_ID)) {
        const text = update.message.text.trim();
        if (text === "/status" || text === "/stato") {
          const stats = getBoardStats();
          const planInfo = state.pendingPlan
            ? `\nPiano #${state.pendingPlan.planNumber} in attesa di approvazione.`
            : "\nNessun piano in attesa.";
          await sendMessage(
            `📊 *Board Status*\nOpen: ${stats.open} | In Progress: ${stats.inProgress} | Done: ${stats.done}${planInfo}\n\nPiani oggi: ${state.planCountToday}`
          );
        } else if (text === "/cancella" || text === "/cancel") {
          if (state.pendingPlan) {
            state.pendingPlan = null;
            state.lastCancelledAt = new Date().toISOString();
            saveState(state);
            await sendMessage("❌ Piano corrente cancellato. Cooldown 30 min.");
          } else {
            await sendMessage("Nessun piano in attesa.");
          }
        } else if (text === "/reset") {
          state.chatHistory = [];
          saveState(state);
          await sendMessage("🔄 Conversazione resettata.");
        } else if (text === "/piano" || text === "/plan") {
          if (state.pendingPlan) {
            await sendMessage("⚠️ C'è già un piano in attesa di approvazione.");
          } else {
            await sendMessage("⏳ Genero piano su richiesta...");
            state = await onBoardEmpty(state);
          }
        } else if (text === "/intervista") {
          // Forza ri-avvio intervista (utile se si vuole aggiornare il contesto)
          state.startupInterview = null;
          saveState(state);
          state = await startInterview(state);
        } else if (text === "/piano_default" || text === "/pianodefault") {
          // Piano di emergenza senza AI — usa il fallback hardcoded
          if (state.pendingPlan) {
            await sendMessage("⚠️ C'è già un piano in attesa di approvazione.");
          } else {
            const today2 = new Date().toISOString().slice(0, 10);
            if (state.lastPlanDate !== today2) { state.planCountToday = 0; state.lastPlanDate = today2; }
            state.planCountToday++;
            const defaultPlan: GeneratedPlan = {
              planText: `*Piano di emergenza #${state.planCountToday}*\n\nBoard vuoto. Piano generato senza AI.\nPriorità: backlog QA + trading.`,
              tasks: [
                { dept: "quality-assurance", title: "Completa test coverage gap critici", priority: "high", desc: "agent-runner.ts e tiers.ts non coperti — P1/P2." },
                { dept: "trading", title: "Analisi performance scanner settimana", priority: "high", desc: "Verificare qualità segnali slope e metriche P&L." },
                { dept: "architecture", title: "Review tech debt e dipendenze", priority: "medium", desc: "Board vuoto — revisione backlog architetturale." },
              ],
            };
            const text2 = formatPlanMessage(defaultPlan, state.planCountToday);
            const keyboard2 = buildApprovalKeyboard(state.planCountToday);
            const msgId = await sendMessage(text2, keyboard2);
            state.pendingPlan = {
              planNumber: state.planCountToday,
              generatedAt: new Date().toISOString(),
              messageId: msgId,
              planText: defaultPlan.planText,
              tasks: defaultPlan.tasks,
            };
            state.needsPlan = false;
            state.lastPlanGeneratedAt = new Date().toISOString();
            saveState(state);
            log(`Piano default #${state.planCountToday} inviato`);
          }
        } else if (text === "/esegui" || text === "/parti") {
          // Trigger manuale esecuzione (utile in demo dove il board check automatico usa claude -p)
          const stats = getBoardStats();
          if (stats.open === 0) {
            await sendMessage("✅ Nessun task open — board già pulito.");
          } else {
            await sendMessage(`⏳ *Avvio esecuzione manuale — ${stats.open} task open...*`);
            state = await triggerCMEExecution(state);
          }
        } else if (text === "/help") {
          await sendMessage(
            "*CME Scheduler — Comandi*\n\n" +
            "/status — Stato board\n" +
            "/esegui — Trigger manuale esecuzione task open (normalmente automatico)\n" +
            "/piano — Genera piano automatico (board vuoto)\n" +
            "/piano\\_default — Piano di emergenza hardcoded\n" +
            "/cancella — Annulla piano CME in attesa\n" +
            "/reset — Resetta conversazione CME\n" +
            "/intervista — Ripeti l'intervista di contesto\n" +
            "/help — Questo messaggio\n\n" +
            "💬 _Scrivi qualsiasi messaggio per parlare con CME_\n\n" +
            "🤖 _Comportamento automatico:_\n" +
            "_• Task open → CME li esegue via claude -p_\n" +
            "_• Board vuoto → CME convoca plenaria + crea piano_"
          );
        } else if (!text.startsWith("/")) {
          // Intercetta risposta intervista avvio (priorità su chat libera)
          const iv = state.startupInterview;
          if (iv && iv.status !== "done") {
            state = await handleInterviewAnswer(text, state);
          } else {
            // Free-text → chat with CME
            log(`Chat CME: "${text.slice(0, 80)}"`);
            await sendMessage("⏳ _CME sta elaborando..._");
            const result = await chatWithCME(text, state);
            state = result.state;
            await sendMessage(`🤖 *CME:*\n\n${result.reply}`);
            log(`CME risposta: ${result.reply.length} chars`);
          }
        }
      }

      saveState(state);
    }

    // ── State file mtime watch — comunicazione bidirezionale con Claude Code ──
    const currentMtime = fs.existsSync(STATE_FILE) ? fs.statSync(STATE_FILE).mtimeMs : 0;
    if (currentMtime > lastStateMtime) {
      const freshState = loadState();

      // Caso 1: pendingPlan era presente e ora è null → approvato o rifiutato da Claude Code
      if (state.pendingPlan && !freshState.pendingPlan) {
        log("Piano approvato/rifiutato esternamente (Claude Code) — aggiorno Telegram");
        if (state.pendingPlan.messageId) {
          const ts = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
          const wasApproved = freshState.lastApprovedAt &&
            (!freshState.lastCancelledAt || freshState.lastApprovedAt > freshState.lastCancelledAt);
          const statusText = wasApproved
            ? `✅ *Piano #${state.pendingPlan.planNumber} — Approvato via Claude Code*\n_${ts}_`
            : `❌ *Piano #${state.pendingPlan.planNumber} — Rifiutato via Claude Code*\n_${ts}_`;
          await editMessage(state.pendingPlan.messageId, statusText);
        }
      }

      // Caso 2: CME in sessione ha scritto un nuovo pendingPlan con messageId=null → inviarlo su Telegram
      const cmeWroteNewPlan = !state.pendingPlan && freshState.pendingPlan && freshState.pendingPlan.messageId === null;
      const cmeUpdatedPlan = state.pendingPlan && freshState.pendingPlan &&
        state.pendingPlan.messageId === null && freshState.pendingPlan.messageId === null;
      if (cmeWroteNewPlan || cmeUpdatedPlan) {
        log(`Piano CME iniettato (messageId=null) — invio su Telegram`);
        state = freshState;
        state = await sendCMEInjectedPlan(state);
        lastStateMtime = fs.existsSync(STATE_FILE) ? fs.statSync(STATE_FILE).mtimeMs : 0;
        continue;
      }

      state = freshState;
      lastStateMtime = currentMtime;
    }

    // ── Board check (ogni BOARD_POLL_INTERVAL_MS) ──
    const now = Date.now();
    if (now - lastBoardCheck >= BOARD_POLL_INTERVAL_MS) {
      lastBoardCheck = now;
      lastReminderMs = now; // il board check copre il reminder — evita doppio getBoardStats
      const stats = getBoardStats();
      log(`Board check: open=${stats.open}, in_progress=${stats.inProgress}`);

      if (stats.open > 0) {
        // Task open → CME esegue autonomamente
        log(`${stats.open} task open — trigger esecuzione CME via claude -p`);
        state = await triggerCMEExecution(state);
      } else if (stats.open === 0 && stats.inProgress === 0) {
        // Board completamente vuoto → plenaria + nuovo piano
        state = await onBoardEmpty(state);
      } else {
        // Solo task in_progress → nessuna azione, aspetta completamento
        log(`Board: ${stats.inProgress} in_progress, 0 open — attendo completamento`);
      }
    }

    // ── Reminder informativo ogni 5 min (solo log, non Telegram) ──
    if (now - lastReminderMs >= OPEN_TASK_REMINDER_MS) {
      lastReminderMs = now;
      try {
        const stats = getBoardStats();
        if (stats.open > 0) {
          log(`Reminder: ${stats.open} task open (esecuzione al prossimo board check)`);
        }
      } catch {
        // silenzioso
      }
    }

    // Breve pausa per non martellare Telegram (il timeout=30 fa già throttling)
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ─── Setup mode ───────────────────────────────────────────────────────────────

async function runSetup(): Promise<void> {
  console.log("\n=== CME Scheduler — Setup Telegram ===\n");

  if (!BOT_TOKEN) {
    console.log("❌ TELEGRAM_BOT_TOKEN non configurato in .env.local\n");
    console.log("1. Apri Telegram e cerca @BotFather");
    console.log("2. Invia /newbot e segui le istruzioni");
    console.log("3. Copia il token e aggiungilo a .env.local:");
    console.log("   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...\n");
    return;
  }

  console.log(`✅ BOT_TOKEN trovato (${BOT_TOKEN.slice(0, 10)}...)\n`);
  console.log("Per scoprire il tuo CHAT_ID:");
  console.log("1. Apri Telegram e cerca il bot che hai creato");
  console.log("2. Invia qualsiasi messaggio al bot");
  console.log("3. Aspetta 5 secondi...\n");

  await new Promise((r) => setTimeout(r, 5_000));

  const updates = await getUpdates(0);
  if (updates.length === 0) {
    console.log("❌ Nessun messaggio ricevuto. Assicurati di aver mandato un messaggio al bot.");
    return;
  }

  const chatId = updates[0]?.message?.chat?.id ?? updates[0]?.callback_query?.message?.chat?.id;
  if (chatId) {
    console.log(`✅ Chat ID trovato: ${chatId}`);
    console.log(`\nAggiungi a .env.local:\n   TELEGRAM_CHAT_ID=${chatId}\n`);
  } else {
    console.log("❌ Chat ID non trovato nell'update:", JSON.stringify(updates[0], null, 2));
  }
}

// ─── Test mode ────────────────────────────────────────────────────────────────

async function runTest(): Promise<void> {
  console.log("\n=== CME Scheduler — Test Telegram ===\n");
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID richiesti");
    process.exit(1);
  }
  const msgId = await sendMessage(
    "🧪 *Test CME Scheduler*\n\nSe ricevi questo messaggio, il bot è configurato correttamente.\n\n✅ Bottoni:",
    buildApprovalKeyboard(0)
  );
  console.log(`✅ Messaggio test inviato (messageId: ${msgId})`);
}

// ─── Check-once mode ──────────────────────────────────────────────────────────

/**
 * Single-shot execution for PowerShell scheduler / cron (AVVIA_SCHEDULER.ps1).
 * Does NOT require Telegram — works without BOT_TOKEN/CHAT_ID.
 *
 * Behavior:
 *   - Board has open tasks   → log count, attempt to claim first open task
 *   - Board is empty (open=0, in_progress=0)
 *       • Telegram configured → call onBoardEmpty() to generate and send plan
 *       • Telegram missing    → log demo message and exit 0
 *   - Board has only in_progress tasks → log and exit (nothing to do)
 */
async function runCheckOnce(): Promise<void> {
  log("=== CME Scheduler check-once ===");

  const stats = getBoardStats();
  log(`Board: open=${stats.open}, in_progress=${stats.inProgress}, done=${stats.done}, total=${stats.total}`);

  if (stats.open > 0) {
    // Task aperti → tenta di claimare il primo disponibile
    log(`${stats.open} task open presenti`);
    try {
      const listRaw = execSync("npx tsx scripts/company-tasks.ts list --status open", {
        encoding: "utf-8",
        cwd: ROOT,
        timeout: 30_000,
      });
      // Cerca il primo short ID (8 caratteri hex) nella lista
      const idMatch = listRaw.match(/\b([0-9a-f]{8})\b/i);
      if (idMatch) {
        const taskId = idMatch[1];
        log(`Claim task ${taskId} per scheduler...`);
        execSync(`npx tsx scripts/company-tasks.ts claim ${taskId} --agent scheduler`, {
          encoding: "utf-8",
          cwd: ROOT,
          timeout: 15_000,
        });
        log(`Task ${taskId} claimato con successo`);
      } else {
        log("WARN: nessun task ID trovato nell'output list — skip claim");
      }
    } catch (e) {
      log(`WARN: claim fallito: ${(e as Error).message}`);
    }
  } else if (stats.open === 0 && stats.inProgress === 0) {
    // Board completamente vuoto
    if (BOT_TOKEN && CHAT_ID) {
      log("Board vuoto — Telegram configurato, avvio generazione piano...");
      const state = loadState();
      await onBoardEmpty(state);
    } else {
      // Headless mode: senza Telegram usa checkIdleAndPlan() per creare task di pianificazione reali
      log("Board vuoto — modalità headless (no Telegram): creo task di pianificazione...");
      try {
        const { checkIdleAndPlan } = await import("./daily-controls");
        const date = new Date().toISOString().slice(0, 10);
        const result = await checkIdleAndPlan(date);
        if (result.tasksCreated > 0) {
          log(`✅ Headless plan: ${result.tasksCreated} task di pianificazione creati per i dipartimenti`);
        } else {
          log("Task di pianificazione già presenti — nessuna duplicazione");
        }
      } catch (e) {
        log(`WARN: checkIdleAndPlan fallito: ${(e as Error).message}`);
      }
    }
  } else {
    // Solo task in_progress, nessun open
    log(`Board ok: in_progress=${stats.inProgress} — nessuna azione`);
  }

  log("=== Check-once completato ===");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--setup")) {
  runSetup().catch(console.error);
} else if (args.includes("--test")) {
  runTest().catch(console.error);
} else if (args.includes("--check-once")) {
  runCheckOnce().catch((e) => {
    console.error("Check-once error:", e);
    process.exit(1);
  });
} else {
  runDaemon().catch((e) => {
    console.error("Daemon crashed:", e);
    process.exit(1);
  });
}
