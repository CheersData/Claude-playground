"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
} from "lucide-react";
import { useCreator } from "./layout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  meta?: {
    model?: string;
    provider?: string;
    durationMs?: number;
  };
}

// ─── Chat Page ────────────────────────────────────────────────────────────────

export default function CreatorChatPage() {
  const { userName, getAuthHeaders } = useCreator();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  // Send message
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      // Build history for API
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const formData = new FormData();
      formData.append("message", text);
      formData.append("history", JSON.stringify(history));

      const res = await fetch("/api/creator/chat", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "x-csrf-token": "1",
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Errore di connessione" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Parse SSE
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantContent = "";
      let assistantId = `assistant-${Date.now()}`;
      let meta: ChatMessage["meta"] = {};

      // Add placeholder message
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        },
      ]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const eventType = line.slice(7).trim();
            // Next line should be data
            continue;
          }
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (data.content) {
                assistantContent = data.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantContent }
                      : m
                  )
                );
              }

              if (data.model || data.provider) {
                meta = {
                  model: data.model,
                  provider: data.provider,
                  durationMs: data.durationMs,
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, meta } : m
                  )
                );
              }

              if (data.message && typeof data.message === "string" && !data.content) {
                // Error event
                assistantContent = `⚠️ ${data.message}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantContent }
                      : m
                  )
                );
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `⚠️ ${err instanceof Error ? err.message : "Errore di connessione"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => {
        // Remove empty placeholder if exists
        const filtered = prev.filter(
          (m) => m.role !== "assistant" || m.content !== ""
        );
        return [...filtered, errorMsg];
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, messages, getAuthHeaders]);

  // Handle Enter key (Shift+Enter for newline)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const isEmptyState = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-dvh"> {/* dvh: dynamic viewport height, fixes iOS Safari address bar */}
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {isEmptyState ? (
          <EmptyState userName={userName} onSuggestionClick={(text) => { setInput(text); }} />
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-100 bg-white px-4 py-3 safe-area-bottom">
        <div className="max-w-2xl mx-auto">
          <div className="relative flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-[#FF6B35]/40 focus-within:ring-2 focus-within:ring-[#FF6B35]/10 transition-all px-4 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi un messaggio..."
              rows={1}
              disabled={sending}
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none min-h-[36px] max-h-[160px] py-1.5 leading-relaxed"
            />
            <motion.button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-[#FF6B35] text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
              whileTap={{ scale: 0.9 }}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </motion.button>
          </div>
          <p className="text-[10px] text-gray-300 text-center mt-1.5">
            Shift+Enter per andare a capo
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ userName, onSuggestionClick }: { userName: string; onSuggestionClick?: (text: string) => void }) {
  const firstName = userName.split(" ")[0] || "Creator";

  return (
    <div className="flex-1 flex items-center justify-center h-full px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="text-center max-w-md"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C61] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#FF6B35]/15"
        >
          <Sparkles className="w-7 h-7 text-white" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-serif text-2xl text-gray-900 mb-2"
        >
          Ciao {firstName}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-sm text-gray-500 leading-relaxed"
        >
          Sono il tuo CME personale. Raccontami il tuo progetto
          e ti aiuto a costruire il tuo team di agenti AI.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex flex-wrap justify-center gap-2"
        >
          {[
            "Voglio analizzare documenti",
            "Ho bisogno di un assistente clienti",
            "Cosa puoi fare?",
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onSuggestionClick?.(suggestion)}
              className="px-4 py-2 rounded-full text-xs text-gray-500 bg-white border border-gray-200 hover:border-[#FF6B35]/30 hover:text-[#FF6B35] transition-all cursor-pointer"
            >
              {suggestion}
            </button>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isLoading = !isUser && message.content === "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isUser
            ? "bg-gray-100"
            : "bg-gradient-to-br from-[#FF6B35] to-[#FF8C61]"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-gray-500" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block text-sm leading-relaxed rounded-2xl px-4 py-2.5 max-w-[85%] ${
            isUser
              ? "bg-[#FF6B35] text-white rounded-br-md"
              : "bg-white border border-gray-100 text-gray-800 rounded-bl-md shadow-sm"
          }`}
        >
          {isLoading ? (
            <div className="flex items-center gap-1.5 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:0ms]" />
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:150ms]" />
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:300ms]" />
            </div>
          ) : (
            <span className="whitespace-pre-wrap break-words">{message.content}</span>
          )}
        </div>

        {/* Meta info */}
        {message.meta && (
          <p className="text-[10px] text-gray-300 mt-1 px-1">
            {message.meta.provider} · {message.meta.durationMs ? `${(message.meta.durationMs / 1000).toFixed(1)}s` : ""}
          </p>
        )}
      </div>
    </motion.div>
  );
}
