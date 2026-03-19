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
 *   - Discovered entity cards (selectable, searchable)
 *   - Floating selection bar ("N entita selezionate — Configura sync")
 *   - Embedded mode for IntegrationAgentPanel (no internal header, full height)
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
  Search,
  Check,
  Settings,
  Database,
  Star,
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
  /** Discovered entities from the agent */
  entities?: DiscoveredEntity[];
}

interface ProposedMapping {
  source: string;
  target: string;
  confidence: number;
}

/** Entity discovered by the agent during conversation */
export interface DiscoveredEntity {
  id: string;
  name: string;
  description?: string;
  category?: string;
  core?: boolean;
}

interface IntegrationAgentChatProps {
  connectorType?: string;
  connectorId?: string;
  /** When true, hides the internal header (used inside IntegrationAgentPanel) */
  embedded?: boolean;
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
  connectorId,
  embedded = false,
  onConfigReady,
}: IntegrationAgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [configConfirmed, setConfigConfirmed] = useState(false);

  // Entity selection state
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(
    new Set()
  );
  const [entitySearchQuery, setEntitySearchQuery] = useState("");
  const [showEntitySearch, setShowEntitySearch] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Collect all discovered entities from all messages
  const allEntities: DiscoveredEntity[] = [];
  const seenIds = new Set<string>();
  for (const msg of messages) {
    if (msg.entities) {
      for (const entity of msg.entities) {
        if (!seenIds.has(entity.id)) {
          seenIds.add(entity.id);
          allEntities.push(entity);
        }
      }
    }
  }

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
        // Map "assistant" role to "agent" for the API (SetupAgentMessage uses "user" | "agent")
        // Also include structured data from agent messages so the LLM retains context
        const history = [...messages, userMessage].map((m) => {
          const mapped: Record<string, unknown> = {
            role: m.role === "assistant" ? "agent" : m.role,
            content: m.content,
          };
          // Include structured fields from agent messages for formatConversationHistory
          if (m.role === "assistant") {
            if (m.action) mapped.action = m.action;
            if (m.proposedMapping && m.proposedMapping.length > 0) {
              // Convert back from UI format (source/target) to API format (sourceField/targetField)
              mapped.proposedMapping = m.proposedMapping.map((p) => ({
                sourceField: p.source,
                targetField: p.target,
                confidence: p.confidence,
              }));
            }
            if (m.connectorConfig) mapped.connectorConfig = m.connectorConfig;
            if (m.questions && m.questions.length > 0) mapped.questions = m.questions;
          }
          return mapped;
        });

        const res = await fetch("/api/integrations/agent/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history,
            ...(connectorId ? { connectorId } : {}),
          }),
        });

        if (!res.ok) {
          const status = res.status;
          let errorText = "Si e' verificato un errore. Riprova.";
          if (status === 429)
            errorText = "Troppe richieste, riprova tra poco.";
          else if (status === 503)
            errorText = "Servizio temporaneamente non disponibile.";
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

        // Map API field names to UI field names:
        // - API returns "discoveredEntities", UI expects "entities"
        // - API returns proposedMapping as { sourceField, targetField }, UI expects { source, target }
        const mappedEntities = (data.discoveredEntities || data.entities || []).map(
          (e: { id: string; name: string; description?: string; category?: string; isCore?: boolean; core?: boolean }) => ({
            id: e.id,
            name: e.name,
            description: e.description,
            category: e.category,
            core: e.isCore ?? e.core,
          })
        );

        const mappedProposedMapping = (data.proposedMapping || []).map(
          (m: { sourceField?: string; source?: string; targetField?: string; target?: string; confidence: number }) => ({
            source: m.sourceField ?? m.source ?? "",
            target: m.targetField ?? m.target ?? "",
            // Agent returns confidence as 0.0-1.0, UI expects percentage (0-100)
            confidence: m.confidence <= 1 ? Math.round(m.confidence * 100) : Math.round(m.confidence),
          })
        );

        const agentMessage: ChatMessage = {
          role: "assistant",
          content: data.message || "Nessuna risposta dall'agente.",
          questions: data.questions,
          proposedMapping: mappedProposedMapping.length > 0 ? mappedProposedMapping : undefined,
          connectorConfig: data.connectorConfig,
          needsUserInput: data.needsUserInput,
          action: data.action,
          entities: mappedEntities.length > 0 ? mappedEntities : undefined,
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
    [isLoading, messages, connectorId]
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

  const handleToggleEntity = (entityId: string) => {
    setSelectedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  };

  const handleEntitySearch = () => {
    if (!entitySearchQuery.trim()) return;
    sendMessage(`cerca entita: ${entitySearchQuery.trim()}`);
    setEntitySearchQuery("");
    setShowEntitySearch(false);
  };

  const handleConfigureSync = () => {
    const names = allEntities
      .filter((e) => selectedEntities.has(e.id))
      .map((e) => e.name);
    sendMessage(
      `Voglio configurare la sincronizzazione per: ${names.join(", ")}`
    );
  };

  // ─── Render ───

  const hasMessages = messages.length > 0;
  const selectedCount = selectedEntities.size;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: embedded ? "transparent" : "var(--bg-raised)",
        border: embedded ? "none" : "1px solid var(--border-dark)",
        borderRadius: embedded ? 0 : "16px",
        height: embedded ? "100%" : "min(600px, 70vh)",
      }}
    >
      {/* Header — only in standalone mode */}
      {!embedded && (
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
      )}

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

                {/* ─── Discovered Entity Cards ─── */}
                {msg.role === "assistant" &&
                  msg.entities &&
                  msg.entities.length > 0 && (
                    <div className="space-y-2">
                      {msg.entities.map((entity) => {
                        const isSelected = selectedEntities.has(entity.id);
                        return (
                          <motion.button
                            key={entity.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => handleToggleEntity(entity.id)}
                            className="w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all hover:scale-[1.005]"
                            style={{
                              background: isSelected
                                ? "rgba(255, 107, 53, 0.08)"
                                : "var(--bg-base)",
                              border: isSelected
                                ? "1px solid rgba(255, 107, 53, 0.3)"
                                : "1px solid var(--border-dark-subtle)",
                            }}
                          >
                            {/* Selection indicator */}
                            <div
                              className="flex items-center justify-center w-5 h-5 rounded-md shrink-0 mt-0.5 transition-colors"
                              style={{
                                background: isSelected
                                  ? "var(--accent)"
                                  : "var(--bg-overlay)",
                                border: isSelected
                                  ? "none"
                                  : "1px solid var(--border-dark)",
                              }}
                            >
                              {isSelected && (
                                <Check
                                  className="w-3 h-3"
                                  style={{ color: "white" }}
                                />
                              )}
                            </div>

                            {/* Entity info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="text-sm font-medium"
                                  style={{ color: "var(--fg-primary)" }}
                                >
                                  {entity.name}
                                </span>
                                {entity.category && (
                                  <span
                                    className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                                    style={{
                                      background: "var(--bg-overlay)",
                                      color: "var(--fg-muted)",
                                      border:
                                        "1px solid var(--border-dark-subtle)",
                                    }}
                                  >
                                    {entity.category}
                                  </span>
                                )}
                                {entity.core && (
                                  <span
                                    className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                    style={{
                                      background: "rgba(255, 200, 50, 0.1)",
                                      color: "var(--identity-gold)",
                                    }}
                                  >
                                    <Star className="w-2.5 h-2.5" />
                                    Core
                                  </span>
                                )}
                              </div>
                              {entity.description && (
                                <p
                                  className="text-xs mt-1 leading-relaxed"
                                  style={{ color: "var(--fg-muted)" }}
                                >
                                  {entity.description}
                                </p>
                              )}
                            </div>
                          </motion.button>
                        );
                      })}
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

      {/* ─── Entity selection bar ─── */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 px-5 py-3 flex items-center justify-between gap-3"
            style={{
              background: "rgba(255, 107, 53, 0.06)",
              borderTop: "1px solid rgba(255, 107, 53, 0.15)",
            }}
          >
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                <strong style={{ color: "var(--fg-primary)" }}>
                  {selectedCount}
                </strong>{" "}
                {selectedCount === 1 ? "entita selezionata" : "entita selezionate"}
              </span>
            </div>
            <button
              onClick={handleConfigureSync}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent), var(--accent-dark, #E85A24))",
              }}
            >
              <Settings className="w-3.5 h-3.5" />
              Configura sync
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Entity search toggle ─── */}
      <AnimatePresence>
        {showEntitySearch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 px-5 overflow-hidden"
          >
            <div
              className="flex gap-2 py-3"
              style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
            >
              <div className="flex-1 relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: "var(--fg-muted)" }}
                />
                <input
                  type="text"
                  value={entitySearchQuery}
                  onChange={(e) => setEntitySearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEntitySearch()}
                  placeholder="Cerca entita (es. fatture, contatti)..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm transition-all focus:outline-none"
                  style={{
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-dark-subtle)",
                    color: "var(--fg-primary)",
                  }}
                  autoFocus
                />
              </div>
              <button
                onClick={handleEntitySearch}
                disabled={!entitySearchQuery.trim() || isLoading}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-[1.04] disabled:opacity-40"
                style={{ background: "var(--accent)", color: "white" }}
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div
        className="shrink-0 px-5 py-4"
        style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
      >
        <form onSubmit={handleSubmit} className="flex gap-2">
          {/* Entity search toggle button */}
          {allEntities.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEntitySearch(!showEntitySearch)}
              className="flex items-center justify-center w-11 h-11 rounded-xl transition-all hover:scale-[1.04]"
              style={{
                background: showEntitySearch
                  ? "rgba(255, 107, 53, 0.15)"
                  : "var(--bg-overlay)",
                border: showEntitySearch
                  ? "1px solid rgba(255, 107, 53, 0.3)"
                  : "1px solid var(--border-dark-subtle)",
                color: showEntitySearch
                  ? "var(--accent)"
                  : "var(--fg-muted)",
              }}
              title="Cerca entita"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

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
