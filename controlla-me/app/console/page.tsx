"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import StudioShell from "@/components/console/StudioShell";
import ConsoleHeader from "@/components/console/ConsoleHeader";
import ConsoleInput from "@/components/console/ConsoleInput";
import AgentOutput from "@/components/console/AgentOutput";
import ReasoningGraph from "@/components/console/ReasoningGraph";
import CorpusTreePanel from "@/components/console/CorpusTreePanel";
import type {
  ConsoleAgentPhase,
  ConsolePhaseStatus,
  LeaderDecision,
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
  const [corpusOpen, setCorpusOpen] = useState(false);

  // ── Session persistence ──
  useEffect(() => {
    const stored = sessionStorage.getItem("lexmea-auth");
    if (stored) {
      try {
        const user = JSON.parse(stored) as AuthUser;
        setAuthUser(user);
        setAuthPhase("authenticated");
        setAuthMessage(
          `Bentornata, ${user.ruolo} ${user.cognome}. Come posso aiutarla?`
        );
      } catch {
        sessionStorage.removeItem("lexmea-auth");
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

      try {
        const formData = new FormData();
        if (message.trim()) formData.append("message", message);
        if (file) formData.append("file", file);

        const response = await fetch("/api/console", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

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

        setStatus((prev) => (prev === "processing" ? "done" : prev));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg =
          err instanceof Error ? err.message : "Errore di connessione";
        setError(msg);
        setStatus("error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authPhase, handleAuth]
  );

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
        onCorpusToggle={isAuthenticated ? () => setCorpusOpen((v) => !v) : undefined}
      />

      <main className="p-4 max-w-3xl mx-auto space-y-3">
        {/* Auth message — shown before authentication or as welcome */}
        {authMessage && (!isAuthenticated || (isAuthenticated && status === "idle" && !activeEvent)) && (
          <div className="pipboy-panel rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="pipboy-led pipboy-led-done" />
              <span className="text-xs font-serif italic text-[var(--pb-green)]">
                lexmea
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-[var(--pb-text)]">
              {authMessage}
            </p>
            {authPhase === "denied" && (
              <button
                onClick={() => {
                  setAuthPhase("idle");
                  setAuthMessage(AUTH_PROMPT);
                }}
                className="mt-3 text-xs text-[var(--pb-green)] hover:underline"
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

        {error && (
          <div className="pipboy-panel rounded-lg p-3 border-[var(--pb-red)]">
            <span className="text-xs text-[var(--pb-red)] font-medium">
              Errore
            </span>
            <p className="text-sm text-[var(--pb-red)] mt-1">{error}</p>
          </div>
        )}

        {/* Clarification question from Leader */}
        {status === "clarification" && clarificationQ && (
          <div className="pipboy-panel rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="pipboy-led pipboy-led-running" />
              <span className="text-xs font-medium">Leader</span>
            </div>
            <p className="text-sm text-[var(--pb-amber)]">
              {clarificationQ}
            </p>
          </div>
        )}

        {/* Leader — always first when present */}
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

        {/* Pipeline steps — all started agents shown inline */}
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

        {/* Reasoning Graph — shows detected institutes as chips */}
        {leaderDecision?.route === "corpus-qa" && collectedContext.institutes.length > 0 && (() => {
          // Determine graph phase based on pipeline state
          const corpusAgentStatus = agentStatuses.get("corpus-agent")?.status;
          const corpusSearchStatus = agentStatuses.get("corpus-search")?.status;
          const graphPhase: "question-prep" | "corpus-search" | "corpus-agent" =
            corpusAgentStatus === "done" || corpusAgentStatus === "running"
              ? "corpus-agent"
              : corpusSearchStatus === "done" || corpusSearchStatus === "running"
                ? "corpus-search"
                : "question-prep";

          // Extract scope flags from question-prep output
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
          <div className="text-xs text-[var(--pb-green)] py-2">
            Elaborazione completata.
          </div>
        )}
      </main>

      <footer className="text-center text-[10px] text-[var(--pb-text-dim)] opacity-30 py-4">
        lexmea v1.0
      </footer>

      <CorpusTreePanel open={corpusOpen} onClose={() => setCorpusOpen(false)} />
    </StudioShell>
  );
}
