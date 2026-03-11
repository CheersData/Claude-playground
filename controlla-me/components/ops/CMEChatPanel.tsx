"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowLeft, Send, Square, Loader2, Paperclip, X } from "lucide-react";
import { getConsoleJsonHeaders } from "@/lib/utils/console-client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CMEChatPanelProps {
  onBack?: () => void;
  onDebugEvent?: (event: { ts: number; type: string; msg: string; agent?: string }) => void;
  embedded?: boolean;
}

export function CMEChatPanel({ onBack, onDebugEvent, embedded }: CMEChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fullTextRef = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queuedRef = useRef<{ message: string; file: File | null } | null>(null);

  const startSession = useCallback(async (text: string, isAuto = false) => {
    if (abortRef.current) abortRef.current.abort();
    if (!isAuto) {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
    }
    setInput("");
    setFile(null);
    setFilePreview(null);
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
                  {
                    const queued = queuedRef.current;
                    if (queued) {
                      queuedRef.current = null;
                      setTimeout(() => {
                        if (queued.file) setFile(queued.file);
                        startSession(queued.message, false);
                      }, 100);
                    }
                  }
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
                  {
                    const queued = queuedRef.current;
                    if (queued) {
                      queuedRef.current = null;
                      setTimeout(() => {
                        if (queued.file) setFile(queued.file);
                        startSession(queued.message, false);
                      }, 100);
                    }
                  }
                  break;
                case "debug":
                  onDebugEvent?.({ ts: Date.now(), type: data.type ?? "info", msg: data.msg ?? JSON.stringify(data), agent: "cme" });
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
  }, [messages, onDebugEvent]);

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

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() && !file) return;

    // Build message text with file info
    let messageText = text.trim();
    if (file) {
      if (file.type.startsWith("image/")) {
        messageText = `${messageText}${messageText ? " " : ""}[📎 Immagine allegata: ${file.name}]`;
      } else {
        try {
          const fileContent = await file.text();
          messageText = `${messageText}${messageText ? "\n\n" : ""}[📎 ${file.name}]\n${fileContent}`;
        } catch {
          messageText = `${messageText}${messageText ? " " : ""}[📎 ${file.name}]`;
        }
      }
    }

    // Queue if already responding
    if (responding) {
      queuedRef.current = { message: messageText, file: null };
      setMessages(prev => [...prev, { role: "user", content: messageText }]);
      setInput("");
      setFile(null);
      setFilePreview(null);
      return;
    }

    setFile(null);
    setFilePreview(null);

    if (sessionId) sendFollowUp(messageText);
    else startSession(messageText, false);
  }, [sessionId, sendFollowUp, startSession, file, responding]);

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

  // Clipboard paste handler (images)
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          const imageFile = new File([blob], `screenshot-${Date.now()}.png`, { type: blob.type });
          setFile(imageFile);
          setFilePreview(URL.createObjectURL(imageFile));
        }
        break;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  // Drag and drop handler
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      if (droppedFile.type.startsWith("image/")) {
        setFilePreview(URL.createObjectURL(droppedFile));
      } else {
        setFilePreview(null);
      }
    }
  }, []);

  // File input change handler
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (selected.type.startsWith("image/")) {
        setFilePreview(URL.createObjectURL(selected));
      } else {
        setFilePreview(null);
      }
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  // Remove attached file
  const removeFile = useCallback(() => {
    setFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
  }, [filePreview]);

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
      className={`bg-[var(--bg-raised)] overflow-hidden flex flex-col ${
        embedded ? "flex-1" : "border border-[var(--border-dark-subtle)] rounded-xl"
      }`}
      style={embedded ? undefined : { minHeight: "600px" }}
    >
      {/* Header */}
      {!embedded && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-dark-subtle)] bg-[var(--bg-overlay)]/40">
          {onBack && (
            <>
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Ops</span>
              </button>
              <span className="text-[var(--fg-invisible)]">/</span>
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <span className="text-[var(--fg-primary)] text-sm font-medium">CME (CEO) — Opus</span>
          </div>
          {responding && (
            <span className="text-xs text-[var(--identity-gold)] animate-pulse ml-2">
              In elaborazione...
            </span>
          )}
          {sessionId && !responding && (
            <span className="text-xs text-[var(--success)] ml-2">Sessione attiva</span>
          )}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
        className="border-b border-[var(--border-dark-subtle)]"
      >
        {/* File preview */}
        {file && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            {filePreview ? (
              <Image src={filePreview} alt={file.name} width={40} height={40} unoptimized className="rounded object-cover border border-[var(--border-dark-subtle)]" />
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-overlay)] border border-[var(--border-dark-subtle)]">
                <Paperclip className="w-3 h-3 text-[var(--fg-secondary)]" />
                <span className="text-xs text-[var(--fg-secondary)] max-w-[200px] truncate">{file.name}</span>
              </div>
            )}
            <button
              type="button"
              onClick={removeFile}
              className="p-1 rounded hover:bg-[var(--bg-overlay)] text-[var(--fg-invisible)] hover:text-[var(--fg-primary)] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 px-4 py-3">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept="image/*,.pdf,.docx,.txt,.json,.csv"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)] transition-colors shrink-0"
            title="Allega file"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            rows={1}
            placeholder={responding ? "CME sta elaborando... (il messaggio verrà accodato)" : "Scrivi a CME..."}
            className="flex-1 text-sm text-[var(--fg-primary)] placeholder-[var(--fg-invisible)] bg-transparent outline-none resize-none leading-relaxed"
            style={{ maxHeight: "120px" }}
          />
          {responding && (
            <button
              type="button"
              onClick={handleStop}
              className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors text-xs shrink-0"
            >
              <Square className="w-3 h-3 fill-current" />
              Stop
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() && !file}
            className="p-2 text-[var(--fg-invisible)] hover:text-[var(--accent)] transition-colors disabled:opacity-30 shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 relative"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg-raised)]/80 border-2 border-dashed border-[var(--accent)] rounded-lg">
            <div className="flex flex-col items-center gap-2">
              <Paperclip className="w-6 h-6 text-[var(--accent)]" />
              <span className="text-sm text-[var(--accent)] font-medium">Rilascia per allegare</span>
            </div>
          </div>
        )}
        {/* Waiting */}
        {responding && !streaming && (
          <div className="flex justify-start">
            <div className="bg-[var(--bg-overlay)] border border-[var(--border-dark-subtle)] rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-[var(--identity-gold)] animate-spin" />
              <span className="text-xs text-[var(--fg-secondary)]">CME sta elaborando...</span>
            </div>
          </div>
        )}

        {/* Streaming */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-[var(--bg-overlay)] border border-[var(--border-dark-subtle)] rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)] animate-pulse" />
                <span className="text-xs text-[var(--fg-invisible)] font-medium">CME (CEO) — Opus</span>
              </div>
              <p className="text-sm text-[var(--fg-primary)] whitespace-pre-wrap leading-relaxed">{streaming}</p>
            </div>
          </div>
        )}

        {/* History — newest first */}
        {[...messages].reverse().map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[var(--accent)] text-[var(--fg-primary)]"
                  : "bg-[var(--bg-overlay)] border border-[var(--border-dark-subtle)] text-[var(--fg-primary)]"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
                  <span className="text-xs text-[var(--fg-invisible)] font-medium">CME (CEO) — Opus</span>
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
