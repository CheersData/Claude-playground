/**
 * telegram-approval.ts — Async approval flow via Telegram
 *
 * Sends an approval request to the boss via Telegram inline buttons,
 * polls for the response, and returns the decision.
 *
 * Usage (programmatic):
 *   import { requestApproval, notifyBoss } from "./telegram-approval";
 *   const result = await requestApproval({ title: "...", details: "...", approvalId: "task-42" });
 *
 * Usage (CLI):
 *   npx tsx scripts/lib/telegram-approval.ts --title "Test" --details "Test approval" --id test123
 */

import {
  sendMessage,
  editMessage,
  answerCallback,
  getUpdates,
  isTelegramConfigured,
  type InlineButton,
  type TelegramUpdate,
} from "./telegram";

// ─── Constants ───

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const POLL_INTERVAL_MS = 2_000; // 2 seconds
const MAX_MESSAGE_LENGTH = 4096;

// ─── Helpers ───

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function buildApprovalMessage(title: string, details: string): string {
  const header = `<b>🔔 Richiesta approvazione</b>\n\n<b>${escapeHtml(title)}</b>`;
  const body = `\n\n${escapeHtml(details)}`;
  return truncate(header + body, MAX_MESSAGE_LENGTH);
}

function buildResultMessage(
  title: string,
  result: "approved" | "rejected" | "timeout"
): string {
  const icons: Record<string, string> = {
    approved: "✅ Approvato",
    rejected: "❌ Rifiutato",
    timeout: "⏰ Scaduto",
  };
  return `<b>${icons[result]}</b>\n\n<b>${escapeHtml(title)}</b>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ───

export interface ApprovalOptions {
  /** e.g. "Plenaria: 8 nuovi task" */
  title: string;
  /** Multi-line description of what's being proposed */
  details: string;
  /** Unique ID for this approval (e.g. task ID or UUID) */
  approvalId: string;
  /** Default: 300_000 (5 min) */
  timeoutMs?: number;
}

/**
 * Request approval from boss via Telegram.
 * Sends a message with Approve/Reject buttons and polls for the response.
 *
 * @returns 'approved' | 'rejected' | 'timeout'
 */
export async function requestApproval(
  options: ApprovalOptions
): Promise<"approved" | "rejected" | "timeout"> {
  const { title, details, approvalId, timeoutMs = DEFAULT_TIMEOUT_MS } =
    options;

  if (!isTelegramConfigured()) {
    console.warn(
      "[telegram-approval] Telegram non configurato — auto-approve"
    );
    return "approved";
  }

  // 1. Send approval message with inline keyboard
  const keyboard: InlineButton[][] = [
    [
      { text: "✅ Approva", callback_data: `approve_${approvalId}` },
      { text: "❌ Rifiuta", callback_data: `reject_${approvalId}` },
    ],
  ];

  const messageText = buildApprovalMessage(title, details);
  const messageId = await sendMessage(messageText, keyboard);

  // 2. Establish the offset for polling (only process updates after this point)
  //    Get current updates to find the latest offset
  const initialUpdates = await getUpdates(0);
  let offset =
    initialUpdates.length > 0
      ? initialUpdates[initialUpdates.length - 1].update_id + 1
      : 0;

  // 3. Poll for callback response
  const deadline = Date.now() + timeoutMs;
  const approveData = `approve_${approvalId}`;
  const rejectData = `reject_${approvalId}`;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const updates: TelegramUpdate[] = await getUpdates(offset);

    for (const update of updates) {
      // Advance offset past this update regardless of whether it matches
      offset = update.update_id + 1;

      if (!update.callback_query) continue;

      const { id: callbackId, data } = update.callback_query;

      if (data === approveData) {
        await answerCallback(callbackId, "Approvato ✅");
        await editMessage(messageId, buildResultMessage(title, "approved"));
        return "approved";
      }

      if (data === rejectData) {
        await answerCallback(callbackId, "Rifiutato ❌");
        await editMessage(messageId, buildResultMessage(title, "rejected"));
        return "rejected";
      }
    }
  }

  // 4. Timeout — edit message to show expiry, remove keyboard
  await editMessage(messageId, buildResultMessage(title, "timeout"));
  return "timeout";
}

/**
 * Send a notification that doesn't need approval (fire-and-forget).
 */
export async function notifyBoss(
  title: string,
  details: string
): Promise<void> {
  if (!isTelegramConfigured()) {
    console.warn("[telegram-approval] Telegram non configurato — skip notify");
    return;
  }

  const header = `<b>📋 ${escapeHtml(title)}</b>`;
  const body = details ? `\n\n${escapeHtml(details)}` : "";
  const text = truncate(header + body, MAX_MESSAGE_LENGTH);

  await sendMessage(text);
}

// ─── CLI ───

if (require.main === module) {
  const args = process.argv.slice(2);

  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const title = getArg("title");
  const details = getArg("details") ?? "";
  const id = getArg("id");
  const notify = args.includes("--notify");
  const timeoutMs = getArg("timeout")
    ? parseInt(getArg("timeout")!, 10)
    : undefined;

  if (notify && title) {
    notifyBoss(title, details)
      .then(() => {
        console.log("Notifica inviata.");
        process.exit(0);
      })
      .catch((err) => {
        console.error("Errore:", err);
        process.exit(1);
      });
  } else if (title && id) {
    console.log(`Invio richiesta approvazione: "${title}" (id: ${id})`);
    console.log(`Timeout: ${timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`);
    console.log("In attesa di risposta...\n");

    requestApproval({ title, details, approvalId: id, timeoutMs })
      .then((result) => {
        console.log(`\nRisultato: ${result}`);
        process.exit(result === "approved" ? 0 : 1);
      })
      .catch((err) => {
        console.error("Errore:", err);
        process.exit(1);
      });
  } else {
    console.log(`Uso:
  Approvazione:
    npx tsx scripts/lib/telegram-approval.ts --title "Test" --details "Descrizione" --id test123 [--timeout 60000]

  Notifica (fire-and-forget):
    npx tsx scripts/lib/telegram-approval.ts --notify --title "Info" --details "Dettagli"
`);
    process.exit(1);
  }
}
