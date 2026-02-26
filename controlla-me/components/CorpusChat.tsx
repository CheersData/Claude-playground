"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, BookOpen, Sparkles, ExternalLink } from "lucide-react";
import Link from "next/link";

// ─── Types matching CorpusAgentResult ───

interface CitedArticle {
  id: string;
  reference: string;
  source: string;
  relevance: string;
}

interface CorpusResponse {
  answer: string;
  citedArticles: CitedArticle[];
  confidence: number;
  followUpQuestions: string[];
  provider: "gemini" | "haiku";
  articlesRetrieved: number;
  durationMs: number;
}

interface CorpusChatProps {
  variant?: "hero" | "purple";
  placeholder?: string;
}

const VARIANT_STYLES = {
  hero: {
    input:
      "flex-1 px-4 py-2.5 rounded-xl bg-background-secondary border border-border text-sm placeholder:text-foreground-tertiary focus:border-purple-300 focus:ring-2 focus:ring-purple-200/50 focus:outline-none transition-all",
    button:
      "px-4 py-2.5 rounded-xl bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
    articleBg: "bg-purple-50/60 border border-purple-100",
    articleRef: "text-purple-700",
    badge: "bg-purple-100 text-purple-600 border border-purple-200",
    followUp:
      "text-left text-sm px-3 py-2 rounded-lg bg-purple-50 border border-purple-100 text-purple-700 hover:bg-purple-100 transition-colors",
  },
  purple: {
    input:
      "flex-1 px-4 py-3 rounded-xl bg-white border border-[#A78BFA]/20 text-sm placeholder:text-foreground-tertiary focus:border-[#A78BFA]/50 focus:ring-2 focus:ring-[#A78BFA]/10 focus:outline-none transition-all",
    button:
      "px-5 py-3 rounded-xl bg-[#A78BFA] text-white text-sm font-semibold hover:bg-[#9575E8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
    articleBg: "bg-[#A78BFA]/5 border border-[#A78BFA]/15",
    articleRef: "text-[#A78BFA]",
    badge: "bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20",
    followUp:
      "text-left text-sm px-3 py-2 rounded-lg bg-[#A78BFA]/5 border border-[#A78BFA]/15 text-[#A78BFA] hover:bg-[#A78BFA]/10 transition-colors",
  },
};

export default function CorpusChat({
  variant = "hero",
  placeholder = "Chiedimi qualsiasi dubbio legale...",
}: CorpusChatProps) {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CorpusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const styles = VARIANT_STYLES[variant];

  const submitQuestion = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/corpus/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!res.ok) {
        const status = res.status;
        if (status === 503) {
          throw new Error("Servizio temporaneamente non disponibile.");
        } else if (status === 429) {
          throw new Error("Troppe richieste, riprova tra poco.");
        } else {
          const data = await res.json().catch(() => null);
          throw new Error(
            data?.error || "Si e' verificato un errore. Riprova."
          );
        }
      }

      const data: CorpusResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Si e' verificato un errore."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuestion(question);
  };

  const handleFollowUp = (followUp: string) => {
    setQuestion(followUp);
    submitQuestion(followUp);
  };

  return (
    <div className="space-y-4">
      {/* Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={placeholder}
          aria-label="Domanda sul corpus normativo"
          disabled={isLoading}
          className={styles.input}
        />
        <button
          type="submit"
          disabled={isLoading || !question.trim()}
          className={styles.button}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>

      {/* Error */}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* Answer */}
          <div className="text-sm leading-relaxed text-foreground-secondary whitespace-pre-line">
            {result.answer}
          </div>

          {/* Cited articles */}
          {result.citedArticles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-foreground-tertiary">
                Articoli citati
              </p>
              <div className="grid gap-2">
                {result.citedArticles.map((art, i) => (
                  <Link
                    key={art.id || i}
                    href={art.id ? `/corpus/article/${art.id}` : "/corpus"}
                    className={`block rounded-xl px-4 py-3 hover:scale-[1.01] transition-all ${styles.articleBg}`}
                  >
                    <div className="flex items-start gap-2">
                      <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p
                            className={`text-sm font-medium ${styles.articleRef}`}
                          >
                            {art.reference}
                          </p>
                          <ExternalLink className="w-3 h-3 opacity-40 shrink-0" />
                        </div>
                        <p className="text-xs text-foreground-tertiary mt-0.5">
                          {art.source}
                        </p>
                        {art.relevance && (
                          <p className="text-xs text-foreground-secondary mt-1">
                            {art.relevance}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Confidence + provider badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ${styles.badge}`}
            >
              <Sparkles className="w-3 h-3" />
              Confidenza {Math.round(result.confidence * 100)}%
            </span>
            <span className="text-[11px] text-foreground-tertiary">
              {result.provider === "gemini" ? "Gemini 2.5 Flash" : "Claude Haiku"} &middot;{" "}
              {result.articlesRetrieved} articoli consultati &middot;{" "}
              {(result.durationMs / 1000).toFixed(1)}s
            </span>
          </div>

          {/* Follow-up questions */}
          {result.followUpQuestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-foreground-tertiary">
                Approfondisci
              </p>
              <div className="flex flex-col gap-1.5">
                {result.followUpQuestions.map((fq, i) => (
                  <button
                    key={i}
                    onClick={() => handleFollowUp(fq)}
                    className={styles.followUp}
                  >
                    {fq}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
