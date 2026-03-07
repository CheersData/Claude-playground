/**
 * company-scheduler.ts — Company Scheduler CME con approvazione Telegram
 *
 * Logica:
 *   - Ogni 30 minuti controlla il task board
 *   - Se board vuoto (open=0, in_progress=0) E nessun piano pending → genera piano
 *   - Piano inviato al boss via Telegram per approvazione
 *   - Boss preme ✅ Approva → task creati automaticamente
 *   - Boss preme ❌ Rifiuta → piano scartato, nuovo piano al prossimo check
 *   - Più piani al giorno: ogni volta che il board si svuota viene generato un nuovo piano
 *
 * Telegram polling ogni 5 secondi → risposta quasi istantanea ai bottoni.
 *
 * Senza Telegram: stampa il piano a console, attende input manuale.
 *
 * Usage: npx tsx scripts/company-scheduler.ts
 * O via AVVIA_COMPANY_SCHEDULER.bat
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { callLLM, parseJSON } from "./lib/llm";

import {
  isTelegramConfigured,
  sendMessage,
  editMessage,
  answerCallback,
  getUpdates,
  type InlineButton,
} from "./lib/telegram";

const ROOT = path.resolve(__dirname, "..");
const PLANS_DIR = path.join(ROOT, "company", "plans");
const BOARD_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minuti
const TELEGRAM_POLL_INTERVAL_MS = 5_000; // 5 secondi

// Crea directory plans se non esiste
if (!fs.existsSync(PLANS_DIR)) {
  fs.mkdirSync(PLANS_DIR, { recursive: true });
}

// ─── Types ───

interface PlanAction {
  dept: string;
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  desc: string;
}

interface TradingSection {
  pipelineStatus: string;
  improvements: string[];
}

interface Plan {
  id: string;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
  telegramMessageId?: number;
  summary: string;
  actions: PlanAction[];
  trading: TradingSection;
  rejectionReason?: string;
}

interface BoardState {
  open: number;
  inProgress: number;
  done: number;
  recentDone: string[];
}

// ─── Board ───

function readBoardState(): BoardState {
  try {
    const raw = execSync("npx tsx scripts/company-tasks.ts board", {
      encoding: "utf-8",
      cwd: ROOT,
      timeout: 30_000,
    });

    const openMatch = raw.match(/Open:\s*(\d+)/);
    const inProgMatch = raw.match(/In Progress:\s*(\d+)/);
    const doneMatch = raw.match(/Done:\s*(\d+)/);

    // Estrai task recenti completati
    const recentDone: string[] = [];
    const doneLines = raw.match(/\[done\][^\n]+/g) ?? [];
    for (const line of doneLines.slice(0, 5)) {
      const m = line.match(/\|\s*(.+?)\s*\(/);
      if (m) recentDone.push(m[1].trim());
    }

    return {
      open: parseInt(openMatch?.[1] ?? "0"),
      inProgress: parseInt(inProgMatch?.[1] ?? "0"),
      done: parseInt(doneMatch?.[1] ?? "0"),
      recentDone,
    };
  } catch (e) {
    console.error(`[board] Errore lettura board: ${e}`);
    return { open: 0, inProgress: 0, done: 0, recentDone: [] };
  }
}

// ─── Plan storage ───

function getPendingPlan(): Plan | null {
  try {
    const files = fs
      .readdirSync(PLANS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    for (const file of files) {
      const plan = JSON.parse(
        fs.readFileSync(path.join(PLANS_DIR, file), "utf-8")
      ) as Plan;
      if (plan.status === "pending") return plan;
    }
  } catch {
    // directory vuota o file corrotto
  }
  return null;
}

function savePlan(plan: Plan): void {
  fs.writeFileSync(
    path.join(PLANS_DIR, `${plan.id}.json`),
    JSON.stringify(plan, null, 2)
  );
}

// ─── Plan generation ───

const COMPANY_CONTEXT = `Controlla.me — app analisi legale AI con 4 agenti specializzati (Classifier, Analyzer, Investigator, Advisor).
Stack: Next.js 15, Supabase pgvector, Claude/Gemini/Groq, TypeScript strict.
Fase: pre-lancio commerciale PMI. Priorità aziendali correnti:
- Test coverage gap: agent-runner.ts (P1), tiers.ts (P2), generate.ts (P5)
- EU AI Act compliance (deadline agosto 2026)
- DPA con provider AI (Anthropic, Mistral, Google) — prerequisito lancio PMI
- Corpus: Statuto dei Lavoratori (L. 300/1970) non ancora caricato
- UI scoring multidimensionale (backend pronto, frontend mancante — effort minimo)
- Vertical HR: opportunità mappata, prerequisito corpus punto precedente`;

const TRADING_CONTEXT = `Ufficio Trading (Python/Alpaca) — stato attuale:
- Fase 1 (infrastruttura): completata — scheduler attivo, 5 agenti operativi
- Fase 2 (backtest): non avviata — richiede dati storici 2 anni, target Sharpe > 1.0
- Paper trading: scheduler gira (09:00 ET pre-market, 16:30 ET post-market)
- Go-live: minimo 30 giorni paper trading consistenti dopo Fase 2
- Risk management: kill switch -2% daily / -5% weekly — NON NEGOZIABILE
- Gap conosciuti: no P&L reale su /ops dashboard, intraday disabilitato (Phase 2)`;

async function generatePlan(board: BoardState): Promise<Plan> {
  const id = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const timestamp = new Date().toISOString();

  const prompt = `Sei CME, CEO virtuale di Controlla.me. Il task board è appena diventato vuoto (open=0, in_progress=0).
È il momento di pianificare il prossimo sprint di lavoro.

CONTESTO AZIENDALE:
${COMPANY_CONTEXT}

CONTESTO TRADING:
${TRADING_CONTEXT}

TASK RECENTI COMPLETATI:
${board.recentDone.length > 0 ? board.recentDone.map((t) => `- ${t}`).join("\n") : "- Nessuno disponibile"}

Genera un piano concreto per il prossimo sprint. Rispondi ESCLUSIVAMENTE con JSON puro (niente markdown, niente backtick).
La risposta deve iniziare con { e finire con }.

Formato:
{
  "summary": "1-2 frasi: situazione attuale e focus di questo sprint",
  "actions": [
    {
      "dept": "quality-assurance",
      "title": "Coprire agent-runner.ts con test unitari",
      "priority": "high",
      "desc": "Descrizione concreta di cosa fare e perché — max 100 caratteri"
    }
  ],
  "trading": {
    "pipelineStatus": "Descrizione dello stato attuale del trading",
    "improvements": [
      "Suggerimento specifico 1 per migliorare l'ufficio trading",
      "Suggerimento specifico 2"
    ]
  }
}

Regole:
- Proponi 3-5 actions per i dipartimenti che hanno backlog noto
- Includi SEMPRE 2-3 miglioramenti concreti per il Trading
- Le improvements trading devono essere specifiche e tecniche (no generici)
- priority deve essere: low | medium | high | critical
- dept validi: quality-assurance, security, architecture, data-engineering, strategy, marketing, finance, operations, ufficio-legale, ux-ui`;

  // Genera piano con provider gratuiti (Gemini Flash → Groq → Cerebras)
  try {
    const output = await callLLM(prompt, {
      callerName: "PLAN-GEN",
      maxTokens: 4096,
      temperature: 0.3,
    });

    const data = parseJSON<{
      summary?: string;
      actions?: PlanAction[];
      trading?: TradingSection;
    }>(output);

    return {
      id,
      timestamp,
      status: "pending",
      summary: data.summary ?? "Piano generato da AI.",
      actions: data.actions ?? [],
      trading: data.trading ?? {
        pipelineStatus: "N/A",
        improvements: [],
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[plan-gen] LLM non disponibile: ${msg.slice(0, 80)}`);
    console.log("[plan-gen] Uso piano template.");
  }

  // Fallback: piano template basato su backlog noto
  return {
    id,
    timestamp,
    status: "pending",
    summary:
      "Board vuoto — piano generato con template. Nessun provider LLM gratuito disponibile.",
    actions: [
      {
        dept: "quality-assurance",
        title: "Coprire agent-runner.ts con test unitari",
        priority: "high",
        desc: "Gap critico P1: nessun test su lib/ai-sdk/agent-runner.ts — catena fallback e gestione 429",
      },
      {
        dept: "security",
        title: "Avviare DPA con Anthropic",
        priority: "high",
        desc: "Prerequisito lancio commerciale PMI — contattare legal@anthropic.com con DPA template",
      },
      {
        dept: "data-engineering",
        title: "Caricare Statuto dei Lavoratori L. 300/1970",
        priority: "medium",
        desc: "Unica fonte IT non ancora nel corpus — approccio HTML scraping Normattiva web",
      },
      {
        dept: "architecture",
        title: "UI scoring multidimensionale in ResultsView",
        priority: "medium",
        desc: "Backend pronto (legalCompliance, contractBalance, industryPractice) — effort frontend minimo",
      },
    ],
    trading: {
      pipelineStatus:
        "Fase 1 completata — scheduler attivo, paper trading configurato",
      improvements: [
        "Avviare Fase 2 backtest su dati storici 2 anni (obiettivo Sharpe > 1.0, max drawdown < 15%)",
        "Aggiungere sezione P&L real-time su dashboard /ops (positions + daily snapshot)",
        "Implementare monitoring automatico degli stop loss attivati in portfolio_monitor",
      ],
    },
  };
}

// ─── Plan formatting ───

function formatPlanForTelegram(plan: Plan): string {
  const date = new Date(plan.timestamp).toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const actionsText = plan.actions
    .map(
      (a, i) =>
        `${i + 1}. <b>[${a.dept}]</b> ${a.title}\n   <i>${a.priority.toUpperCase()}</i> — ${a.desc}`
    )
    .join("\n\n");

  const improvementsText = plan.trading.improvements
    .map((t) => `  • ${t}`)
    .join("\n");

  return (
    `🏢 <b>PIANO CME</b> — ${date}\n\n` +
    `${plan.summary}\n\n` +
    `🎯 <b>AZIONI PROPOSTE:</b>\n\n${actionsText}\n\n` +
    `📈 <b>UFFICIO TRADING:</b>\n` +
    `<b>Stato:</b> ${plan.trading.pipelineStatus}\n` +
    `${improvementsText}\n\n` +
    `<code>Piano: ${plan.id}</code>`
  );
}

function formatPlanForConsole(plan: Plan): string {
  const line = "─".repeat(60);
  const actionsText = plan.actions
    .map(
      (a, i) =>
        `  ${i + 1}. [${a.dept}] ${a.title} (${a.priority})\n     ${a.desc}`
    )
    .join("\n\n");

  const improvementsText = plan.trading.improvements
    .map((t) => `  • ${t}`)
    .join("\n");

  return (
    `\n${line}\n` +
    `PIANO CME — ${new Date(plan.timestamp).toLocaleString("it-IT")}\n` +
    `${line}\n\n` +
    `${plan.summary}\n\n` +
    `AZIONI PROPOSTE:\n\n${actionsText}\n\n` +
    `UFFICIO TRADING:\n` +
    `  Stato: ${plan.trading.pipelineStatus}\n` +
    `${improvementsText}\n\n` +
    `Piano ID: ${plan.id}\n` +
    `${line}\n` +
    `Per approvare: npx tsx scripts/company-tasks.ts create ... (per ogni action)\n` +
    `Oppure configura TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID per approvazione automatica.\n`
  );
}

// ─── Plan execution ───

function executePlan(plan: Plan): void {
  console.log("[plan-executor] Creazione task dal piano approvato...");

  for (const action of plan.actions) {
    try {
      const cmd = [
        "npx tsx scripts/company-tasks.ts create",
        `--title ${JSON.stringify(action.title)}`,
        `--dept ${action.dept}`,
        `--priority ${action.priority}`,
        `--by cme`,
        `--desc ${JSON.stringify(action.desc)}`,
      ].join(" ");

      execSync(cmd, { encoding: "utf-8", cwd: ROOT, timeout: 30_000 });
      console.log(`[plan-executor] ✓ [${action.dept}] ${action.title}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[plan-executor] ✗ [${action.dept}] ${action.title}: ${msg.slice(0, 100)}`
      );
    }
  }

  console.log("[plan-executor] Done.");
}

// ─── Telegram handlers ───

async function handleApproval(
  planId: string,
  messageId: number
): Promise<void> {
  const planFile = path.join(PLANS_DIR, `${planId}.json`);
  if (!fs.existsSync(planFile)) {
    console.warn(`[telegram] Piano non trovato: ${planId}`);
    return;
  }

  const plan = JSON.parse(fs.readFileSync(planFile, "utf-8")) as Plan;
  if (plan.status !== "pending") return;

  plan.status = "approved";
  plan.telegramMessageId = messageId;
  savePlan(plan);

  console.log(`[telegram] Piano approvato: ${planId}`);

  // Aggiorna messaggio Telegram
  await editMessage(
    messageId,
    formatPlanForTelegram(plan) + "\n\n✅ <b>APPROVATO</b> — task in creazione..."
  );

  // Crea i task
  executePlan(plan);

  // Conferma finale
  await editMessage(
    messageId,
    formatPlanForTelegram(plan) +
      `\n\n✅ <b>APPROVATO</b> — ${plan.actions.length} task creati`
  );
}

async function handleRejection(
  planId: string,
  messageId: number
): Promise<void> {
  const planFile = path.join(PLANS_DIR, `${planId}.json`);
  if (!fs.existsSync(planFile)) {
    console.warn(`[telegram] Piano non trovato: ${planId}`);
    return;
  }

  const plan = JSON.parse(fs.readFileSync(planFile, "utf-8")) as Plan;
  if (plan.status !== "pending") return;

  plan.status = "rejected";
  savePlan(plan);

  console.log(`[telegram] Piano rifiutato: ${planId}`);

  await editMessage(
    messageId,
    formatPlanForTelegram(plan) +
      "\n\n❌ <b>RIFIUTATO</b> — nuovo piano al prossimo check board (30 min)"
  );
}

// ─── Main scheduler loop ───

async function run(): Promise<void> {
  const telegramOk = isTelegramConfigured();

  console.log("=== CME Company Scheduler ===");
  console.log(`Data: ${new Date().toLocaleString("it-IT")}`);
  console.log(`Telegram: ${telegramOk ? "✓ configurato" : "✗ non configurato (modalità console)"}`);
  console.log(`Check board ogni: 30 minuti`);
  console.log(`Telegram polling: ${telegramOk ? "ogni 5 secondi" : "disabilitato"}`);
  console.log("─".repeat(40));
  console.log("Scheduler avviato. Ctrl+C per uscire.\n");

  let lastCallbackOffset = 0;
  let lastBoardCheck = 0; // 0 = forza check immediato all'avvio

  while (true) {
    const now = Date.now();

    // ── Telegram callback polling ──
    if (telegramOk) {
      try {
        const updates = await getUpdates(lastCallbackOffset);
        for (const update of updates) {
          lastCallbackOffset = Math.max(
            lastCallbackOffset,
            update.update_id + 1
          );

          if (update.callback_query) {
            const { id: callbackId, data, message } = update.callback_query;
            await answerCallback(callbackId, "Ricevuto ✓");

            if (data.startsWith("approve:")) {
              const planId = data.replace("approve:", "");
              await handleApproval(planId, message.message_id);
            } else if (data.startsWith("reject:")) {
              const planId = data.replace("reject:", "");
              await handleRejection(planId, message.message_id);
            }
          }
        }
      } catch (e) {
        // Errore Telegram non bloccante — logga e continua
        console.error(`[telegram] Errore polling: ${e}`);
      }
    }

    // ── Board check (ogni 30 min) ──
    if (now - lastBoardCheck >= BOARD_CHECK_INTERVAL_MS) {
      lastBoardCheck = now;

      const board = readBoardState();
      const pending = getPendingPlan();

      console.log(
        `[${new Date().toLocaleTimeString("it-IT")}] Board: open=${board.open} in_progress=${board.inProgress} | pending plan: ${pending ? "sì" : "no"}`
      );

      if (board.open === 0 && board.inProgress === 0 && !pending) {
        console.log("[scheduler] Board vuoto — genero piano...");

        const plan = await generatePlan(board);
        savePlan(plan);

        if (telegramOk) {
          const keyboard: InlineButton[][] = [
            [
              { text: "✅ Approva", callback_data: `approve:${plan.id}` },
              { text: "❌ Rifiuta", callback_data: `reject:${plan.id}` },
            ],
          ];
          try {
            const msgId = await sendMessage(
              formatPlanForTelegram(plan),
              keyboard
            );
            plan.telegramMessageId = msgId;
            savePlan(plan);
            console.log(
              `[scheduler] Piano inviato via Telegram (msg_id: ${msgId})`
            );
          } catch (e) {
            console.error(`[scheduler] Errore Telegram send: ${e}`);
            console.log(formatPlanForConsole(plan));
          }
        } else {
          console.log(formatPlanForConsole(plan));
        }
      } else if (board.open === 0 && board.inProgress === 0 && pending) {
        console.log(
          "[scheduler] Board vuoto ma piano già in attesa di approvazione."
        );
      }
    }

    // ── Wait ──
    await new Promise((resolve) => setTimeout(resolve, TELEGRAM_POLL_INTERVAL_MS));
  }
}

run().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
