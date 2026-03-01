"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import StudioShell from "@/components/console/StudioShell";
import ConsoleHeader from "@/components/console/ConsoleHeader";
import ConsoleInput from "@/components/console/ConsoleInput";
import AgentOutput from "@/components/console/AgentOutput";
import ReasoningGraph from "@/components/console/ReasoningGraph";
import CorpusTreePanel from "@/components/console/CorpusTreePanel";
import PowerPanel from "@/components/console/PowerPanel";
import CompanyPanel from "@/components/console/CompanyPanel";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
}

interface ActiveEvent {
  phase: ConsoleAgentPhase;
  status: ConsolePhaseStatus;
  summary?: string;
  timing?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
}

interface CollectedContext {
  institutes: string[];
  articles: Array<{ reference: string; source: string; title?: string }>;
  targetArticles: string | null;
}

interface AuthUser {
  nome: string;
  cognome: string;
  ruolo: string;
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

export default function ConsolePage() {
  // ── Auth state ──
  const [authPhase, setAuthPhase] = useState<AuthPhase>("idle");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMessage, setAuthMessage] = useState<string>(AUTH_PROMPT);

  // ── Pipeline state ──
  const [status, setStatus] = useState<PageStatus>("idle");
  const [leaderDecision, setLeaderDecision] = useState<LeaderDecision | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<
    Map<ConsoleAgentPhase, AgentStatus>
  >(new Map());
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [collectedContext, setCollectedContext] = useState<CollectedContext>({
    institutes: [],
    articles: [],
    targetArticles: null,
  });
  // Ref keeps context in sync for use inside processEvent (avoids stale closure)
  const contextRef = useRef<CollectedContext>({ institutes: [], articles: [], targetArticles: null });
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

  // ── Session persistence ──
  useEffect(() => {
    const stored = sessionStorage.getItem("lexmea-auth");
    const token = sessionStorage.getItem("lexmea-token");
    if (stored && token) {
      try {
        // Verifica client-side che il token non sia scaduto (decodifica base64url payload)
        const payloadB64 = token.split(".")[0];
        const payload = JSON.parse(
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

  const updateAgent = useCallback(
    (phase: ConsoleAgentPhase, update: AgentStatus) => {
      setAgentStatuses((prev) => {
        const next = new Map(prev);
        next.set(phase, update);
        return next;
      });
    },
    []
  );

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

      const data = await res.json();

      if (data.authorized) {
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
      setLeaderDecision(null);
      setAgentStatuses(new Map());
      setActiveEvent(null);
      setCollectedContext({ institutes: [], articles: [], targetArticles: null });
      contextRef.current = { institutes: [], articles: [], targetArticles: null };
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
                  const data = JSON.parse(eventData);
                  if (eventType === "complete" && data.route) {
                    finalRoute = data.route;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processEvent = useCallback((eventType: string, data: any) => {
    switch (eventType) {
      case "agent": {
        const phase = data.phase as ConsoleAgentPhase;
        updateAgent(phase, {
          status: data.status,
          summary: data.summary,
          timing: data.timing,
          output: data.output,
        });

        setActiveEvent({
          phase,
          status: data.status,
          summary: data.summary,
          timing: data.timing,
          output: data.output,
        });

        // Accumulate context using ref (sync) + state (render)
        if (data.status === "done") {
          if (phase === "question-prep" && data.output) {
            const updated = {
              ...contextRef.current,
              institutes: data.output.suggestedInstitutes ?? contextRef.current.institutes,
              targetArticles: data.output.targetArticles ?? contextRef.current.targetArticles,
            };
            contextRef.current = updated;
            setCollectedContext(updated);
          }

          if (phase === "corpus-search" && data.output?.articles?.length) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const arts = data.output.articles.map((a: any) => ({
              reference: a.reference,
              source: a.source,
              title: a.title,
            }));
            const updated = { ...contextRef.current, articles: arts };
            contextRef.current = updated;
            setCollectedContext(updated);
          }
        }

        if (phase === "leader" && data.decision) {
          setLeaderDecision(data.decision);
        }
        break;
      }
      case "clarification":
        setClarificationQ(data.question);
        setActiveEvent(null);
        setStatus("clarification");
        break;
      case "complete":
        if (status !== "clarification") {
          setStatus("done");
        }
        break;
      case "error":
        if (data.message) {
          setError(data.message);
          setStatus("error");
        }
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <div className="rounded-xl border border-[#F0F0F0] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-block w-[7px] h-[7px] rounded-full bg-[#1A1A1A]" />
                  <span className="text-xs font-serif italic text-[#1A1A1A]">
                    lexmea
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed text-[#1A1A1A]">
                  {authMessage}
                </p>
                {authPhase === "denied" && (
                  <button
                    onClick={() => {
                      setAuthPhase("idle");
                      setAuthMessage(AUTH_PROMPT);
                    }}
                    className="mt-3 text-xs text-[#6B6B6B] hover:text-[#1A1A1A] hover:underline transition-colors"
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
                  className="text-xs text-[#9B9B9B] hover:text-red-500 hover:underline transition-colors"
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
                  <span className="inline-block w-[7px] h-[7px] rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-medium text-[#1A1A1A]">Leader</span>
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

              const prepOutput = agentStatuses.get("question-prep")?.output;

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
              <div className="text-xs text-[#9B9B9B] py-2">
                Elaborazione completata.
              </div>
            )}
          </main>

          <footer className="text-center text-[10px] text-[#9B9B9B] opacity-30 py-4">
            lexmea v1.0
          </footer>
        </>
      )}

      <PowerPanel open={powerOpen} onClose={() => setPowerOpen(false)} />
    </StudioShell>
  );
}
