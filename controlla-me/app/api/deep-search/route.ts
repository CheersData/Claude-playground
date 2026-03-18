/**
 * POST /api/deep-search — Deep search conversazionale su clausola.
 *
 * Accetta: { clauseContext, existingAnalysis, userQuestion, analysisId, clauseTitle?, conversationId? }
 * Ritorna: { conversationId, response, sources, question, analysisId, messageId }
 *
 * Se conversationId è assente, crea una nuova conversazione.
 * Carica la cronologia dei messaggi precedenti e la passa all'investigator
 * per fornire risposte con memoria.
 *
 * GET /api/deep-search?analysisId=...&clauseTitle=... — Carica conversazione esistente per una clausola.
 * GET /api/deep-search?conversationId=... — Carica messaggi di una conversazione specifica.
 */

import { NextRequest, NextResponse } from "next/server";
import { runDeepSearch } from "@/lib/agents/investigator";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sanitizeUserQuestion } from "@/lib/middleware/sanitize";
import { checkCsrf } from "@/lib/middleware/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastConsoleAgent } from "@/lib/agent-broadcast";
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
      clauseContext,
      existingAnalysis,
      userQuestion,
      analysisId,
      clauseTitle,
      conversationId,
    } = body;

    if (!userQuestion || !userQuestion.trim()) {
      return NextResponse.json(
        { error: "Domanda non fornita" },
        { status: 400 }
      );
    }

    const sanitizedQuestion = sanitizeUserQuestion(userQuestion);

    const supabase = createAdminClient();

    // ─── 1. Gestisci conversazione ───
    let activeConversationId = conversationId as string | undefined;

    if (!activeConversationId) {
      // Cerca conversazione esistente per questa clausola + analisi
      if (analysisId && clauseTitle) {
        const { data: existingConv } = await supabase
          .from("deep_search_conversations")
          .select("id")
          .eq("analysis_id", analysisId)
          .eq("clause_title", clauseTitle)
          .eq("user_id", auth.user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .single();

        if (existingConv) {
          activeConversationId = existingConv.id;
        }
      }

      // Se non trovata, crea nuova conversazione
      if (!activeConversationId && analysisId) {
        const { data: newConv, error: convError } = await supabase
          .from("deep_search_conversations")
          .insert({
            user_id: auth.user.id,
            analysis_id: analysisId,
            clause_title: clauseTitle || "Clausola",
            clause_context: `${clauseContext || ""}\n\n${existingAnalysis || ""}`.trim() || null,
          })
          .select("id")
          .single();

        if (convError || !newConv) {
          console.error("[DEEP-SEARCH] Failed to create conversation:", convError);
          // Non-fatal: proceed without conversation tracking
        } else {
          activeConversationId = newConv.id;
        }
      }
    } else {
      // Verifica che la conversazione esista e appartenga all'utente
      const { data: existingConv } = await supabase
        .from("deep_search_conversations")
        .select("id")
        .eq("id", activeConversationId)
        .eq("user_id", auth.user.id)
        .single();

      if (!existingConv) {
        return NextResponse.json(
          { error: "Conversazione non trovata" },
          { status: 404 }
        );
      }
    }

    // ─── 2. Carica cronologia messaggi ───
    let conversationHistory: Array<{ role: string; content: string }> = [];

    if (activeConversationId) {
      const { data: previousMessages } = await supabase
        .from("deep_search_messages")
        .select("role, content")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true })
        .limit(20); // Max 20 messaggi di contesto (10 turni)

      conversationHistory = (previousMessages || []).map((m) => ({
        role: m.role as string,
        content: m.content as string,
      }));
    }

    // ─── 3. Salva messaggio utente ───
    let userMsgId: string | null = null;
    if (activeConversationId) {
      const { data: userMsg } = await supabase
        .from("deep_search_messages")
        .insert({
          conversation_id: activeConversationId,
          role: "user",
          content: sanitizedQuestion,
        })
        .select("id")
        .single();
      userMsgId = userMsg?.id || null;
    }

    // ─── 4. Chiama investigator con contesto conversazione ───
    broadcastConsoleAgent("investigator", "running", {
      task: `Deep search: ${sanitizedQuestion.slice(0, 60)}`,
    });

    const startTime = Date.now();

    const result = await runDeepSearch(
      clauseContext || "",
      existingAnalysis || "",
      sanitizedQuestion,
      conversationHistory.length > 0 ? conversationHistory : undefined
    );

    const durationMs = Date.now() - startTime;

    broadcastConsoleAgent("investigator", "done", {
      task: `${result.sources?.length ?? 0} fonti trovate`,
    });

    // ─── 5. Salva risposta assistant ───
    let assistantMsgId: string | null = null;
    if (activeConversationId) {
      const { data: assistantMsg } = await supabase
        .from("deep_search_messages")
        .insert({
          conversation_id: activeConversationId,
          role: "assistant",
          content: result.response || "Non sono riuscito a elaborare una risposta.",
          sources: result.sources ?? null,
          metadata: { durationMs },
        })
        .select("id")
        .single();
      assistantMsgId = assistantMsg?.id || null;
    }

    // ─── 6. Persist to legacy deep_searches table (backward compat) ───
    if (analysisId) {
      try {
        await supabase.from("deep_searches").insert({
          analysis_id: analysisId,
          user_question: sanitizedQuestion,
          agent_response: result,
          sources: result.sources ?? [],
        });
      } catch {
        // Non-critical — response still returns to user
        console.error("[DEEP-SEARCH] Failed to persist to deep_searches");
      }
    }

    // Fire-and-forget CDP event recording
    if (auth.user.id) {
      try {
        recordProfileEvent(auth.user.id, "deep_search_performed", {
          analysis_id: analysisId || null,
          question: sanitizedQuestion,
          sources_count: result.sources?.length || 0,
          conversation_id: activeConversationId || null,
        }).catch((err) => console.error("[CDP] Failed:", err));
      } catch (err) {
        console.error("[CDP] Failed:", err);
      }
    }

    console.log(
      `[DEEP-SEARCH] ${durationMs}ms | conv: ${activeConversationId || "none"} | msg: ${userMsgId} -> ${assistantMsgId} | history: ${conversationHistory.length} msgs`
    );

    return NextResponse.json({
      conversationId: activeConversationId || null,
      analysisId,
      question: sanitizedQuestion,
      messageId: assistantMsgId,
      ...result,
    });
  } catch (error) {
    broadcastConsoleAgent("investigator", "error", { task: "Deep search fallita" });
    const message =
      error instanceof Error ? error.message : "Errore durante la ricerca";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/deep-search — Carica conversazione e messaggi.
 *
 * Query params:
 * - conversationId: carica messaggi di una conversazione specifica
 * - analysisId + clauseTitle: trova conversazione per clausola specifica
 * - analysisId: lista tutte le conversazioni deep search per un'analisi
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
  const clauseTitle = req.nextUrl.searchParams.get("clauseTitle");

  const supabase = createAdminClient();

  // Case 1: Load messages for a specific conversation
  if (conversationId) {
    // Verify ownership
    const { data: conv } = await supabase
      .from("deep_search_conversations")
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
      .from("deep_search_messages")
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

  // Case 2: Find conversation for a specific clause
  if (analysisId && clauseTitle) {
    const { data: conv } = await supabase
      .from("deep_search_conversations")
      .select("id, clause_title, message_count, created_at, updated_at")
      .eq("analysis_id", analysisId)
      .eq("clause_title", clauseTitle)
      .eq("user_id", auth.user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (!conv) {
      return NextResponse.json({ conversation: null, messages: [] });
    }

    // Load messages
    const { data: messages } = await supabase
      .from("deep_search_messages")
      .select("id, role, content, sources, metadata, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      conversation: conv,
      conversationId: conv.id,
      messages: messages || [],
    });
  }

  // Case 3: List all conversations for an analysis
  if (analysisId) {
    const { data: conversations, error } = await supabase
      .from("deep_search_conversations")
      .select("id, clause_title, message_count, created_at, updated_at")
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
    { error: "Specificare analysisId, clauseTitle o conversationId" },
    { status: 400 }
  );
}
