/**
 * telegram.ts — Telegram Bot API helper per CME
 *
 * Usa l'API REST di Telegram direttamente (niente npm package).
 * Richiede: TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID in .env.local
 *
 * Setup bot:
 *   1. Parla con @BotFather su Telegram → /newbot → copia il token
 *   2. Manda /start al tuo bot
 *   3. Chiama: https://api.telegram.org/bot{TOKEN}/getUpdates
 *      → copia "id" dal campo "chat" → è il tuo TELEGRAM_CHAT_ID
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const BASE = `https://api.telegram.org/bot${TOKEN}`;

export function isTelegramConfigured(): boolean {
  return TOKEN.length > 0 && CHAT_ID.length > 0;
}

// ─── Types ───

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data: string;
    message: { message_id: number };
  };
  message?: {
    message_id: number;
    text: string;
  };
}

// ─── API calls ───

/**
 * Invia un messaggio HTML con tastiera inline opzionale.
 * Ritorna il message_id del messaggio inviato.
 */
export async function sendMessage(
  text: string,
  keyboard?: InlineButton[][]
): Promise<number> {
  const body: Record<string, unknown> = {
    chat_id: CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard };
  }

  const res = await fetch(`${BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    ok: boolean;
    result?: { message_id: number };
    description?: string;
  };

  if (!data.ok) {
    throw new Error(`Telegram sendMessage failed: ${data.description}`);
  }
  return data.result!.message_id;
}

/**
 * Modifica il testo di un messaggio già inviato.
 */
export async function editMessage(
  messageId: number,
  text: string,
  keyboard?: InlineButton[][]
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: CHAT_ID,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard };
  }

  await fetch(`${BASE}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Rimuove la tastiera inline da un messaggio.
 */
export async function removeKeyboard(messageId: number): Promise<void> {
  await fetch(`${BASE}/editMessageReplyMarkup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    }),
  });
}

/**
 * Risponde a un callback query (obbligatorio per togliere il "loading" dal bottone).
 */
export async function answerCallback(
  callbackId: string,
  text?: string
): Promise<void> {
  await fetch(`${BASE}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

/**
 * Recupera gli aggiornamenti non ancora letti (long polling offset-based).
 */
export async function getUpdates(offset: number): Promise<TelegramUpdate[]> {
  try {
    const res = await fetch(
      `${BASE}/getUpdates?offset=${offset}&timeout=0&limit=10`
    );
    const data = (await res.json()) as {
      ok: boolean;
      result?: TelegramUpdate[];
    };
    return data.result ?? [];
  } catch {
    return [];
  }
}
