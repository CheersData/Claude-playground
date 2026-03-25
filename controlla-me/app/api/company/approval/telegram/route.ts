/**
 * Telegram Approval Webhook — POST /api/company/approval/telegram
 *
 * Receives Telegram webhook updates (callback_query from inline keyboard)
 * and processes approval/rejection of L3/L4 tasks.
 *
 * Setup (manual, one-time by boss):
 *   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://controlla.me/api/company/approval/telegram
 *
 * Security:
 * - Validates callback comes from configured TELEGRAM_CHAT_ID
 * - Rate limited (30 req/min) to prevent abuse
 * - No CSRF check needed (Telegram server-to-server, no browser Origin)
 * - No console auth needed (Telegram webhook, authenticated by chat_id match)
 */

import { NextRequest, NextResponse } from "next/server";
import { handleApprovalCallback } from "@/lib/company/approval-telegram";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

interface TelegramWebhookUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    message?: {
      message_id: number;
      chat?: { id: number };
    };
    data?: string;
  };
}

export async function POST(req: NextRequest) {
  // Rate limit: 30 requests per minute (configured in RATE_LIMITS)
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // Parse body
  let update: TelegramWebhookUpdate;
  try {
    update = (await req.json()) as TelegramWebhookUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // We only handle callback_query (button presses)
  const cq = update.callback_query;
  if (!cq) {
    // Not a callback query — acknowledge and ignore (Telegram sends other update types too)
    return NextResponse.json({ ok: true });
  }

  // Validate required fields
  if (!cq.id || !cq.data || !cq.message?.message_id) {
    return NextResponse.json({ error: "Incomplete callback query" }, { status: 400 });
  }

  // Validate the callback comes from the configured chat
  const configuredChatId = process.env.TELEGRAM_CHAT_ID;
  if (!configuredChatId) {
    console.error("[tg-webhook] TELEGRAM_CHAT_ID not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const messageChatId = cq.message.chat?.id;
  if (!messageChatId || String(messageChatId) !== configuredChatId) {
    console.warn(
      `[tg-webhook] Rejected callback from unauthorized chat: ${messageChatId} (expected ${configuredChatId})`
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Process the approval callback
  try {
    const result = await handleApprovalCallback(
      cq.id,
      cq.message.message_id,
      cq.data
    );

    return NextResponse.json({
      ok: result.success,
      action: result.action,
      taskId: result.taskId,
      error: result.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[tg-webhook] Error handling approval callback:", message);
    // Return 200 to Telegram to prevent retries on application errors
    return NextResponse.json({ ok: false, error: message });
  }
}
