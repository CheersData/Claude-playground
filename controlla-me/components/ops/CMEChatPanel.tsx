"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Send, Square, Loader2 } from "lucide-react";
import { getConsoleJsonHeaders } from "@/lib/utils/console-client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CMEChatPanelProps {
  onBack: () => void;
}

export function CMEChatPanel({ onBack }: CMEChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [initialized, setInitialized] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fullTextRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startSession = useCallback(async (text: string, isAuto = false) => {
    if (abortRef.current) abortRef.current.abort();
    if (!isAuto) {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
    }
    setInput("");
    setSessionId(null);
    setResponding(true);
    setStreaming("");
    fullTextRef.current = "";

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const headers = getConsoleJsonHeaders();
      if (!sessionStorage.getItem("lexmea-token")) {
        throw new Error("Sessione scaduta — ricarica la pagina e accedi di nuovo.");
      }
      // Include conversation history so CME has full context even on new subprocess
      const res = await fetch("/api/console/company", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          target: "cme",
          history: messages.slice(-20),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (eventType) {
                case "session":
                  if (data.sessionId) setSessionId(data.sessionId);
                  break;
                case "chunk":
                  if (data.text) {
                    fullTextRef.current += data.text;
                    setStreaming(fullTextRef.current);
                    setResponding(true);
                  }
                  break;
                case "turn-end": {
                  const turnText = fullTextRef.current.trim();
                  if (turnText) {
                    setMessages((prev) => [...prev, { role: "assistant", content: turnText }]);
                  } else if (data.result) {
                    setMessages((prev) => [...prev, { role: "assistant", content: data.result }]);
                  }
                  fullTextRef.current = "";
                  setStreaming("");
                  setResponding(false);
                  break;
                }
                case "done":
                  if (fullTextRef.current.trim()) {
                    setMessages((prev) => [...prev, { role: "assistant", content: fullTextRef.current.trim() }]);
                  }
                  fullTextRef.current = "";
                  setStreaming("");
                  setResponding(false);
                  setSessionId(null);
                  break;
              }
            } catch { /* skip malformed */ }
            eventType = "";
          }
        }
      }

      setSessionId(null);
      setResponding(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (fullTextRef.current.trim()) {
          setMessages((prev) => [...prev, { role: "assistant", content: fullTextRef.current.trim() + "\n\n[Interrotto]" }]);
        }
        fullTextRef.current = "";
        setStreaming("");
        setResponding(false);
        setSessionId(null);
        return;
      }
      const errMsg = err instanceof Error ? err.message : "Errore";
      setMessages((prev) => [...prev, { role: "assistant", content: `Errore: ${errMsg}\n\nControlla che il server sia attivo.` }]);
      setSessionId(null);
      setResponding(false);
    }
  }, [messages]);

  const sendFollowUp = useCallback(async (text: string) => {
    if (!sessionId) { await startSession(text, false); return; }

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setResponding(true);
    fullTextRef.current = "";
    setStreaming("");

    try {
      const token = sessionStorage.getItem("lexmea-token");
      const res = await fetch("/api/console/company/message", {
        method: "POST",
        headers: token
          ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
          : { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      if (!res.ok) await startSession(text, true);
    } catch {
      await startSession(text, true);
    }
  }, [sessionId, startSession]);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    if (sessionId) sendFollowUp(text);
    else startSession(text, false);
  }, [sessionId, sendFollowUp, startSession]);

  const handleStop = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    if (sessionId) {
      try {
        await fetch("/api/console/company/stop", {
          method: "POST",
          headers: getConsoleJsonHeaders(),
          body: JSON.stringify({ sessionId }),
        });
      } catch { /* best effort */ }
    }
  }, [sessionId]);

  // Init: greet CME on first mount
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      startSession("Buongiorno, qual è la situazione?", true);
    }
  }, [initialized, startSession]);

  // Focus input
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl overflow-hidden flex flex-col"
      style={{ minHeight: "600px" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--ops-border-subtle)] bg-[var(--ops-surface-2)]/40">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[var(--ops-fg-muted)] hover:text-[var(--ops-fg)] transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Ops</span>
        </button>
        <span className="text-[var(--ops-muted)]">/</span>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--ops-accent)]" />
          <span className="text-[var(--ops-fg)] text-sm font-medium">CME (CEO) — Opus</span>
        </div>
        {responding && (
          <span className="text-xs text-[var(--ops-id-cost)] animate-pulse ml-2">
            In elaborazione...
          </span>
        )}
        {sessionId && !responding && (
          <span className="text-xs text-[var(--ops-teal)] ml-2">Sessione attiva</span>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
        className="flex items-center gap-3 px-4 py-3 border-b border-[var(--ops-border-subtle)]"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={responding ? "CME sta elaborando..." : "Scrivi a CME..."}
          className="flex-1 text-sm text-[var(--ops-fg)] placeholder-[var(--ops-muted)] bg-transparent outline-none"
        />
        {responding && (
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--ops-error)]/10 text-[var(--ops-error)] hover:bg-[var(--ops-error)]/20 transition-colors text-xs"
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>
        )}
        <button
          type="submit"
          disabled={!input.trim() || responding}
          className="p-2 text-[var(--ops-muted)] hover:text-[var(--ops-accent)] transition-colors disabled:opacity-30"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ maxHeight: "480px" }}>
        {/* Waiting */}
        {responding && !streaming && (
          <div className="flex justify-start">
            <div className="bg-[var(--ops-surface-2)] border border-[var(--ops-border-subtle)] rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-[var(--ops-id-cost)] animate-spin" />
              <span className="text-xs text-[var(--ops-fg-muted)]">CME sta elaborando...</span>
            </div>
          </div>
        )}

        {/* Streaming */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-[var(--ops-surface-2)] border border-[var(--ops-border-subtle)] rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-[5px] h-[5px] rounded-full bg-[var(--ops-accent)] animate-pulse" />
                <span className="text-xs text-[var(--ops-muted)] font-medium">CME (CEO) — Opus</span>
              </div>
              <p className="text-sm text-[var(--ops-fg)] whitespace-pre-wrap leading-relaxed">{streaming}</p>
            </div>
          </div>
        )}

        {/* History — newest first */}
        {[...messages].reverse().map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[var(--ops-accent)] text-[var(--ops-fg)]"
                  : "bg-[var(--ops-surface-2)] border border-[var(--ops-border-subtle)] text-[var(--ops-fg)]"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-[5px] h-[5px] rounded-full bg-[var(--ops-accent)]" />
                  <span className="text-xs text-[var(--ops-muted)] font-medium">CME (CEO) — Opus</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
