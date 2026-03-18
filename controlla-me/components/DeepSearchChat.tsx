"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  ExternalLink,
  Clock,
  RotateCcw,
} from "lucide-react";

// ─── Types ───

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ url: string; title: string; excerpt: string }>;
  durationMs?: number;
  createdAt: string;
}

interface DeepSearchChatProps {
  clauseContext: string;
  existingAnalysis: string;
  analysisId?: string;
  clauseTitle?: string;
}

// ─── Component ───

export default function DeepSearchChat({
  clauseContext,
  existingAnalysis,
  analysisId,
  clauseTitle,
}: DeepSearchChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load existing conversation on mount (if analysisId + clauseTitle)
  useEffect(() => {
    if (!analysisId || !clauseTitle) return;

    let cancelled = false;

    async function loadExisting() {
      setIsLoadingHistory(true);
      try {
        const res = await fetch(
          `/api/deep-search?analysisId=${encodeURIComponent(analysisId!)}&clauseTitle=${encodeURIComponent(clauseTitle!)}`
        );
        if (!res.ok) return;
        const data = await res.json();

        if (cancelled) return;

        if (data.conversationId && data.messages?.length > 0) {
          setConversationId(data.conversationId);
          setMessages(
            data.messages.map((m: Record<string, unknown>) => ({
              id: m.id as string,
              role: m.role as "user" | "assistant",
              content: m.content as string,
              sources: m.sources as Array<{ url: string; title: string; excerpt: string }> | undefined,
              durationMs: (m.metadata as Record<string, unknown>)?.durationMs as number | undefined,
              createdAt: m.created_at as string,
            }))
          );
        }
      } catch {
        // Silently fail — no existing conversation is fine
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    }

    loadExisting();
    return () => { cancelled = true; };
  }, [analysisId, clauseTitle]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isLoading) return;

      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: messageText.trim(),
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/deep-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clauseContext,
            existingAnalysis,
            userQuestion: messageText.trim(),
            analysisId,
            clauseTitle,
            conversationId,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Errore durante la ricerca");
        }

        // Update conversation ID if new
        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId);
        }

        const assistantMessage: Message = {
          id: data.messageId || `resp-${Date.now()}`,
          role: "assistant",
          content: data.response,
          sources: data.sources,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Errore durante la ricerca"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [clauseContext, existingAnalysis, analysisId, clauseTitle, conversationId, isLoading]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    inputRef.current?.focus();
  };

  // Loading history skeleton
  if (isLoadingHistory) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-foreground-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Caricamento conversazione...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Message history */}
      {messages.length > 0 && (
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                }`}
                style={
                  msg.role === "user"
                    ? { background: "var(--accent)", color: "white" }
                    : {
                        background: "color-mix(in srgb, var(--background) 60%, var(--card-bg))",
                        border: "1px solid var(--card-border)",
                        color: "var(--foreground-secondary)",
                      }
                }
              >
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {msg.content}
                </p>

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-current/10 space-y-1">
                    <p className="text-[10px] font-semibold tracking-wider uppercase opacity-60">
                      Fonti
                    </p>
                    {msg.sources.map((source, i) => (
                      <a
                        key={i}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{source.title}</span>
                      </a>
                    ))}
                  </div>
                )}

                {/* Duration metadata */}
                {msg.role === "assistant" && msg.durationMs && (
                  <div className="mt-1.5 flex items-center gap-1 opacity-40">
                    <Clock className="w-3 h-3" />
                    <span className="text-[10px]">
                      {(msg.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {/* Loading indicator */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-start"
              >
                <div
                  className="rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2"
                  style={{
                    background: "color-mix(in srgb, var(--background) 60%, var(--card-bg))",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    style={{ color: "var(--accent)" }}
                  />
                  <span className="text-xs text-foreground-tertiary">
                    Cerco norme e sentenze...
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            messages.length === 0
              ? "Fai una domanda su questo punto..."
              : "Fai una domanda di approfondimento..."
          }
          aria-label="Domanda sulla clausola"
          disabled={isLoading}
          className="flex-1 px-4 py-2.5 rounded-xl bg-white shadow-sm border border-border text-sm text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/30 focus:ring-offset-1 transition-colors"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2.5 rounded-xl bg-accent/20 border border-accent/30 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading && messages.length === 0 ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleNewConversation}
            className="px-3 py-2.5 rounded-xl border border-border text-foreground-tertiary hover:text-foreground transition-colors"
            title="Nuova conversazione"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </form>

      {/* Conversation indicator */}
      {messages.length > 0 && (
        <p className="text-[10px] text-foreground-tertiary text-center">
          {messages.filter((m) => m.role === "user").length} domande in questa conversazione
        </p>
      )}
    </div>
  );
}
