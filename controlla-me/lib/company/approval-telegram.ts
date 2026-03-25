/**
 * approval-telegram.ts — Async approval system via Telegram inline keyboard.
 *
 * Sends L3/L4 task approval requests to the boss via Telegram,
 * with inline ✅/❌ buttons. Processes callback responses and
 * updates both the approval table and the task status.
 *
 * Uses raw fetch to Telegram Bot API (same pattern as scripts/lib/telegram.ts
 * but importable from lib/ without cross-boundary issues).
 *
 * Requires: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID in env.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Telegram config ───

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  return { token, chatId, base: `https://api.telegram.org/bot${token}` };
}

function isTelegramConfigured(): boolean {
  const { token, chatId } = getTelegramConfig();
  return token.length > 0 && chatId.length > 0;
}

// ─── Types ───

export interface ApprovalRequest {
  id: string;
  task_id: string;
  message_id: number;
  approval_level: string;
  requester: string;
  status: "pending" | "approved" | "rejected" | "expired";
  decided_by: string | null;
  decided_at: string | null;
  rejection_reason: string | null;
  callback_data: Record<string, unknown> | null;
  created_at: string;
  expires_at: string;
}

export interface ApprovalResult {
  success: boolean;
  action: "approved" | "rejected";
  taskId: string;
  error?: string;
}

interface TelegramSendResult {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

// ─── Telegram API (raw fetch) ───

async function sendTelegramMessage(
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][]
): Promise<number> {
  const { base, chatId } = getTelegramConfig();

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  const res = await fetch(`${base}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as TelegramSendResult;
  if (!data.ok) {
    throw new Error(`Telegram sendMessage failed: ${data.description}`);
  }
  return data.result!.message_id;
}

async function editTelegramMessage(
  messageId: number,
  text: string
): Promise<void> {
  const { base, chatId } = getTelegramConfig();

  await fetch(`${base}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    }),
  });
}

async function answerTelegramCallback(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  const { base } = getTelegramConfig();

  await fetch(`${base}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  });
}

// ─── Helpers ───

/** First 8 chars of UUID, used as short ref in callback_data (Telegram 64-byte limit). */
function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 8);
}

/** Priority emoji. */
function priorityIcon(priority: string): string {
  switch (priority) {
    case "critical": return "\u{1F534}";  // red circle
    case "high": return "\u{1F7E0}";      // orange circle
    case "medium": return "\u{1F7E1}";    // yellow circle
    case "low": return "\u{1F7E2}";       // green circle
    default: return "\u{26AA}";           // white circle
  }
}

/** Approval level label. */
function levelLabel(level: string): string {
  switch (level) {
    case "L3": return "Boss Approval";
    case "L4": return "Boss + Security Audit";
    default: return level;
  }
}

// ─── Core functions ───

/**
 * Send an approval request to the boss via Telegram.
 *
 * Creates a message with task details and ✅ Approva / ❌ Rifiuta buttons,
 * then saves the request in `telegram_approval_requests`.
 *
 * @returns The created approval request ID, or null if Telegram is not configured.
 */
export async function requestApproval(
  taskId: string,
  title: string,
  department: string,
  approvalLevel: string,
  description?: string | null,
  priority?: string,
  requester = "cme"
): Promise<string | null> {
  if (!isTelegramConfigured()) {
    console.warn("[approval-telegram] Telegram not configured, skipping approval request");
    return null;
  }

  const supabase = createAdminClient();
  const ref = shortId(taskId);

  // Check for existing pending approval on this task
  const { data: existing } = await supabase
    .from("telegram_approval_requests")
    .select("id")
    .eq("task_id", taskId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    console.warn(`[approval-telegram] Task ${ref} already has a pending approval: ${existing.id}`);
    return existing.id;
  }

  // Build message text (HTML)
  const descPreview = description
    ? description.length > 200
      ? description.slice(0, 200) + "..."
      : description
    : "Nessuna descrizione";

  const pIcon = priorityIcon(priority ?? "medium");
  const text = [
    `<b>${levelLabel(approvalLevel)}</b>`,
    "",
    `${pIcon} <b>${escapeHtml(title)}</b>`,
    `Dipartimento: <code>${escapeHtml(department)}</code>`,
    `Priorita: <code>${priority ?? "medium"}</code>`,
    `Task: <code>${ref}</code>`,
    "",
    escapeHtml(descPreview),
    "",
    `Richiesto da: <i>${escapeHtml(requester)}</i>`,
  ].join("\n");

  // callback_data must be <= 64 bytes
  // Format: {"t":"abcd1234","a":"y"} or {"t":"abcd1234","a":"n"}
  const approveData = JSON.stringify({ t: ref, a: "y" });
  const rejectData = JSON.stringify({ t: ref, a: "n" });

  const keyboard = [
    [
      { text: "\u2705 Approva", callback_data: approveData },
      { text: "\u274C Rifiuta", callback_data: rejectData },
    ],
  ];

  // Send Telegram message
  const messageId = await sendTelegramMessage(text, keyboard);

  // Save to DB
  const { data, error } = await supabase
    .from("telegram_approval_requests")
    .insert({
      task_id: taskId,
      message_id: messageId,
      approval_level: approvalLevel,
      requester,
      status: "pending",
      callback_data: { ref, approveData, rejectData },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[approval-telegram] Failed to save approval request:", error.message);
    throw new Error(`Failed to save approval request: ${error.message}`);
  }

  console.log(`[approval-telegram] Sent approval request for task ${ref}, message_id=${messageId}`);
  return data.id;
}

/**
 * Handle a Telegram callback (button press).
 *
 * Looks up the pending approval by short task ref, updates DB status,
 * edits the Telegram message to show the decision, and updates the
 * task status (approved → open, rejected → blocked).
 */
export async function handleApprovalCallback(
  callbackQueryId: string,
  messageId: number,
  callbackData: string
): Promise<ApprovalResult> {
  // Parse callback data
  let parsed: { t: string; a: string };
  try {
    parsed = JSON.parse(callbackData);
  } catch {
    await answerTelegramCallback(callbackQueryId, "Dati non validi");
    return { success: false, action: "rejected", taskId: "", error: "Invalid callback data" };
  }

  const { t: taskRef, a: action } = parsed;
  if (!taskRef || !action || !["y", "n"].includes(action)) {
    await answerTelegramCallback(callbackQueryId, "Azione non riconosciuta");
    return { success: false, action: "rejected", taskId: "", error: "Unrecognized action" };
  }

  const isApproved = action === "y";
  const supabase = createAdminClient();

  // Find the pending approval for this message
  const { data: approval, error: findError } = await supabase
    .from("telegram_approval_requests")
    .select("id, task_id, approval_level, requester")
    .eq("message_id", messageId)
    .eq("status", "pending")
    .maybeSingle();

  if (findError || !approval) {
    await answerTelegramCallback(
      callbackQueryId,
      "Richiesta non trovata o gia' gestita"
    );
    return {
      success: false,
      action: isApproved ? "approved" : "rejected",
      taskId: "",
      error: "Approval request not found or already handled",
    };
  }

  const now = new Date().toISOString();

  // Update approval status
  const { error: updateError } = await supabase
    .from("telegram_approval_requests")
    .update({
      status: isApproved ? "approved" : "rejected",
      decided_by: "boss",
      decided_at: now,
    })
    .eq("id", approval.id);

  if (updateError) {
    console.error("[approval-telegram] Failed to update approval:", updateError.message);
    await answerTelegramCallback(callbackQueryId, "Errore nel salvataggio");
    return {
      success: false,
      action: isApproved ? "approved" : "rejected",
      taskId: approval.task_id,
      error: updateError.message,
    };
  }

  // Update task status based on decision
  const taskUpdate = isApproved
    ? { status: "open" }       // Approved → re-open for execution
    : { status: "blocked", result_summary: "Rejected by boss via Telegram" };

  await supabase
    .from("company_tasks")
    .update(taskUpdate)
    .eq("id", approval.task_id);

  // Edit Telegram message to show outcome (remove buttons)
  const outcomeEmoji = isApproved ? "\u2705" : "\u274C";
  const outcomeText = isApproved ? "APPROVATO" : "RIFIUTATO";

  try {
    await editTelegramMessage(
      messageId,
      `${outcomeEmoji} <b>${outcomeText}</b>\n\nTask <code>${taskRef}</code> — ${outcomeText.toLowerCase()} dal boss.`
    );
  } catch (e) {
    // Non-critical: message edit can fail if message is too old
    console.warn("[approval-telegram] Failed to edit message:", e);
  }

  // Answer callback to clear loading indicator
  await answerTelegramCallback(
    callbackQueryId,
    isApproved ? "Approvato!" : "Rifiutato"
  );

  console.log(`[approval-telegram] Task ${taskRef} ${outcomeText} by boss`);

  return {
    success: true,
    action: isApproved ? "approved" : "rejected",
    taskId: approval.task_id,
  };
}

/**
 * Get pending approval requests, optionally filtered.
 */
export async function getPendingApprovals(filters?: {
  taskId?: string;
  approvalLevel?: string;
  limit?: number;
}): Promise<ApprovalRequest[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from("telegram_approval_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (filters?.taskId) {
    query = query.eq("task_id", filters.taskId);
  }
  if (filters?.approvalLevel) {
    query = query.eq("approval_level", filters.approvalLevel);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[approval-telegram] Failed to fetch pending approvals:", error.message);
    return [];
  }

  return (data ?? []) as ApprovalRequest[];
}

/**
 * Expire stale approval requests (older than expires_at).
 *
 * Updates status to 'expired', edits Telegram messages to indicate timeout.
 * Intended to be called from the daemon or a cron job.
 */
export async function expireStaleApprovals(): Promise<number> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Find expired pending approvals
  const { data: expired, error } = await supabase
    .from("telegram_approval_requests")
    .select("id, task_id, message_id")
    .eq("status", "pending")
    .lt("expires_at", now);

  if (error || !expired || expired.length === 0) {
    return 0;
  }

  // Batch update status
  const ids = expired.map((r) => r.id);
  await supabase
    .from("telegram_approval_requests")
    .update({ status: "expired", decided_at: now })
    .in("id", ids);

  // Update expired tasks back to "open" so they can be re-submitted
  const taskIds = expired.map((r) => r.task_id);
  await supabase
    .from("company_tasks")
    .update({ status: "open" })
    .in("id", taskIds);

  // Best-effort: edit Telegram messages for expired approvals
  if (isTelegramConfigured()) {
    for (const req of expired) {
      try {
        await editTelegramMessage(
          req.message_id,
          `\u23F0 <b>SCADUTO</b>\n\nRichiesta di approvazione scaduta (7 giorni senza risposta).`
        );
      } catch {
        // Non-critical
      }
    }
  }

  console.log(`[approval-telegram] Expired ${expired.length} stale approval(s)`);
  return expired.length;
}

// ─── Utils ───

/** Escape HTML special chars for Telegram HTML parse mode. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
