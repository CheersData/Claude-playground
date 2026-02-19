"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, ExternalLink } from "lucide-react";

interface DeepSearchChatProps {
  clauseContext: string;
  existingAnalysis: string;
  analysisId?: string;
}

interface SearchResult {
  response: string;
  sources: Array<{ url: string; title: string; excerpt: string }>;
}

export default function DeepSearchChat({
  clauseContext,
  existingAnalysis,
  analysisId,
}: DeepSearchChatProps) {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/deep-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clauseContext,
          existingAnalysis,
          userQuestion: question,
          analysisId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore durante la ricerca");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore durante la ricerca"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Fai una domanda su questo punto..."
          disabled={isLoading}
          className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-accent/40 transition-colors"
        />
        <button
          type="submit"
          disabled={isLoading || !question.trim()}
          className="px-4 py-2.5 rounded-xl bg-accent/20 border border-accent/30 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <p className="text-sm leading-relaxed text-white/70">
            {result.response}
          </p>

          {result.sources && result.sources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold tracking-wider uppercase text-white/30">
                Fonti
              </p>
              {result.sources.map((source, i) => (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-accent/70 hover:text-accent transition-colors"
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{source.title}</span>
                </a>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
