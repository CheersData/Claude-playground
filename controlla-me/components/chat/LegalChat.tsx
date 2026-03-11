"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import ChatSidebar from "./ChatSidebar";
import ChatInput from "./ChatInput";
import ChatWelcome from "./ChatWelcome";
import ChatMessageComponent from "./ChatMessage";
import TierPanel from "./TierPanel";
import type {
  ChatMessage,
  Conversation,
  AgentId,
  TierName,
  TierData,
  CorpusResponse,
} from "./types";
import type { AgentPhase, AdvisorResult, Clause } from "@/lib/types";

// Phase → Agent mapping
const PHASE_AGENT: Record<AgentPhase, AgentId> = {
  classifier: "leo",
  analyzer: "marta",
  investigator: "giulia",
  advisor: "enzo",
};

let msgCounter = 0;
function newId() {
  return `msg-${Date.now()}-${++msgCounter}`;
}
function newConvId() {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function LegalChat() {
  // --- Conversations ---
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // --- UI state ---
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tierPanelOpen, setTierPanelOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputText, setInputText] = useState("");

  // --- Tier ---
  const [tier, setTier] = useState<TierName>("intern");

  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load tier on mount
  useEffect(() => {
    fetch("/api/console/tier")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TierData | null) => {
        if (data?.current) setTier(data.current);
      })
      .catch(() => {});
  }, []);

  // --- Helpers ---
  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  }, []);

  const ensureConversation = useCallback(
    (title: string, fileName?: string): string => {
      if (activeConvId) return activeConvId;
      const id = newConvId();
      const conv: Conversation = {
        id,
        title,
        createdAt: new Date(),
        messages: [],
        fileName,
      };
      setConversations((prev) => [conv, ...prev]);
      setActiveConvId(id);
      return id;
    },
    [activeConvId]
  );

  // --- SSE Analysis ---
  const runAnalysis = useCallback(
    async (file: File, context?: string) => {
      setIsProcessing(true);
      abortRef.current = new AbortController();

      // Add user message
      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: context || `Analizza: ${file.name}`,
        timestamp: new Date(),
        fileName: file.name,
      };
      addMessage(userMsg);

      // Prepare running messages for each phase
      const phaseMessages: Record<string, string> = {};

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (context?.trim()) formData.append("context", context.trim());

        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData,
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "Errore sconosciuto");
          throw new Error(errText);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Stream non disponibile");

        const decoder = new TextDecoder();
        let buffer = "";
        let eventType = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (eventType === "progress") {
                  const phase = data.phase as AgentPhase;
                  const agent = PHASE_AGENT[phase];

                  if (data.status === "running") {
                    // Create running message
                    const msgId = newId();
                    phaseMessages[phase] = msgId;
                    addMessage({
                      id: msgId,
                      role: "assistant",
                      agent,
                      content: "",
                      timestamp: new Date(),
                      phase,
                      phaseStatus: "running",
                    });
                  } else if (data.status === "done") {
                    const existingId = phaseMessages[phase];
                    if (existingId) {
                      // Update running → done
                      updateMessage(existingId, {
                        phaseStatus: "done",
                        phaseData: data.data,
                        content: data.data?.summary || "",
                      });
                    } else {
                      // Direct done (cached/skipped)
                      addMessage({
                        id: newId(),
                        role: "assistant",
                        agent,
                        content: data.data?.summary || "",
                        timestamp: new Date(),
                        phase,
                        phaseStatus: "done",
                        phaseData: data.data,
                      });
                    }
                  } else if (data.status === "skipped") {
                    // Remove running message if exists
                    const existingId = phaseMessages[phase];
                    if (existingId) {
                      setMessages((prev) => prev.filter((m) => m.id !== existingId));
                    }
                  }
                } else if (eventType === "complete") {
                  const advice: AdvisorResult = data.advice || data;
                  // Check if advisor message already exists
                  const advisorMsgId = phaseMessages["advisor"];
                  if (advisorMsgId) {
                    updateMessage(advisorMsgId, {
                      phaseStatus: "done",
                      phaseData: advice,
                      content: advice.summary || "",
                    });
                  } else {
                    addMessage({
                      id: newId(),
                      role: "assistant",
                      agent: "enzo",
                      content: advice.summary || "",
                      timestamp: new Date(),
                      phase: "advisor",
                      phaseStatus: "done",
                      phaseData: advice,
                    });
                  }
                } else if (eventType === "error") {
                  if (data.code === "LIMIT_REACHED") {
                    addMessage({
                      id: newId(),
                      role: "assistant",
                      content:
                        "Hai raggiunto il limite di analisi gratuite. Passa al piano Pro per analisi illimitate.",
                      timestamp: new Date(),
                      isError: true,
                    });
                  } else {
                    addMessage({
                      id: newId(),
                      role: "assistant",
                      content: data.message || data.error || "Errore durante l'analisi",
                      timestamp: new Date(),
                      isError: true,
                    });
                  }
                }
                // session and timing events are handled silently
              } catch {
                /* skip parse errors */
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          addMessage({
            id: newId(),
            role: "assistant",
            content: (err as Error).message || "Errore durante l'analisi",
            timestamp: new Date(),
            isError: true,
          });
        }
      } finally {
        setIsProcessing(false);
        abortRef.current = null;
      }
    },
    [addMessage, updateMessage]
  );

  // --- Corpus Q&A ---
  const askCorpus = useCallback(
    async (question: string) => {
      setIsProcessing(true);

      // Add user message
      addMessage({
        id: newId(),
        role: "user",
        content: question,
        timestamp: new Date(),
      });

      // Add thinking message
      const thinkId = newId();
      addMessage({
        id: thinkId,
        role: "assistant",
        agent: "corpus",
        content: "",
        timestamp: new Date(),
        phaseStatus: "running",
      });

      try {
        const res = await fetch("/api/corpus/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Errore" }));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data: CorpusResponse = await res.json();

        updateMessage(thinkId, {
          phaseStatus: "done",
          content: data.answer,
          corpusResponse: data,
        });
      } catch (err) {
        updateMessage(thinkId, {
          phaseStatus: undefined,
          content: (err as Error).message || "Errore nella ricerca",
          isError: true,
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [addMessage, updateMessage]
  );

  // --- Deep Search (follow-up on clause) ---
  const deepSearch = useCallback(
    async (clause: Clause) => {
      setIsProcessing(true);

      const question = `Approfondisci: ${clause.title || clause.id || "questa clausola"}`;
      addMessage({
        id: newId(),
        role: "user",
        content: question,
        timestamp: new Date(),
      });

      const thinkId = newId();
      addMessage({
        id: thinkId,
        role: "assistant",
        agent: "giulia",
        content: "",
        timestamp: new Date(),
        phaseStatus: "running",
      });

      try {
        const res = await fetch("/api/deep-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clauseContext: clause.originalText || clause.issue || "",
            existingAnalysis: clause.issue || "",
            userQuestion: question,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        updateMessage(thinkId, {
          phaseStatus: "done",
          content: data.response || "Nessun risultato trovato",
        });
      } catch (err) {
        updateMessage(thinkId, {
          phaseStatus: undefined,
          content: (err as Error).message || "Errore nella ricerca approfondita",
          isError: true,
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [addMessage, updateMessage]
  );

  // --- Handle send: route to analysis or corpus ---
  const handleSend = useCallback(
    (text: string, file?: File) => {
      const title = file ? file.name : text.slice(0, 40);
      ensureConversation(title, file?.name);

      if (file) {
        // File uploaded → run full analysis
        runAnalysis(file, text || undefined);
      } else {
        // Text only → corpus Q&A
        askCorpus(text);
      }
    },
    [ensureConversation, runAnalysis, askCorpus]
  );

  // --- New conversation ---
  const handleNewConv = useCallback(() => {
    // Save current messages to conversation
    if (activeConvId && messages.length > 0) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConvId ? { ...c, messages } : c))
      );
    }
    setActiveConvId(null);
    setMessages([]);
    setIsProcessing(false);
    if (abortRef.current) abortRef.current.abort();
  }, [activeConvId, messages]);

  // --- Select conversation ---
  const handleSelectConv = useCallback(
    (id: string) => {
      // Save current
      if (activeConvId && messages.length > 0) {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConvId ? { ...c, messages } : c))
        );
      }
      const conv = conversations.find((c) => c.id === id);
      if (conv) {
        setActiveConvId(id);
        setMessages(conv.messages);
      }
    },
    [activeConvId, messages, conversations]
  );

  // --- Suggestion from welcome ---
  const handleSuggestion = useCallback(
    (text: string) => {
      if (text.toLowerCase().includes("analizza") || text.toLowerCase().includes("contratto")) {
        // Suggest uploading a file
        setInputText(text);
      } else {
        handleSend(text);
      }
    },
    [handleSend]
  );

  // --- Article click ---
  const handleArticleClick = useCallback((articleId: string) => {
    window.open(`/corpus/article/${articleId}`, "_blank");
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-[#FAFAFA] overflow-hidden">
      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConv}
        onNew={handleNewConv}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        tier={tier}
        onTierClick={() => setTierPanelOpen(true)}
      />

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Messages or Welcome */}
        {isEmpty ? (
          <ChatWelcome onSuggestion={handleSuggestion} />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-3xl mx-auto">
              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <ChatMessageComponent
                    key={msg.id}
                    message={msg}
                    onDeepSearch={deepSearch}
                    onArticleClick={handleArticleClick}
                  />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Input — always at bottom */}
        <div className={`shrink-0 ${isEmpty ? "" : "border-t border-gray-100 bg-white/80 backdrop-blur-sm"}`}>
          <ChatInput
            onSend={handleSend}
            disabled={isProcessing}
            initialText={inputText}
            placeholder={
              isProcessing
                ? "Analisi in corso..."
                : isEmpty
                ? "Carica un documento o fai una domanda sul diritto..."
                : "Fai una domanda di approfondimento..."
            }
          />
        </div>
      </main>

      {/* Tier Panel */}
      <AnimatePresence>
        {tierPanelOpen && (
          <TierPanel
            currentTier={tier}
            onTierChange={(t) => {
              setTier(t);
              fetch("/api/console/tier", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tier: t }),
              }).catch(() => {});
            }}
            onClose={() => setTierPanelOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
