"use client";

import { useState, useRef, useCallback, useEffect, useReducer } from "react";
import { motion } from "framer-motion";
import nextDynamic from "next/dynamic";

// All console components imported with ssr:false to prevent Next.js 16 Turbopack
// prerender failures ("Cannot read properties of null (reading 'useContext')").
// These are all client-only interactive components — no SSR needed.
const StudioShell = nextDynamic(() => import("@/components/console/StudioShell"), { ssr: false });
const ConsoleHeader = nextDynamic(() => import("@/components/console/ConsoleHeader"), { ssr: false });
const ConsoleInput = nextDynamic(() => import("@/components/console/ConsoleInput"), { ssr: false });
const AgentOutput = nextDynamic(() => import("@/components/console/AgentOutput"), { ssr: false });
const ReasoningGraph = nextDynamic(() => import("@/components/console/ReasoningGraph"), { ssr: false });
const CorpusTreePanel = nextDynamic(() => import("@/components/console/CorpusTreePanel"), { ssr: false });
const PowerPanel = nextDynamic(() => import("@/components/console/PowerPanel"), { ssr: false });
const CompanyPanel = nextDynamic(() => import("@/components/console/CompanyPanel"), { ssr: false });
const ShellPanel = nextDynamic(() => import("@/components/legaloffice/ShellPanel"), { ssr: false });
const TerminalPanel = nextDynamic(() => import("@/components/console/TerminalPanel").then(m => ({ default: m.TerminalPanel })), { ssr: false });
import type {
  ConsoleAgentPhase,
  ConsolePhaseStatus,
  LeaderDecision,
  ConversationTurn,
} from "@/lib/types";

type PageStatus = "idle" | "processing" | "done" | "error" | "clarification";
type AuthPhase = "idle" | "pending" | "authenticated" | "denied";

export interface AgentStatus {
  status: ConsolePhaseStatus | "idle";
  summary?: string;
  timing?: number;
  output?: Record<string, unknown>;
}

interface ActiveEvent {
  phase: ConsoleAgentPhase;
  status: ConsolePhaseStatus;
  summary?: string;
  timing?: number;
  output?: Record<string, unknown>;
}

/** Union of all possible SSE event data shapes received by processEvent */
interface SSEAgentData {
  phase: ConsoleAgentPhase;
  status: ConsolePhaseStatus;
  summary?: string;
  timing?: number;
  output?: Record<string, unknown>;
  decision?: LeaderDecision;
}

interface SSEClarificationData {
  question: string;
}

interface SSECompleteData {
  route?: string;
}

interface SSEErrorData {
  message?: string;
}

type SSEEventData = SSEAgentData | SSEClarificationData | SSECompleteData | SSEErrorData;

/** Shape of question-prep agent output as sent by the console SSE */
interface QuestionPrepOutput {
  originalQuestion: string;
  legalQuery: string;
  mechanismQuery: string | null;
  suggestedInstitutes: string[];
  targetArticles: string | null;
  questionType: "specific" | "systematic";
  needsProceduralLaw: boolean;
  needsCaseLaw: boolean;
  scopeNotes: string | null;
  keywords: string[];
}

interface CollectedContext {
  institutes: string[];
  articles: Array<{ reference: string; source: string; title?: string }>;
  targetArticles: string | null;
}

// ── Pipeline reducer: single state + single dispatch per SSE event ──
// Consolidates agentStatuses, activeEvent, collectedContext, leaderDecision
// so that each SSE event triggers exactly ONE React render cycle.

interface PipelineState {
  agentStatuses: Map<ConsoleAgentPhase, AgentStatus>;
  activeEvent: ActiveEvent | null;
  collectedContext: CollectedContext;
  leaderDecision: LeaderDecision | null;
}

const INITIAL_PIPELINE_STATE: PipelineState = {
  agentStatuses: new Map(),
  activeEvent: null,
  collectedContext: { institutes: [], articles: [], targetArticles: null },
  leaderDecision: null,
};

type PipelineAction =
  | { type: "AGENT_EVENT"; phase: ConsoleAgentPhase; agentStatus: AgentStatus; decision?: LeaderDecision }
  | { type: "CLEAR_ACTIVE_EVENT" }
  | { type: "RESET" };

function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case "AGENT_EVENT": {
      const { phase, agentStatus, decision } = action;

      // 1. Update agent statuses map
      const nextStatuses = new Map(state.agentStatuses);
      nextStatuses.set(phase, agentStatus);

      // 2. Build active event
      const nextActiveEvent: ActiveEvent = {
        phase,
        status: agentStatus.status as ConsolePhaseStatus,
        summary: agentStatus.summary,
        timing: agentStatus.timing,
        output: agentStatus.output,
      };

      // 3. Accumulate collected context (only on "done")
      let nextContext = state.collectedContext;
      if (agentStatus.status === "done" && agentStatus.output) {
        if (phase === "question-prep") {
          const output = agentStatus.output;
          nextContext = {
            ...nextContext,
            institutes: (output.suggestedInstitutes as string[] | undefined) ?? nextContext.institutes,
            targetArticles: (output.targetArticles as string | null | undefined) ?? nextContext.targetArticles,
          };
        }
        if (phase === "corpus-search") {
          const articles = agentStatus.output.articles as Array<{ reference: string; source: string; title?: string }> | undefined;
          if (articles?.length) {
            nextContext = {
              ...nextContext,
              articles: articles.map((a) => ({ reference: a.reference, source: a.source, title: a.title })),
            };
          }
        }
      }

      // 4. Update leader decision
      const nextLeaderDecision = decision ?? state.leaderDecision;

      return {
        agentStatuses: nextStatuses,
        activeEvent: nextActiveEvent,
        collectedContext: nextContext,
        leaderDecision: nextLeaderDecision,
      };
    }
    case "CLEAR_ACTIVE_EVENT":
      return { ...state, activeEvent: null };
    case "RESET":
      return { ...INITIAL_PIPELINE_STATE, agentStatuses: new Map() };
    default:
      return state;
  }
}

interface AuthUser {
  nome: string;
  cognome: string;
  ruolo: string;
}

/** Response shape from POST /api/console/auth */
interface AuthResponse {
  authorized: boolean;
  user?: AuthUser;
  token?: string;
  message: string;
}

const AGENT_DISPLAY_NAMES: Record<ConsoleAgentPhase, string> = {
  leader: "Leader",
  "question-prep": "Question Prep",
  "corpus-search": "Ricerca Corpus",
  "corpus-agent": "Corpus Agent",
  classifier: "Classificatore",
  retrieval: "Retrieval",
  analyzer: "Analista",
  investigator: "Investigatore",
  advisor: "Consulente",
};

const AUTH_PROMPT = `Buongiorno. Sono il sistema lexmea.\nPer procedere, ho bisogno di identificarla.\n\nInserisca: Nome Cognome, Ruolo\n(Esempio: Mario Rossi, Avvocato)`;

const CORPUS_PHASES: ConsoleAgentPhase[] = [
  "question-prep",
  "corpus-search",
  "investigator",
  "corpus-agent",
];

const DOC_PHASES: ConsoleAgentPhase[] = [
  "classifier",
  "retrieval",
  "analyzer",
  "investigator",
  "advisor",
];

export default function ConsolePageClient() {
  // ── Auth state ──
  const [authPhase, setAuthPhase] = useState<AuthPhase>("idle");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMessage, setAuthMessage] = useState<string>(AUTH_PROMPT);

  // ── Pipeline state (single reducer = single render per SSE event) ──
  const [status, setStatus] = useState<PageStatus>("idle");
  const [pipeline, dispatchPipeline] = useReducer(pipelineReducer, INITIAL_PIPELINE_STATE);
  const { agentStatuses, activeEvent, collectedContext, leaderDecision } = pipeline;
  // Ref keeps context in sync for use inside AgentOutput context prop (avoids stale closure)
  const contextRef = useRef<CollectedContext>({ institutes: [], articles: [], targetArticles: null });
  // Keep contextRef in sync with reducer state
  useEffect(() => { contextRef.current = collectedContext; }, [collectedContext]);
  const [clarificationQ, setClarificationQ] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Session Memory ──
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  // Store last submit params for retry
  const retryParamsRef = useRef<{ message: string; file: File | null } | null>(null);
  // Queue: message waiting while processing
  const queuedRef = useRef<{ message: string; file: File | null } | null>(null);
  const [corpusOpen, setCorpusOpen] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [shellOpen, setShellOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  // ── Session persistence ──
  useEffect(() => {
    const stored = sessionStorage.getItem("lexmea-auth");
    const token = sessionStorage.getItem("lexmea-token");
    if (stored && token) {
      try {
        // Verifica client-side che il token non sia scaduto (decodifica base64url payload)
        const payloadB64 = token.split(".")[0];
        const payload: { exp: number } = JSON.parse(
          atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/").padEnd(
            payloadB64.length + ((4 - (payloadB64.length % 4)) % 4), "="
          ))
        );
        if (Date.now() > payload.exp) {
          // Token scaduto: pulisci e richiedi nuova autenticazione
          sessionStorage.removeItem("lexmea-auth");
          sessionStorage.removeItem("lexmea-token");
          return;
        }
        const user = JSON.parse(stored) as AuthUser;
        setAuthUser(user);
        setAuthPhase("authenticated");
        setAuthMessage(
          `Bentornata, ${user.ruolo} ${user.cognome}. Come posso aiutarla?`
        );
      } catch {
        sessionStorage.removeItem("lexmea-auth");
        sessionStorage.removeItem("lexmea-token");
      }
    }
  }, []);

  // ── Auth handler ──
  const handleAuth = useCallback(async (input: string) => {
    setAuthPhase("pending");
    setAuthMessage("Verifico le credenziali...");

    try {
      const res = await fetch("/api/console/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });

      const data = (await res.json()) as AuthResponse;

      if (data.authorized && data.user) {
        setAuthUser(data.user);
        setAuthPhase("authenticated");
        setAuthMessage(data.message);
        sessionStorage.setItem("lexmea-auth", JSON.stringify(data.user));
        // SEC-004: salva il token HMAC per le chiamate successive
        if (data.token) sessionStorage.setItem("lexmea-token", data.token);
      } else {
        setAuthPhase("denied");
        setAuthMessage(data.message);
      }
    } catch {
      setAuthPhase("idle");
      setAuthMessage("Errore di connessione. Riprovare.\n\n" + AUTH_PROMPT);
    }
  }, []);

  // ── Pipeline submit ──
  const handleSubmit = useCallback(
    async (message: string, file: File | null) => {
      // Auth gate
      if (authPhase !== "authenticated") {
        handleAuth(message);
        return;
      }

      // Queue: se sta già elaborando, accoda il messaggio e aspetta
      if (status === "processing") {
        queuedRef.current = { message, file };
        return;
      }

      // Salva per retry
      retryParamsRef.current = { message, file };

      setStatus("processing");
      dispatchPipeline({ type: "RESET" });
      setClarificationQ(null);
      setError(null);

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Timeout 5 minuti (matching server maxDuration=300)
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        controller.abort();
        setError("Timeout: elaborazione superata 5 minuti. Riprova.");
        setStatus("error");
      }, 300_000);

      // Appende turno utente alla history
      const userTurn: ConversationTurn = {
        role: "user",
        content: message || (file ? `[Documento: ${file.name}]` : ""),
        fileName: file?.name,
        timestamp: Date.now(),
      };

      try {
        const formData = new FormData();
        if (message.trim()) formData.append("message", message);
        if (file) formData.append("file", file);

        // Session memory: invia gli ultimi 5 turni
        const historyToSend = conversationHistory.slice(-5);
        if (historyToSend.length > 0) {
          formData.append("history", JSON.stringify(historyToSend));
        }

        // SEC-004: invia token JWT nell'header Authorization
        const token = sessionStorage.getItem("lexmea-token");
        const response = await fetch("/api/console", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          // SEC-004: token scaduto → reset auth e richiedi nuova autenticazione
          if (response.status === 401) {
            sessionStorage.removeItem("lexmea-auth");
            sessionStorage.removeItem("lexmea-token");
            setAuthUser(null);
            setAuthPhase("idle");
            setAuthMessage(AUTH_PROMPT);
            setStatus("idle");
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let finalRoute: string | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
              eventData = "";
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);

              if (eventType && eventData) {
                try {
                  const data = JSON.parse(eventData) as SSEEventData;
                  if (eventType === "complete" && "route" in data && typeof (data as SSECompleteData).route === "string") {
                    finalRoute = (data as SSECompleteData).route;
                  }
                  processEvent(eventType, data);
                } catch {
                  // Skip malformed
                }
                eventType = "";
                eventData = "";
              }
            }
          }
        }

        // Appende turno assistant alla history con sintesi
        const assistantTurn: ConversationTurn = {
          role: "assistant",
          content: finalRoute
            ? `Pipeline completata: ${finalRoute}`
            : "Elaborazione completata",
          route: finalRoute as ConversationTurn["route"],
          timestamp: Date.now(),
        };
        setConversationHistory((prev) => [...prev, userTurn, assistantTurn].slice(-10));

        setStatus((prev) => (prev === "processing" ? "done" : prev));

        // Esegui messaggio in coda (se presente)
        const queued = queuedRef.current;
        if (queued) {
          queuedRef.current = null;
          setTimeout(() => handleSubmit(queued.message, queued.file), 100);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg =
          err instanceof Error ? err.message : "Errore di connessione";
        setError(msg);
        setStatus("error");
      } finally {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authPhase, handleAuth, status, conversationHistory]
  );

  // ── Abort handler ──
  const handleAbort = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    queuedRef.current = null;
    setStatus("idle");
    setError(null);
  }, []);

  // ── Retry handler ──
  const handleRetry = useCallback(() => {
    if (retryParamsRef.current) {
      handleSubmit(retryParamsRef.current.message, retryParamsRef.current.file);
    }
  }, [handleSubmit]);

  // Track status in a ref so processEvent can read the latest value
  // without needing status in its dependency array (avoids stale closure).
  const statusRef = useRef<PageStatus>(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  const processEvent = useCallback((eventType: string, data: SSEEventData) => {
    switch (eventType) {
      case "agent": {
        const agentData = data as SSEAgentData;
        // Single dispatch → single React render for all pipeline state changes
        dispatchPipeline({
          type: "AGENT_EVENT",
          phase: agentData.phase,
          agentStatus: {
            status: agentData.status,
            summary: agentData.summary,
            timing: agentData.timing,
            output: agentData.output,
          },
          decision: agentData.phase === "leader" ? agentData.decision : undefined,
        });
        break;
      }
      case "clarification": {
        const clarData = data as SSEClarificationData;
        setClarificationQ(clarData.question);
        dispatchPipeline({ type: "CLEAR_ACTIVE_EVENT" });
        setStatus("clarification");
        break;
      }
      case "complete":
        if (statusRef.current !== "clarification") {
          setStatus("done");
        }
        break;
      case "error": {
        const errData = data as SSEErrorData;
        if (errData.message) {
          setError(errData.message);
          setStatus("error");
        }
        break;
      }
    }
  }, []);

  const isProcessing = status === "processing";
  const isAuthenticated = authPhase === "authenticated";
  const headerUserName = authUser
    ? `${authUser.ruolo} ${authUser.cognome}`
    : null;

  // Determine pipeline phase order based on leader route
  const pipelinePhases: ConsoleAgentPhase[] = leaderDecision
    ? leaderDecision.route === "corpus-qa"
      ? CORPUS_PHASES
      : DOC_PHASES
    : [];

  return (
    <StudioShell>
      <ConsoleHeader
        status={status}
        userName={headerUserName}
        corpusActive={corpusOpen}
        onCorpusToggle={isAuthenticated ? () => { setCorpusOpen((v) => !v); setCompanyOpen(false); } : undefined}
        onPowerToggle={isAuthenticated ? () => setPowerOpen((v) => !v) : undefined}
        onShellToggle={() => setShellOpen((v) => !v)}
        onTerminalToggle={() => setTerminalOpen((v) => !v)}
        onCompanyToggle={isAuthenticated ? () => { setCompanyOpen((v) => !v); setCorpusOpen(false); } : undefined}
        onPrint={() => window.print()}
      />

      {companyOpen ? (
        <CompanyPanel open={companyOpen} onClose={() => setCompanyOpen(false)} />
      ) : corpusOpen ? (
        <CorpusTreePanel open={corpusOpen} onClose={() => setCorpusOpen(false)} />
      ) : (
        <>
          <main className="px-4 py-4 md:px-8 md:py-6 max-w-3xl mx-auto space-y-4">
            {/* Auth message */}
            {authMessage && (!isAuthenticated || (isAuthenticated && status === "idle" && !activeEvent)) && (
              <div className="rounded-xl border border-[var(--border-subtle)] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-block w-[7px] h-[7px] rounded-full bg-[var(--foreground)]" />
                  <span className="text-xs font-serif italic text-[var(--foreground)]">
                    lexmea
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed text-[var(--foreground)]">
                  {authMessage}
                </p>
                {authPhase === "denied" && (
                  <button
                    onClick={() => {
                      setAuthPhase("idle");
                      setAuthMessage(AUTH_PROMPT);
                    }}
                    className="mt-3 text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:underline transition-colors"
                  >
                    Riprovare
                  </button>
                )}
              </div>
            )}

            <ConsoleInput
              onSubmit={handleSubmit}
              disabled={isProcessing || authPhase === "pending"}
              placeholder={
                !isAuthenticated
                  ? "Inserisca nome, cognome e ruolo..."
                  : clarificationQ
                    ? "Rispondi alla domanda sopra..."
                    : undefined
              }
            />

            {/* Abort button while processing */}
            {status === "processing" && (
              <div className="flex justify-end">
                <button
                  onClick={handleAbort}
                  className="text-xs text-[var(--foreground-tertiary)] hover:text-red-500 hover:underline transition-colors"
                >
                  Interrompi elaborazione
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50/50 p-4">
                <span className="text-xs text-red-500 font-medium">Errore</span>
                <p className="text-sm text-red-500 mt-1">{error}</p>
                {retryParamsRef.current && (
                  <button
                    onClick={handleRetry}
                    className="mt-3 text-xs text-red-500 hover:text-red-700 hover:underline transition-colors"
                  >
                    Riprova
                  </button>
                )}
              </div>
            )}

            {/* Clarification */}
            {status === "clarification" && clarificationQ && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="relative inline-flex w-[7px] h-[7px]">
                    <motion.span
                      className="absolute inset-0 rounded-full bg-amber-500"
                      animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                    />
                    <motion.span
                      className="relative block w-[7px] h-[7px] rounded-full bg-amber-500"
                      animate={{ scale: [1, 1.2, 1], opacity: [1, 0.85, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </span>
                  <span className="text-xs font-medium text-[var(--foreground)]">Leader</span>
                </div>
                <p className="text-sm text-amber-700">{clarificationQ}</p>
              </div>
            )}

            {/* Leader */}
            {agentStatuses.has("leader") && (() => {
              const s = agentStatuses.get("leader")!;
              return (
                <AgentOutput
                  key="leader"
                  phase="leader"
                  phaseName={AGENT_DISPLAY_NAMES.leader}
                  status={s.status === "idle" ? "running" : s.status as ConsolePhaseStatus}
                  summary={s.summary}
                  timing={s.timing}
                  output={s.output}
                />
              );
            })()}

            {/* Pipeline steps */}
            {pipelinePhases.map((phase) => {
              const s = agentStatuses.get(phase);
              if (!s || s.status === "idle") return null;

              const isRunning = s.status === "running";
              const showContext =
                (phase === "corpus-agent" || phase === "investigator") && isRunning;

              return (
                <AgentOutput
                  key={phase}
                  phase={phase}
                  phaseName={AGENT_DISPLAY_NAMES[phase]}
                  status={s.status as ConsolePhaseStatus}
                  summary={s.summary}
                  timing={s.timing}
                  output={s.output}
                  context={showContext ? contextRef.current : undefined}
                />
              );
            })}

            {/* Reasoning Graph */}
            {leaderDecision?.route === "corpus-qa" && collectedContext.institutes.length > 0 && (() => {
              const corpusAgentStatus = agentStatuses.get("corpus-agent")?.status;
              const corpusSearchStatus = agentStatuses.get("corpus-search")?.status;
              const graphPhase: "question-prep" | "corpus-search" | "corpus-agent" =
                corpusAgentStatus === "done" || corpusAgentStatus === "running"
                  ? "corpus-agent"
                  : corpusSearchStatus === "done" || corpusSearchStatus === "running"
                    ? "corpus-search"
                    : "question-prep";

              const prepOutput = agentStatuses.get("question-prep")?.output as QuestionPrepOutput | undefined;

              return (
                <ReasoningGraph
                  institutes={collectedContext.institutes}
                  needsProceduralLaw={prepOutput?.needsProceduralLaw}
                  needsCaseLaw={prepOutput?.needsCaseLaw}
                  scopeNotes={prepOutput?.scopeNotes}
                  questionType={prepOutput?.questionType}
                  phase={graphPhase}
                />
              );
            })()}

            {status === "done" && activeEvent?.status !== "done" && (
              <div className="text-xs text-[var(--foreground-tertiary)] py-2">
                Elaborazione completata.
              </div>
            )}
          </main>

          <footer className="text-center text-[10px] text-[var(--foreground-tertiary)] opacity-30 py-4">
            lexmea v1.0
          </footer>
        </>
      )}

      <PowerPanel open={powerOpen} onClose={() => setPowerOpen(false)} />
      <ShellPanel open={shellOpen} onClose={() => setShellOpen(false)} />
      {terminalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setTerminalOpen(false)}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="relative w-[520px] max-w-[92vw] h-full bg-[var(--background)] flex flex-col shadow-2xl border-l border-[var(--border)]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className="text-xs font-semibold text-[var(--foreground)]">Terminal</span>
              <button
                onClick={() => setTerminalOpen(false)}
                className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Chiudi Terminal"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TerminalPanel />
            </div>
          </motion.aside>
        </div>
      )}
    </StudioShell>
  );
}
