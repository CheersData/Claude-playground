"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  MessageCircle,
  ChevronDown,
  Clock,
  Sparkles,
  RotateCcw,
} from "lucide-react";

// ─── Types ───

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citedArticles?: string[];
  durationMs?: number;
  provider?: string;
  createdAt: string;
}

interface DocumentChatProps {
  analysisId: string;
  analysisData: {
    summary?: string;
    risks?: Array<{ title: string; detail: string; severity: string; legalBasis?: string }>;
    fairnessScore?: number;
    fileName?: string;
  };
}

// ─── Component ───

export default function DocumentChat({
  analysisId,
  analysisData,
}: DocumentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    }
  }, [isExpanded]);

  // Load existing conversation on mount
  useEffect(() => {
    async function loadExisting() {
      try {
        const res = await fetch(
          `/api/document-chat?analysisId=${analysisId}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.conversations?.length > 0) {
          const latest = data.conversations[0];
          setConversationId(latest.id);
          // Load messages
          const msgRes = await fetch(
            `/api/document-chat?conversationId=${latest.id}`
          );
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            if (msgData.messages?.length > 0) {
              setMessages(
                msgData.messages.map((m: Record<string, unknown>) => ({
                  id: m.id as string,
                  role: m.role as "user" | "assistant",
                  content: m.content as string,
                  citedArticles: (m.sources as Array<{ title: string }> | null)?.map(
                    (s) => s.title
                  ),
                  durationMs: (m.metadata as Record<string, unknown>)
                    ?.durationMs as number,
                  provider: (m.metadata as Record<string, unknown>)
                    ?.provider as string,
                  createdAt: m.created_at as string,
                }))
              );
              setIsExpanded(true);
            }
          }
        }
      } catch {
        // Silently fail — no existing conversation is fine
      }
    }
    loadExisting();
  }, [analysisId]);

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
      setFollowUpSuggestions([]);

      try {
        // Invia la cronologia conversazione per dare memoria all'agente
        const historyForApi = [...messages, userMessage]
          .filter((m) => m.content.trim())
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/document-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId,
            message: messageText.trim(),
            conversationId,
            conversationHistory: historyForApi,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Errore durante la conversazione");
        }

        // Update conversation ID if new
        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId);
        }

        const assistantMessage: Message = {
          id: data.messageId || `resp-${Date.now()}`,
          role: "assistant",
          content: data.response,
          citedArticles: data.citedArticles,
          durationMs: data.durationMs,
          provider: data.provider,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setFollowUpSuggestions(data.followUpSuggestions || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Errore durante la conversazione"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [analysisId, conversationId, isLoading]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleFollowUp = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setFollowUpSuggestions([]);
    setError(null);
    inputRef.current?.focus();
  };

  // ─── Suggested first questions based on analysis ───
  const initialSuggestions = getInitialSuggestions(analysisData);

  return (
    <div className="space-y-3">
      {/* Header — click to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle
            className="w-5 h-5"
            style={{ color: "var(--accent)" }}
          />
          <span className="text-sm font-semibold text-[var(--foreground)]">
            Chatta con il tuo documento
          </span>
          {messages.length > 0 && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{
                background: "var(--accent-surface)",
                color: "var(--accent)",
              }}
            >
              {messages.length} messaggi
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[var(--foreground-tertiary)] transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Messages area */}
            <div
              className="rounded-xl p-4 space-y-4 max-h-[400px] overflow-y-auto"
              style={{
                background:
                  "color-mix(in srgb, var(--background) 50%, var(--card-bg))",
                border: "1px solid var(--card-border)",
              }}
            >
              {/* Empty state — show suggestions */}
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--foreground-tertiary)] text-center">
                    Fai una domanda sul documento analizzato. Ho memoria della
                    conversazione.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {initialSuggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          sendMessage(suggestion);
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-[1.02]"
                        style={{
                          background: "var(--accent-surface)",
                          color: "var(--accent)",
                          border:
                            "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message list */}
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                    }`}
                    style={
                      msg.role === "user"
                        ? {
                            background: "var(--accent)",
                            color: "white",
                          }
                        : {
                            background: "var(--card-bg)",
                            border: "1px solid var(--card-border)",
                            color: "var(--foreground-secondary)",
                          }
                    }
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {msg.content}
                    </p>

                    {/* Cited articles */}
                    {msg.citedArticles && msg.citedArticles.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-1">
                        {msg.citedArticles
                          .filter((a) => a && a.trim())
                          .map((article, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-white/10"
                            >
                              {article}
                            </span>
                          ))}
                      </div>
                    )}

                    {/* Metadata */}
                    {msg.role === "assistant" && msg.durationMs && (
                      <div className="mt-1.5 flex items-center gap-1 opacity-50">
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
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div
                    className="rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2"
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--card-border)",
                    }}
                  >
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      style={{ color: "var(--accent)" }}
                    />
                    <span className="text-xs text-[var(--foreground-tertiary)]">
                      Analizzo il documento...
                    </span>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Follow-up suggestions */}
            <AnimatePresence>
              {followUpSuggestions.length > 0 && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-wrap gap-2 mt-2"
                >
                  <Sparkles
                    className="w-3.5 h-3.5 mt-1"
                    style={{ color: "var(--accent)" }}
                  />
                  {followUpSuggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleFollowUp(suggestion)}
                      className="text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-[1.02]"
                      style={{
                        background: "var(--accent-surface)",
                        color: "var(--accent)",
                        border:
                          "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 mt-2 px-1">{error}</p>
            )}

            {/* Input area */}
            <form onSubmit={handleSubmit} className="flex gap-2 mt-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Fai una domanda sul documento..."
                aria-label="Domanda sul documento"
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white shadow-sm border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                  color: "var(--accent)",
                }}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleNewConversation}
                  className="px-3 py-2.5 rounded-xl transition-colors"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--foreground-tertiary)",
                  }}
                  title="Nuova conversazione"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helpers ───

function getInitialSuggestions(analysisData: DocumentChatProps["analysisData"]): string[] {
  const suggestions: string[] = [];

  if (analysisData.risks && analysisData.risks.length > 0) {
    const topRisk = analysisData.risks[0];
    suggestions.push(`Spiegami meglio il rischio "${topRisk.title}"`);

    if (analysisData.risks.length > 1) {
      suggestions.push("Qual è la clausola più pericolosa per me?");
    }
  }

  if (analysisData.fairnessScore !== undefined) {
    if (analysisData.fairnessScore < 6) {
      suggestions.push("Come posso migliorare questo contratto?");
    } else {
      suggestions.push("Ci sono aspetti che potrei negoziare meglio?");
    }
  }

  suggestions.push("Riassumimi i 3 punti più importanti");

  // Max 4 suggestions
  return suggestions.slice(0, 4);
}
