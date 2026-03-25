/**
 * lib/company/telegram-approval.ts — Approvazione asincrona via Telegram
 *
 * Usato dal daemon CME in modalita plenaria per inviare proposte al boss
 * e ricevere GO/NO-GO tramite bottoni inline.
 *
 * API Telegram usate:
 *   - sendMessage (con reply_markup inline_keyboard)
 *   - getUpdates (offset-based polling per callback_query)
 *   - answerCallbackQuery (conferma pressione bottone)
 *   - editMessageText (aggiorna messaggio con risultato)
 *
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

function getBaseUrl(): string {
  return `https://api.telegram.org/bot${TOKEN}`;
}

export function isTelegramConfigured(): boolean {
  return TOKEN.length > 0 && CHAT_ID.length > 0;
}

// ─── Internal Types ──────────────────────────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data: string;
    message: { message_id: number };
  };
}

interface SendMessageResult {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function telegramFetch<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${getBaseUrl()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

async function fetchUpdates(offset: number): Promise<TelegramUpdate[]> {
  try {
    const data = await telegramFetch<{ ok: boolean; result?: TelegramUpdate[] }>(
      "getUpdates",
      { offset, timeout: 0, limit: 20 }
    );
    return data.result ?? [];
  } catch {
    return [];
  }
}

async function editMessageText(messageId: number, text: string): Promise<void> {
  await telegramFetch("editMessageText", {
    chat_id: CHAT_ID,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  });
}

async function answerCallbackQuery(callbackId: string, text: string): Promise<void> {
  await telegramFetch("answerCallbackQuery", {
    callback_query_id: callbackId,
    text,
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Invia una richiesta di approvazione su Telegram con bottoni inline.
 *
 * Il messaggio contiene la proposta formattata e due bottoni:
 *   - Approva (callback_data: `approve:<taskId | messageId>`)
 *   - Rifiuta (callback_data: `reject:<taskId | messageId>`)
 *
 * @param proposal - Testo della proposta (HTML safe, verra escaped)
 * @param taskId   - ID opzionale per correlare la risposta (usato nel callback_data)
 * @returns message_id del messaggio Telegram inviato (per tracking con checkApprovalStatus)
 */
export async function sendApprovalRequest(
  proposal: string,
  taskId?: string
): Promise<number> {
  if (!isTelegramConfigured()) {
    console.warn("[telegram-approval] Telegram non configurato — impossibile inviare");
    return -1;
  }

  // Build unique callback data tag from taskId or a timestamp fallback
  const tag = taskId ?? `auto_${Date.now()}`;

  const text =
    `<b>Richiesta approvazione</b>\n\n` +
    `${escapeHtml(proposal)}\n\n` +
    (taskId ? `<code>Task: ${escapeHtml(taskId)}</code>\n\n` : "") +
    `Premi un bottone per rispondere.`;

  // Truncate to Telegram limit (4096 chars)
  const truncated = text.length > 4096 ? text.slice(0, 4093) + "..." : text;

  const result = await telegramFetch<SendMessageResult>("sendMessage", {
    chat_id: CHAT_ID,
    text: truncated,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "\u2705 Approva", callback_data: `approve:${tag}` },
          { text: "\u274C Rifiuta", callback_data: `reject:${tag}` },
        ],
      ],
    },
  });

  if (!result.ok) {
    throw new Error(`Telegram sendMessage failed: ${result.description ?? "unknown error"}`);
  }

  return result.result!.message_id;
}

/**
 * Controlla se ci sono callback query per un messaggio di approvazione.
 *
 * Nota: usa getUpdates con offset per evitare di rileggere update vecchi.
 * Ogni chiamata consuma gli update letti (avanza l'offset internamente).
 *
 * Per un polling continuo, usa `waitForApproval()`.
 *
 * @param messageId - message_id restituito da sendApprovalRequest
 * @returns 'pending' | 'approved' | 'rejected'
 */
export async function checkApprovalStatus(
  messageId: number
): Promise<"pending" | "approved" | "rejected"> {
  if (!isTelegramConfigured() || messageId < 0) return "pending";

  // Get all unprocessed updates
  const updates = await fetchUpdates(0);

  for (const update of updates) {
    if (!update.callback_query) continue;

    // Match by the message that the callback belongs to
    if (update.callback_query.message.message_id !== messageId) continue;

    const data = update.callback_query.data;
    const callbackId = update.callback_query.id;

    if (data.startsWith("approve:")) {
      await answerCallbackQuery(callbackId, "Approvato \u2705");
      await editMessageText(
        messageId,
        `<b>\u2705 APPROVATO</b>\n\n<i>Risposta ricevuta ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</i>`
      );
      // Acknowledge the update by advancing offset
      await fetchUpdates(update.update_id + 1);
      return "approved";
    }

    if (data.startsWith("reject:")) {
      await answerCallbackQuery(callbackId, "Rifiutato \u274C");
      await editMessageText(
        messageId,
        `<b>\u274C RIFIUTATO</b>\n\n<i>Risposta ricevuta ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</i>`
      );
      await fetchUpdates(update.update_id + 1);
      return "rejected";
    }
  }

  return "pending";
}

/**
 * Poll per approvazione fino a risposta o timeout.
 *
 * Controlla ogni 10 secondi se il boss ha premuto Approva o Rifiuta.
 *
 * @param messageId  - message_id restituito da sendApprovalRequest
 * @param timeoutMs  - timeout in ms (default: 30 minuti = 1_800_000)
 * @returns 'approved' | 'rejected' | 'timeout'
 */
export async function waitForApproval(
  messageId: number,
  timeoutMs: number = 30 * 60 * 1000
): Promise<"approved" | "rejected" | "timeout"> {
  if (!isTelegramConfigured() || messageId < 0) {
    console.warn("[telegram-approval] Telegram non configurato — auto-approve");
    return "approved";
  }

  const deadline = Date.now() + timeoutMs;
  const POLL_INTERVAL = 10_000; // 10 secondi

  // Establish baseline offset — skip all pre-existing updates
  const initialUpdates = await fetchUpdates(0);
  let offset = initialUpdates.length > 0
    ? initialUpdates[initialUpdates.length - 1].update_id + 1
    : 0;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL);

    const updates = await fetchUpdates(offset);

    for (const update of updates) {
      // Always advance offset past this update
      offset = update.update_id + 1;

      if (!update.callback_query) continue;
      if (update.callback_query.message.message_id !== messageId) continue;

      const data = update.callback_query.data;
      const callbackId = update.callback_query.id;

      if (data.startsWith("approve:")) {
        await answerCallbackQuery(callbackId, "Approvato \u2705");
        await editMessageText(
          messageId,
          `<b>\u2705 APPROVATO</b>\n\n<i>Risposta ricevuta ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</i>`
        );
        return "approved";
      }

      if (data.startsWith("reject:")) {
        await answerCallbackQuery(callbackId, "Rifiutato \u274C");
        await editMessageText(
          messageId,
          `<b>\u274C RIFIUTATO</b>\n\n<i>Risposta ricevuta ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</i>`
        );
        return "rejected";
      }
    }
  }

  // Timeout — aggiorna il messaggio per rimuovere i bottoni
  await editMessageText(
    messageId,
    `<b>\u23F0 SCADUTO</b>\n\n<i>Nessuna risposta entro ${Math.round(timeoutMs / 60_000)} minuti.</i>`
  );

  return "timeout";
}
