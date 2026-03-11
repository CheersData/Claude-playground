/**
 * lib/telegram.ts -- Ops Alerting via Telegram Bot API
 *
 * Pre-formatted alert functions for Operations department.
 * Uses Telegram Bot API directly (no npm package).
 * Requires: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env.local
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

function getBaseUrl() {
  return `https://api.telegram.org/bot${TOKEN}`;
}

export function isTelegramConfigured(): boolean {
  return TOKEN.length > 0 && CHAT_ID.length > 0;
}

async function send(text: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false;
  try {
    const res = await fetch(`${getBaseUrl()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  } catch {
    return false;
  }
}

export async function notifyCostSpike(
  provider: string,
  dailyCost: number,
  threshold: number
): Promise<boolean> {
  return send(
    `<b>Cost Spike Alert</b>

` +
      `Provider: <b>${provider}</b>
` +
      `Costo giornaliero: <b>$${dailyCost.toFixed(2)}</b>
` +
      `Soglia: $${threshold.toFixed(2)}

` +
      `Il costo giornaliero ha superato la soglia configurata.`
  );
}

export async function notifyTestFailure(
  suite: string,
  failCount: number,
  details: string
): Promise<boolean> {
  return send(
    `<b>Test Failure</b>

` +
      `Suite: <b>${suite}</b>
` +
      `Test falliti: <b>${failCount}</b>

` +
      `<pre>${details.substring(0, 500)}</pre>`
  );
}

export async function notifySyncFailure(
  source: string,
  error: string
): Promise<boolean> {
  return send(
    `<b>Sync Failure</b>

` +
      `Source: <b>${source}</b>
` +
      `Errore: <pre>${error.substring(0, 300)}</pre>`
  );
}

export async function notifyBlockedTask(
  taskId: string,
  title: string,
  dept: string,
  daysSinceUpdate: number
): Promise<boolean> {
  return send(
    `<b>Task Bloccato</b>

` +
      `Task: <b>${title}</b>
` +
      `Dept: <b>${dept}</b>
` +
      `ID: <code>${taskId.substring(0, 8)}</code>
` +
      `Ultimo aggiornamento: <b>${daysSinceUpdate} giorni fa</b>

` +
      `Questo task non viene aggiornato da oltre 48h.`
  );
}

export async function notifyDailyReport(report: {
  openTasks: number;
  blockedTasks: number;
  completedToday: number;
  dailyCost: number;
}): Promise<boolean> {
  return send(
    `<b>Daily Ops Report</b>

` +
      `Task aperti: <b>${report.openTasks}</b>
` +
      `Task bloccati: <b>${report.blockedTasks}</b>
` +
      `Completati oggi: <b>${report.completedToday}</b>
` +
      `Costo API oggi: <b>$${report.dailyCost.toFixed(2)}</b>`
  );
}

export async function notifyNewLead(lead: {
  name: string;
  email: string;
  source: string;
}): Promise<boolean> {
  return send(
    `<b>Nuovo Lead</b>

` +
      `Nome: <b>${lead.name}</b>
` +
      `Email: <b>${lead.email}</b>
` +
      `Fonte: <b>${lead.source}</b>
` +
      `Ora: ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`
  );
}