/**
 * POST /api/studia/ask — Q&A medica per studia.me
 *
 * Stesso pattern di /api/corpus/ask ma con:
 * - System prompt medico (MEDICAL_CORPUS_SYSTEM_PROMPT)
 * - Retrieval dal corpus medico (vertical='medical')
 * - Embedding model voyage-3
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCsrf } from "@/lib/middleware/csrf";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sanitizeUserQuestion } from "@/lib/middleware/sanitize";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { isVectorDBEnabled } from "@/lib/embeddings";
import { MEDICAL_CORPUS_SYSTEM_PROMPT } from "@/lib/prompts/medical-corpus-agent";
import { MEDICAL_QUESTION_PREP_SYSTEM_PROMPT } from "@/lib/prompts/medical-question-prep";
import {
  searchMedicalArticles,
  searchMedicalKnowledge,
} from "@/lib/medical-corpus";
import { runAgent } from "@/lib/ai-sdk/agent-runner";
import { generate } from "@/lib/ai-sdk/generate";
import { parseAgentJSON } from "@/lib/anthropic";
import { broadcastConsoleAgent } from "@/lib/agent-broadcast";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // ── Security stack ──
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  const userId = isAuthError(auth) ? null : auth.user.id;

  const limited = await checkRateLimit(req, userId ?? undefined);
  if (limited) return limited;

  if (!isVectorDBEnabled()) {
    return NextResponse.json(
      { error: "Vector DB non configurato (VOYAGE_API_KEY mancante)" },
      { status: 503 }
    );
  }

  // ── Parse request ──
  let body: { question?: string; config?: { provider?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }

  const rawQuestion = body.question?.trim();
  if (!rawQuestion || rawQuestion.length < 5 || rawQuestion.length > 2000) {
    return NextResponse.json(
      { error: "Domanda deve essere tra 5 e 2000 caratteri" },
      { status: 400 }
    );
  }

  const question = sanitizeUserQuestion(rawQuestion);

  const provider = body.config?.provider ?? "auto";
  if (!["auto", "gemini", "haiku"].includes(provider)) {
    return NextResponse.json(
      { error: "Provider non valido. Usa: auto, gemini, haiku" },
      { status: 400 }
    );
  }

  const start = Date.now();

  try {
    // ── Step 1: Question Prep (riformulazione in linguaggio medico) ──
    let medicalQuery = question;
    try {
      broadcastConsoleAgent("medical-question-prep", "running", { task: "Riformulazione domanda medica" });
      const prepResult = await runAgent<{
        medicalQuery: string;
        keywords: string[];
        medicalAreas: string[];
        suggestedTopics: string[];
      }>("question-prep", question, {
        systemPrompt: MEDICAL_QUESTION_PREP_SYSTEM_PROMPT,
        maxTokens: 2048,
      });
      medicalQuery = prepResult.parsed.medicalQuery || question;
      broadcastConsoleAgent("medical-question-prep", "done", { task: "Domanda medica riformulata" });
      console.log(
        `[STUDIA-ASK] question-prep: "${question}" → "${medicalQuery}"`
      );
    } catch (err) {
      broadcastConsoleAgent("medical-question-prep", "error", { task: "Errore riformulazione" });
      console.warn("[STUDIA-ASK] question-prep fallito, uso domanda originale:", err);
    }

    // ── Step 2: Retrieval (articoli + knowledge dal corpus medico) ──
    const [articles, knowledge] = await Promise.all([
      searchMedicalArticles(medicalQuery, { threshold: 0.35, limit: 8 }),
      searchMedicalKnowledge(medicalQuery, { threshold: 0.4, limit: 4 }),
    ]);

    console.log(
      `[STUDIA-ASK] retrieval: ${articles.length} articoli, ${knowledge.length} knowledge`
    );

    if (articles.length === 0 && knowledge.length === 0) {
      return NextResponse.json({
        answer: "Non ho trovato fonti pertinenti nel corpus medico per questa domanda. Prova a riformulare con termini medici più specifici.",
        citedArticles: [],
        confidence: 0,
        followUpQuestions: [],
        provider: "none",
        articlesRetrieved: 0,
        durationMs: Date.now() - start,
      });
    }

    // ── Step 3: Build context ──
    let context = "══ FONTI MEDICHE ══\n\n";
    for (const art of articles) {
      const sim = art.similarity ? `(pertinenza: ${Math.round((art.similarity ?? 0) * 100)}%)` : "";
      context += `[ID: ${art.id}] ${art.law_source} — ${art.article_reference}`;
      if (art.article_title) context += ` — ${art.article_title}`;
      context += ` ${sim}\n`;
      context += `${art.article_text}\n\n`;
    }

    if (knowledge.length > 0) {
      context += "══ CONOSCENZA MEDICA ══\n\n";
      for (const k of knowledge) {
        const sim = k.similarity ? `(pertinenza: ${Math.round(k.similarity * 100)}%)` : "";
        context += `[${k.category}] ${k.source_ref} ${sim}\n`;
        context += `${k.content}\n\n`;
      }
    }

    const llmPrompt = `CONTESTO:\n${context}\n\nDOMANDA ORIGINALE: ${question}\n\nRispondi alla domanda usando le fonti nel contesto.`;

    // ── Step 4: LLM call ──
    interface MedicalResponse {
      answer: string;
      citedArticles: Array<{
        id: string;
        reference: string;
        source: string;
        relevance: string;
      }>;
      confidence: number;
      followUpQuestions: string[];
      evidenceLevel: string;
      missingArticles?: string[];
    }

    let parsed: MedicalResponse;
    let usedProvider: string;

    broadcastConsoleAgent("medical-corpus-agent", "running", { task: "Ricerca corpus medico" });

    if (provider === "haiku") {
      const result = await generate("claude-haiku-4.5", llmPrompt, {
        systemPrompt: MEDICAL_CORPUS_SYSTEM_PROMPT,
        maxTokens: 4096,
        temperature: 0.2,
        jsonOutput: true,
        agentName: "MEDICAL-CORPUS",
      });
      parsed = parseAgentJSON<MedicalResponse>(result.text);
      usedProvider = "anthropic";
    } else if (provider === "gemini") {
      const result = await generate("gemini-2.5-flash", llmPrompt, {
        systemPrompt: MEDICAL_CORPUS_SYSTEM_PROMPT,
        maxTokens: 4096,
        temperature: 0.2,
        jsonOutput: true,
        agentName: "MEDICAL-CORPUS",
      });
      parsed = parseAgentJSON<MedicalResponse>(result.text);
      usedProvider = "gemini";
    } else {
      // Auto: usa fallback chain con system prompt medico
      const result = await runAgent<MedicalResponse>("corpus-agent", llmPrompt, {
        systemPrompt: MEDICAL_CORPUS_SYSTEM_PROMPT,
        maxTokens: 4096,
        temperature: 0.2,
      });
      parsed = result.parsed;
      usedProvider = result.provider;
    }

    broadcastConsoleAgent("medical-corpus-agent", "done", {
      task: `Risposta medica (confidence: ${((parsed.confidence || 0) * 100).toFixed(0)}%)`,
    });

    const durationMs = Date.now() - start;
    console.log(
      `[STUDIA-ASK] risposta in ${(durationMs / 1000).toFixed(1)}s | provider: ${usedProvider} | confidence: ${parsed.confidence}`
    );

    return NextResponse.json({
      answer: parsed.answer,
      citedArticles: parsed.citedArticles ?? [],
      confidence: parsed.confidence ?? 0,
      followUpQuestions: parsed.followUpQuestions ?? [],
      evidenceLevel: parsed.evidenceLevel ?? "textbook",
      missingArticles: parsed.missingArticles ?? [],
      provider: usedProvider,
      articlesRetrieved: articles.length,
      durationMs,
    });
  } catch (err) {
    broadcastConsoleAgent("medical-question-prep", "error", { task: "Errore" });
    broadcastConsoleAgent("medical-corpus-agent", "error", { task: "Errore" });
    console.error("[STUDIA-ASK] Errore:", err);
    return NextResponse.json(
      { error: "Errore interno durante l'elaborazione della domanda medica" },
      { status: 500 }
    );
  }
}
