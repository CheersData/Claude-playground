/**
 * company-scheduler-daemon.ts — CME Scheduler con approvazione Telegram
 *
 * COMPORTAMENTO:
 *   1. Polling board ogni 5 min
 *   2. Se open=0 AND in_progress=0 → genera piano con `claude -p`
 *   3. Invia piano su Telegram per approvazione boss
 *   4. Boss clicca ✅ Approva → task creati sul board
 *   5. Boss clicca ✏️ Modifica → rigenerazione
 *   6. Boss clicca ❌ Annulla → cooldown 30 min
 *
 * SETUP RICHIESTO in .env.local:
 *   TELEGRAM_BOT_TOKEN=... (da @BotFather)
 *   TELEGRAM_CHAT_ID=...   (usa --setup per scoprirlo)
 *
 * USAGE:
 *   npx tsx scripts/company-scheduler-daemon.ts            # Avvia daemon
 *   npx tsx scripts/company-scheduler-daemon.ts --setup    # Mostra chat ID
 *   npx tsx scripts/company-scheduler-daemon.ts --test     # Invia messaggio test
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ─── Config ───────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const STATE_FILE = path.resolve(__dirname, "../company/scheduler-daemon-state.json");
const BOARD_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minuti
const TELEGRAM_POLL_TIMEOUT_S = 30;            // long polling timeout
const CANCEL_COOLDOWN_MS = 30 * 60 * 1000;    // 30 min cooldown dopo annulla

const ROOT = path.resolve(__dirname, "..");

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface DaemonState {
  updateOffset: number;
  pendingPlan: PendingPlan | null;
  planCountToday: number;
  lastPlanDate: string;
  lastCancelledAt: string | null;
  lastApprovedAt: string | null;
}

// ─── State persistence ────────────────────────────────────────────────────────

function loadState(): DaemonState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {}
  return {
    updateOffset: 0,
    pendingPlan: null,
    planCountToday: 0,
    lastPlanDate: "",
    lastCancelledAt: null,
    lastApprovedAt: null,
  };
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
      const sigSummary = signals.map((s: any) => {
        const d = s.data ?? {};
        return `${s.signal_type}${d.symbol ? `(${d.symbol})` : ""}`;
      }).join(", ");
      lines.push(`Segnali recenti: ${sigSummary}`);
    }

    if (riskEvents.length > 0) {
      lines.push(`Eventi risk: ${riskEvents.map((r: any) => r.event_type).join(", ")}`);
    }

    return lines.join("\n");
  } catch (e) {
    return `Stato trading non disponibile: ${(e as Error).message}`;
  }
}

// ─── Plan generation ──────────────────────────────────────────────────────────

interface GeneratedPlan {
  planText: string;
  tasks: TaskProposal[];
}

async function generatePlan(planNumber: number, boardStats: BoardStats): Promise<GeneratedPlan> {
  const tradingStatus = await getTradingStatus();
  const dateStr = new Date().toLocaleString("it-IT");

  // Backlog noto (hard-coded context per qualità del piano)
  const companyContext = `
Controlla.me — app analisi legale AI (pre-lancio commerciale PMI).
Stack: Next.js 15, Supabase, Claude/Gemini/Groq, pgvector.
Task board: VUOTO (open=${boardStats.open}, in_progress=${boardStats.inProgress}, done=${boardStats.done} totali).

Ufficio Trading:
${tradingStatus}

Backlog storico noto (da considerare per i task):
- QA: gap test su agent-runner.ts, tiers.ts, generate.ts (P1-P2-P5)
- Security: DPA con Anthropic/Mistral/Google, consulente EU AI Act (agosto 2026)
- Architecture: UI scoring multidimensionale, TD-2 (tiers.ts global state)
- Data Engineering: Statuto dei Lavoratori (L. 300/1970) — non ancora caricato
- Strategy: Opportunity Brief verticale HR, analisi competitor
- Marketing: SEO articoli legali, landing page verticale affitti
- Finance: Cost report mensile, monitoraggio costi Groq/Cerebras
- Operations: Health check agenti runtime, monitoring dashboard /ops
- Ufficio Legale: Revisione prompt advisor (falsi positivi needsLawyer)
- Trading: Backtest (Fase 2), ottimizzazione filtri scanner, riduzione falsi segnali

Dashboard /ops — sezione Trading: mostrare posizioni attuali + P&L ultimo giorno + P&L ultima ora.
`.trim();

  const prompt = `Sei CME, il CEO virtuale di Controlla.me. Il task board è ora COMPLETAMENTE VUOTO.
Devi generare il Piano #${planNumber} (${dateStr}).

CONTESTO:
${companyContext}

Genera un piano CONCRETO. Output ESCLUSIVAMENTE JSON puro. Inizia con { e finisci con }.

{
  "planText": "Testo markdown del piano leggibile dal boss su Telegram (max 2000 caratteri). Include: titolo, priorità immediata, analisi Ufficio Trading con miglioramenti concreti, elenco dipartimenti con task proposti. Tono diretto, no legalese.",
  "tasks": [
    {
      "dept": "nome-dipartimento",
      "title": "Titolo task breve (max 10 parole)",
      "priority": "low|medium|high|critical",
      "desc": "Cosa fare e perché, in modo che chiunque legga capisca senza aprire il dettaglio (max 150 char)"
    }
  ]
}

Dipartimenti validi: architecture, data-engineering, quality-assurance, security, finance, operations, strategy, marketing, ufficio-legale, trading, ux-ui

Regole:
- 1-3 task per dipartimento, solo per quelli dove c'è davvero lavoro utile
- Trading: SEMPRE includi almeno 2 task specifici per migliorare la pipeline
- planText deve essere leggibile su Telegram con Markdown (*grassetto*, _corsivo_)
- NON inventare task generici — usa il backlog noto sopra
- Priorità task: almeno 2 HIGH nel piano
- JSON valido, no backtick`;

  try {
    const raw = execSync(`claude -p ${JSON.stringify(prompt)}`, {
      encoding: "utf-8",
      timeout: 90_000,
      cwd: ROOT,
    }).trim();

    // Parse JSON robusto
    let parsed: GeneratedPlan | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
    }

    if (!parsed || !parsed.planText || !Array.isArray(parsed.tasks)) {
      throw new Error(`JSON parse fallito. Risposta: ${raw.slice(0, 200)}`);
    }

    return parsed;
  } catch (e) {
    // Fallback: piano minimo senza AI
    log(`Plan generation error: ${(e as Error).message}`);
    return {
      planText: `*Piano #${planNumber} — Errore generazione AI*\n\nBoard vuoto. Errore: ${(e as Error).message}\n\nApprova per creare task di default.`,
      tasks: [
        { dept: "architecture", title: "Review backlog e priorità sprint", priority: "medium", desc: "Board vuoto — definire prossime attività." },
        { dept: "quality-assurance", title: "Completa test coverage gap critici", priority: "high", desc: "agent-runner.ts e tiers.ts non coperti — P1/P2." },
        { dept: "trading", title: "Analisi performance scanner ultima settimana", priority: "high", desc: "Verificare qualità segnali e metriche P&L." },
      ],
    };
  }
}

// ─── Task creation ────────────────────────────────────────────────────────────

function createTasks(tasks: TaskProposal[]): number {
  let created = 0;
  for (const t of tasks) {
    const dept = t.dept.toLowerCase().replace(/\s+/g, "-");
    const priority = (t.priority || "medium").toLowerCase();
    try {
      execSync(
        `npx tsx scripts/company-tasks.ts create --title ${JSON.stringify(t.title)} --dept ${dept} --priority ${priority} --by cme --desc ${JSON.stringify(t.desc)}`,
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

async function telegramRequest(method: string, body: object): Promise<any> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN non configurato");
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

async function sendMessage(text: string, replyMarkup?: object): Promise<number | null> {
  try {
    const result = await telegramRequest("sendMessage", {
      chat_id: CHAT_ID,
      text: text.slice(0, 4096), // Telegram limit
      parse_mode: "Markdown",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return result?.message_id ?? null;
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

async function getUpdates(offset: number): Promise<any[]> {
  if (!BOT_TOKEN) return [];
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=${TELEGRAM_POLL_TIMEOUT_S}&offset=${offset}`;
    const res = await fetch(url);
    const data = await res.json() as any;
    return data.result ?? [];
  } catch {
    return [];
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
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

  // Non generare se c'è già un piano in attesa
  if (state.pendingPlan) {
    log("Piano in attesa di approvazione — skip generazione");
    return state;
  }

  // Reset contatore se giorno nuovo
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastPlanDate !== today) {
    state.planCountToday = 0;
    state.lastPlanDate = today;
  }
  state.planCountToday++;

  log(`Board vuoto — genero Piano #${state.planCountToday}...`);
  await sendMessage(`⏳ Board vuoto. Genero Piano #${state.planCountToday}...`);

  const plan = await generatePlan(state.planCountToday, getBoardStats());
  const text = formatPlanMessage(plan, state.planCountToday);
  const keyboard = buildApprovalKeyboard(state.planCountToday);

  const messageId = await sendMessage(text, keyboard);
  log(`Piano #${state.planCountToday} inviato su Telegram (messageId: ${messageId})`);

  state.pendingPlan = {
    planNumber: state.planCountToday,
    generatedAt: new Date().toISOString(),
    messageId: messageId,
    planText: plan.planText,
    tasks: plan.tasks,
  };

  saveState(state);
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

    await answerCallback(callbackQueryId, "Richiesta modifica ricevuta. Rigenero...");
    await sendMessage(`✏️ Piano #${planNum} rifiutato. Rigerenro Piano #${state.planCountToday + 1}...`);
    state.pendingPlan = null;
    state.lastCancelledAt = null;

    // Incrementa e rigenera subito
    state.planCountToday++;
    const plan = await generatePlan(state.planCountToday, getBoardStats());
    const text = formatPlanMessage(plan, state.planCountToday);
    const keyboard = buildApprovalKeyboard(state.planCountToday);
    const messageId = await sendMessage(text, keyboard);

    state.pendingPlan = {
      planNumber: state.planCountToday,
      generatedAt: new Date().toISOString(),
      messageId,
      planText: plan.planText,
      tasks: plan.tasks,
    };

    log(`Piano rigenerato: #${state.planCountToday}`);

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

// ─── Main loop ────────────────────────────────────────────────────────────────

async function runDaemon(): Promise<void> {
  log("=== CME Company Scheduler Daemon avviato ===");
  log(`Board poll: ogni ${BOARD_POLL_INTERVAL_MS / 60_000} min`);
  log(`Telegram long-poll timeout: ${TELEGRAM_POLL_TIMEOUT_S}s`);

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("\n❌ TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID mancanti in .env.local");
    console.error("   Esegui con --setup per configurare il Telegram bot\n");
    process.exit(1);
  }

  let state = loadState();
  let lastBoardCheck = 0;

  await sendMessage("🟢 *CME Scheduler avviato*\nMonitoro il board ogni 5 minuti.\nRiceverai un piano ogni volta che il board è completamente vuoto.");

  // Telegram + board loop combinato
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
        } else if (text === "/help") {
          await sendMessage(
            "*CME Scheduler — Comandi*\n\n/status — Stato board\n/cancella — Annulla piano corrente\n/help — Questo messaggio"
          );
        }
      }

      saveState(state);
    }

    // ── Board check (ogni BOARD_POLL_INTERVAL_MS) ──
    const now = Date.now();
    if (now - lastBoardCheck >= BOARD_POLL_INTERVAL_MS) {
      lastBoardCheck = now;
      const stats = getBoardStats();
      log(`Board check: open=${stats.open}, in_progress=${stats.inProgress}`);

      if (stats.open === 0 && stats.inProgress === 0) {
        state = await onBoardEmpty(state);
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

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--setup")) {
  runSetup().catch(console.error);
} else if (args.includes("--test")) {
  runTest().catch(console.error);
} else {
  runDaemon().catch((e) => {
    console.error("Daemon crashed:", e);
    process.exit(1);
  });
}
