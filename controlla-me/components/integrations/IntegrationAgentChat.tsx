"use client";

/**
 * IntegrationAgentChat — Conversational chat for the Setup Agent.
 *
 * Pattern based on CorpusChat.tsx but adapted for multi-turn conversation
 * with the integration setup agent. Supports:
 *   - Chat message list (user right, agent left)
 *   - Clickable suggestion chips from agent questions
 *   - Proposed mapping table (source -> target + confidence)
 *   - "Ready to connect" card with confirm button
 *   - Framer Motion animations for new messages
 *
 * Design: Poimandres dark theme, accent #FF6B35.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Bot,
  User,
  CheckCircle,
  ArrowRight,
  Sparkles,
  HelpCircle,
  Plug,
} from "lucide-react";

// ─── Types ───

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Agent-provided follow-up questions */
  questions?: string[];
  /** Agent-proposed field mapping */
  proposedMapping?: ProposedMapping[];
  /** Ready-to-connect configuration */
  connectorConfig?: Record<string, unknown>;
  /** Whether agent needs more user input */
  needsUserInput?: boolean;
  /** Action type from the agent */
  action?: string;
}

interface ProposedMapping {
  source: string;
  target: string;
  confidence: number;
}

interface IntegrationAgentChatProps {
  connectorType?: string;
  onConfigReady?: (config: Record<string, unknown>) => void;
}

// ─── Animation variants ───

const messageVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 } as const,
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  } as const,
};

const chipVariants = {
  hidden: { opacity: 0, y: 6 } as const,
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.05, duration: 0.25 },
  }),
};

// ─── Confidence color helper ───

function confidenceColor(pct: number): string {
  if (pct >= 90) return "var(--success)";
  if (pct >= 70) return "var(--caution)";
  return "var(--error)";
}

// ─── Component ───

export default function IntegrationAgentChat({
  connectorType,
  onConfigReady,
}: IntegrationAgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [configConfirmed, setConfigConfirmed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Send initial greeting if connectorType is provided
  useEffect(() => {
    if (connectorType && messages.length === 0) {
      sendMessage(`Voglio configurare il connettore ${connectorType}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorType]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const history = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/integrations/agent/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
        });

        if (!res.ok) {
          const status = res.status;
          let errorText = "Si e' verificato un errore. Riprova.";
          if (status === 429) errorText = "Troppe richieste, riprova tra poco.";
          else if (status === 503) errorText = "Servizio temporaneamente non disponibile.";
          else {
            const data = await res.json().catch(() => null);
            if (data?.error) errorText = data.error;
          }

          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: errorText },
          ]);
          return;
        }

        const data = await res.json();

        const agentMessage: ChatMessage = {
          role: "assistant",
          content: data.message || "Nessuna risposta dall'agente.",
          questions: data.questions,
          proposedMapping: data.proposedMapping,
          connectorConfig: data.connectorConfig,
          needsUserInput: data.needsUserInput,
          action: data.action,
        };

        setMessages((prev) => [...prev, agentMessage]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Errore di rete. Verifica la connessione e riprova.",
          },
        ]);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [isLoading, messages]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleChipClick = (question: string) => {
    sendMessage(question);
  };

  const handleConfirmConfig = (config: Record<string, unknown>) => {
    setConfigConfirmed(true);
    onConfigReady?.(config);
  };

  // ─── Render ───

  const hasMessages = messages.length > 0;

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark)",
        height: "min(600px, 70vh)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
      >
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg"
          style={{ background: "rgba(255, 107, 53, 0.1)" }}
        >
          <Bot className="w-5 h-5" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--fg-primary)" }}
          >
            Assistente Integrazione
          </h3>
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            Descrivimi la fonte dati che vuoi collegare
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Empty state */}
        {!hasMessages && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-2xl"
              style={{ background: "rgba(255, 107, 53, 0.08)" }}
            >
              <Sparkles
                className="w-7 h-7"
                style={{ color: "var(--accent)" }}
              />
            </div>
            <p
              className="text-sm max-w-[280px]"
              style={{ color: "var(--fg-secondary)" }}
            >
              Dimmi quale servizio vuoi integrare e ti guido passo passo nella
              configurazione.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                "Collegare Fatture in Cloud",
                "Importare da Google Drive",
                "Configurare HubSpot CRM",
              ].map((suggestion, i) => (
                <motion.button
                  key={suggestion}
                  custom={i}
                  variants={chipVariants}
                  initial="hidden"
                  animate="visible"
                  onClick={() => sendMessage(suggestion)}
                  className="text-xs px-3 py-2 rounded-lg transition-all hover:scale-[1.02]"
                  style={{
                    background: "rgba(255, 107, 53, 0.08)",
                    border: "1px solid rgba(255, 107, 53, 0.2)",
                    color: "var(--accent)",
                  }}
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              variants={messageVariants}
              initial="hidden"
              animate="visible"
              className={`flex gap-2.5 ${
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div
                className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5"
                style={{
                  background:
                    msg.role === "user"
                      ? "rgba(167, 139, 250, 0.15)"
                      : "rgba(255, 107, 53, 0.12)",
                }}
              >
                {msg.role === "user" ? (
                  <User
                    className="w-3.5 h-3.5"
                    style={{ color: "#A78BFA" }}
                  />
                ) : (
                  <Bot
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--accent)" }}
                  />
                )}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[80%] space-y-3 ${
                  msg.role === "user" ? "text-right" : "text-left"
                }`}
              >
                {/* Text content */}
                <div
                  className="inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line"
                  style={{
                    background:
                      msg.role === "user"
                        ? "rgba(167, 139, 250, 0.12)"
                        : "var(--bg-overlay)",
                    border: `1px solid ${
                      msg.role === "user"
                        ? "rgba(167, 139, 250, 0.2)"
                        : "var(--border-dark-subtle)"
                    }`,
                    color: "var(--fg-secondary)",
                    textAlign: "left",
                    borderBottomRightRadius:
                      msg.role === "user" ? "4px" : "16px",
                    borderBottomLeftRadius:
                      msg.role === "assistant" ? "4px" : "16px",
                  }}
                >
                  {msg.content}
                </div>

                {/* Suggestion chips */}
                {msg.role === "assistant" &&
                  msg.questions &&
                  msg.questions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.questions.map((q, qi) => (
                        <motion.button
                          key={qi}
                          custom={qi}
                          variants={chipVariants}
                          initial="hidden"
                          animate="visible"
                          onClick={() => handleChipClick(q)}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all hover:scale-[1.02] disabled:opacity-40"
                          style={{
                            background: "rgba(255, 107, 53, 0.06)",
                            border: "1px solid rgba(255, 107, 53, 0.15)",
                            color: "var(--accent)",
                          }}
                        >
                          <HelpCircle className="w-3 h-3" />
                          {q}
                        </motion.button>
                      ))}
                    </div>
                  )}

                {/* Proposed mapping table */}
                {msg.role === "assistant" &&
                  msg.proposedMapping &&
                  msg.proposedMapping.length > 0 && (
                    <div
                      className="rounded-xl overflow-hidden text-left"
                      style={{
                        background: "var(--bg-base)",
                        border: "1px solid var(--border-dark-subtle)",
                      }}
                    >
                      {/* Table header */}
                      <div
                        className="grid grid-cols-[1fr_24px_1fr_48px] gap-2 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          color: "var(--fg-invisible)",
                          background: "var(--bg-overlay)",
                          borderBottom:
                            "1px solid var(--border-dark-subtle)",
                        }}
                      >
                        <span>Sorgente</span>
                        <span />
                        <span>Destinazione</span>
                        <span className="text-right">Conf.</span>
                      </div>

                      {/* Table rows */}
                      {msg.proposedMapping.map((row, ri) => (
                        <div
                          key={ri}
                          className="grid grid-cols-[1fr_24px_1fr_48px] gap-2 items-center px-4 py-2.5"
                          style={{
                            borderBottom:
                              ri < msg.proposedMapping!.length - 1
                                ? "1px solid var(--border-dark-subtle)"
                                : "none",
                          }}
                        >
                          <span
                            className="text-xs font-mono truncate"
                            style={{ color: "var(--fg-primary)" }}
                          >
                            {row.source}
                          </span>
                          <ArrowRight
                            className="w-3 h-3"
                            style={{
                              color: confidenceColor(row.confidence),
                            }}
                          />
                          <span
                            className="text-xs font-mono truncate"
                            style={{ color: "var(--fg-secondary)" }}
                          >
                            {row.target}
                          </span>
                          <span
                            className="text-xs font-mono text-right"
                            style={{
                              color: confidenceColor(row.confidence),
                            }}
                          >
                            {row.confidence}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Connector config ready card */}
                {msg.role === "assistant" &&
                  msg.connectorConfig &&
                  !configConfirmed && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-xl p-4 text-left"
                      style={{
                        background: "rgba(93, 228, 199, 0.06)",
                        border: "1px solid rgba(93, 228, 199, 0.2)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Plug
                          className="w-4 h-4"
                          style={{ color: "var(--success)" }}
                        />
                        <span
                          className="text-sm font-semibold"
                          style={{ color: "var(--success)" }}
                        >
                          Configurazione pronta
                        </span>
                      </div>

                      {/* Config summary */}
                      <div className="space-y-1.5 mb-4">
                        {Object.entries(msg.connectorConfig).map(
                          ([key, val]) => (
                            <div
                              key={key}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span
                                className="font-mono"
                                style={{ color: "var(--fg-muted)" }}
                              >
                                {key}:
                              </span>
                              <span
                                className="truncate"
                                style={{ color: "var(--fg-secondary)" }}
                              >
                                {typeof val === "string"
                                  ? val
                                  : JSON.stringify(val)}
                              </span>
                            </div>
                          )
                        )}
                      </div>

                      <button
                        onClick={() =>
                          handleConfirmConfig(
                            msg.connectorConfig as Record<string, unknown>
                          )
                        }
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02]"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--accent), var(--accent-dark, #E85A24))",
                        }}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Conferma e connetti
                      </button>
                    </motion.div>
                  )}

                {/* Config confirmed state */}
                {msg.role === "assistant" &&
                  msg.connectorConfig &&
                  configConfirmed && (
                    <div
                      className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
                      style={{
                        background: "rgba(93, 228, 199, 0.08)",
                        border: "1px solid rgba(93, 228, 199, 0.2)",
                        color: "var(--success)",
                      }}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Configurazione confermata
                    </div>
                  )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5"
          >
            <div
              className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
              style={{ background: "rgba(255, 107, 53, 0.12)" }}
            >
              <Bot
                className="w-3.5 h-3.5"
                style={{ color: "var(--accent)" }}
              />
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-3"
              style={{
                background: "var(--bg-overlay)",
                border: "1px solid var(--border-dark-subtle)",
                borderBottomLeftRadius: "4px",
              }}
            >
              <Loader2
                className="w-3.5 h-3.5 animate-spin"
                style={{ color: "var(--accent)" }}
              />
              <span
                className="text-xs"
                style={{ color: "var(--fg-muted)" }}
              >
                L&apos;assistente sta pensando...
              </span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        className="shrink-0 px-5 py-4"
        style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
      >
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Descrivi la tua fonte dati o rispondi all'assistente..."
            disabled={isLoading || configConfirmed}
            aria-label="Messaggio per l'assistente integrazione"
            className="flex-1 px-4 py-3 rounded-xl text-sm transition-all focus:outline-none"
            style={{
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-primary)",
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || configConfirmed}
            className="flex items-center justify-center w-11 h-11 rounded-xl text-white transition-all hover:scale-[1.04] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: "var(--accent)",
            }}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
