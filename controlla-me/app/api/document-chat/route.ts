/**
 * POST /api/document-chat — Chat conversazionale su documento analizzato.
 * GET  /api/document-chat — Carica conversazioni e messaggi esistenti.
 *
 * POST Input: { analysisId, message, conversationId?, conversationHistory[] }
 * POST Output: { response, analysisId, conversationId, messageId, durationMs, usedModel, followUpSuggestions }
 *
 * GET Query params:
 * - conversationId: carica messaggi di una conversazione specifica
 * - analysisId: lista tutte le conversazioni document-chat per un'analisi
 *
 * - Carica l'analisi e il testo originale da Supabase
 * - Esegue il document-chat agent con memoria
 * - Persiste i messaggi in document_conversations + document_messages
 * - Ritorna la risposta JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { runDocumentChat } from "@/lib/agents/document-chat";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sanitizeUserQuestion } from "@/lib/middleware/sanitize";
import { checkCsrf } from "@/lib/middleware/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordProfileEvent } from "@/lib/cdp/profile-builder";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // CSRF
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  // Auth
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Rate limit
  const limited = await checkRateLimit(req, auth.user.id);
  if (limited) return limited;

  try {
    const body = await req.json();
    const {
      analysisId,
      message,
      conversationId: clientConversationId,
      conversationHistory,
    } = body;

    if (!analysisId) {
      return NextResponse.json(
        { error: "analysisId non fornito" },
        { status: 400 }
      );
    }

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "Messaggio non fornito" },
        { status: 400 }
      );
    }

    const sanitizedMessage = sanitizeUserQuestion(message);
    const supabase = createAdminClient();

    // ─── 1. Carica l'analisi ───
    const { data: analysis, error: analysisError } = await supabase
      .from("analyses")
      .select(
        "id, user_id, file_name, file_url, document_type, classification, analysis, investigation, advice, fairness_score"
      )
      .eq("id", analysisId)
      .eq("user_id", auth.user.id)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json(
        { error: "Analisi non trovata" },
        { status: 404 }
      );
    }

    // ─── 2. Gestisci conversazione (persist) ───
    let conversationId = clientConversationId as string | undefined;

    if (!conversationId) {
      // Cerca conversazione esistente per questa analisi
      const { data: existingConv } = await supabase
        .from("document_conversations")
        .select("id")
        .eq("analysis_id", analysisId)
        .eq("user_id", auth.user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        // Crea nuova conversazione
        const { data: newConv } = await supabase
          .from("document_conversations")
          .insert({
            user_id: auth.user.id,
            analysis_id: analysisId,
            title: sanitizedMessage.slice(0, 80),
          })
          .select("id")
          .single();

        conversationId = newConv?.id || undefined;
      }
    }

    // ─── 3. Salva messaggio utente ───
    let userMsgId: string | null = null;
    if (conversationId) {
      const { data: userMsg } = await supabase
        .from("document_messages")
        .insert({
          conversation_id: conversationId,
          role: "user",
          content: sanitizedMessage,
        })
        .select("id")
        .single();
      userMsgId = userMsg?.id || null;
    }

    // ─── 4. Carica il testo del documento originale ───
    let documentText = "";

    if (analysis.file_url) {
      try {
        const { data: fileData } = await supabase.storage
          .from("documents")
          .download(analysis.file_url);

        if (fileData) {
          documentText = await fileData.text();
        }
      } catch (err) {
        console.error("[DOCUMENT-CHAT] Errore nel recupero del file:", err);
      }
    }

    // ─── 5. Preparare la cronologia ───
    const history: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(conversationHistory)
      ? conversationHistory.map((msg: Record<string, unknown>) => ({
          role: ((msg.role as string) === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: (msg.content as string) || "",
        }))
      : [];

    // ─── 6. Esegui document-chat agent ───
    const chatResult = await runDocumentChat({
      analysisId,
      documentText,
      fileName: analysis.file_name || "Documento",
      analysis: {
        id: analysis.id,
        user_id: analysis.user_id,
        file_name: analysis.file_name,
        file_url: analysis.file_url || undefined,
        document_type: analysis.document_type,
        status: "completed",
        classification: analysis.classification as never,
        analysis: analysis.analysis as never,
        investigation: analysis.investigation as never,
        advice: analysis.advice as never,
        fairness_score: analysis.fairness_score,
        summary: "",
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
      userQuestion: sanitizedMessage,
      conversationHistory: history,
    });

    // ─── 7. Salva risposta assistant ───
    let assistantMsgId: string | null = null;
    if (conversationId) {
      const { data: assistantMsg } = await supabase
        .from("document_messages")
        .insert({
          conversation_id: conversationId,
          role: "assistant",
          content: chatResult.response,
          metadata: {
            durationMs: chatResult.durationMs,
            provider: chatResult.usedModel,
          },
        })
        .select("id")
        .single();
      assistantMsgId = assistantMsg?.id || null;
    }

    // ─── 8. Fire-and-forget CDP event recording ───
    if (auth.user.id) {
      recordProfileEvent(auth.user.id, "document_chat_message", {
        analysis_id: analysisId,
        conversation_id: conversationId || null,
        message_length: sanitizedMessage.length,
        history_length: history.length,
        duration_ms: chatResult.durationMs,
      }).catch((err) => console.error("[CDP] Failed:", err));
    }

    console.log(
      `[DOCUMENT-CHAT] ${chatResult.durationMs}ms | conv: ${conversationId || "none"} | msg: ${userMsgId} -> ${assistantMsgId} | model: ${chatResult.usedModel} | message: ${sanitizedMessage.slice(0, 50)}...`
    );

    return NextResponse.json({
      analysisId,
      conversationId: conversationId || null,
      messageId: assistantMsgId,
      response: chatResult.response,
      durationMs: chatResult.durationMs,
      usedModel: chatResult.usedModel,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore durante la conversazione";
    console.error("[DOCUMENT-CHAT] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/document-chat — Carica conversazioni e messaggi.
 *
 * Query params:
 * - conversationId: carica messaggi di una conversazione specifica
 * - analysisId: lista tutte le conversazioni document-chat per un'analisi
 */
export async function GET(req: NextRequest) {
  // Auth
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Rate limit
  const limited = await checkRateLimit(req, auth.user.id);
  if (limited) return limited;

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const analysisId = req.nextUrl.searchParams.get("analysisId");

  const supabase = createAdminClient();

  // Case 1: Load messages for a specific conversation
  if (conversationId) {
    // Verify ownership
    const { data: conv } = await supabase
      .from("document_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", auth.user.id)
      .single();

    if (!conv) {
      return NextResponse.json(
        { error: "Conversazione non trovata" },
        { status: 404 }
      );
    }

    const { data: messages, error } = await supabase
      .from("document_messages")
      .select("id, role, content, sources, metadata, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Errore nel caricamento messaggi" },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversationId, messages: messages || [] });
  }

  // Case 2: List all conversations for an analysis
  if (analysisId) {
    const { data: conversations, error } = await supabase
      .from("document_conversations")
      .select("id, title, message_count, created_at, updated_at")
      .eq("analysis_id", analysisId)
      .eq("user_id", auth.user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Errore nel caricamento conversazioni" },
        { status: 500 }
      );
    }

    return NextResponse.json({ analysisId, conversations: conversations || [] });
  }

  return NextResponse.json(
    { error: "Specificare analysisId o conversationId" },
    { status: 400 }
  );
}
