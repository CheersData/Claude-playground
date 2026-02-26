"use client";

import AgentLED from "./AgentLED";
import type { ConsoleAgentPhase, ConsolePhaseStatus, LeaderDecision } from "@/lib/types";

interface AgentStatus {
  status: ConsolePhaseStatus | "idle";
  summary?: string;
  timing?: number;
}

interface AgentPanelProps {
  agents: Map<ConsoleAgentPhase, AgentStatus>;
  leaderDecision: LeaderDecision | null;
}

const AGENT_LABELS: Record<ConsoleAgentPhase, string> = {
  leader: "LEADER",
  "question-prep": "Q-PREP",
  "corpus-search": "RICERCA",
  "corpus-agent": "CORPUS",
  classifier: "CLASSIFICATORE",
  retrieval: "RETRIEVAL",
  analyzer: "ANALISTA",
  investigator: "INVESTIGATORE",
  advisor: "CONSULENTE",
};

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

function getStatus(
  agents: Map<ConsoleAgentPhase, AgentStatus>,
  phase: ConsoleAgentPhase
): AgentStatus {
  return agents.get(phase) ?? { status: "idle" };
}

export default function AgentPanel({ agents, leaderDecision }: AgentPanelProps) {
  const leaderStatus = getStatus(agents, "leader");

  return (
    <aside className="pipboy-glow rounded-md bg-[var(--pb-bg-panel)] p-3">
      <h2
        className="text-xs font-bold tracking-wider mb-3 text-[var(--pb-text-dim)]"
        style={{ fontFamily: "'Space Mono', monospace" }}
      >
        AGENTI
      </h2>

      {/* Leader — always visible */}
      <AgentLED
        status={leaderStatus.status}
        label={AGENT_LABELS.leader}
        summary={leaderStatus.summary}
        timing={leaderStatus.timing}
      />

      {/* Divider */}
      <div className="h-px bg-[var(--pb-border)] my-2" />

      {/* Corpus Q&A pipeline */}
      <div className="mb-1">
        <span className="text-[10px] text-[var(--pb-text-dim)] opacity-50 tracking-wider">
          CORPUS Q&A
        </span>
      </div>
      {CORPUS_PHASES.map((phase) => {
        const s = getStatus(agents, phase);
        return (
          <AgentLED
            key={phase}
            status={s.status}
            label={AGENT_LABELS[phase]}
            summary={s.summary}
            timing={s.timing}
          />
        );
      })}

      {/* Divider */}
      <div className="h-px bg-[var(--pb-border)] my-2" />

      {/* Document analysis pipeline */}
      <div className="mb-1">
        <span className="text-[10px] text-[var(--pb-text-dim)] opacity-50 tracking-wider">
          ANALISI DOCUMENTO
        </span>
      </div>
      {DOC_PHASES.map((phase) => {
        const s = getStatus(agents, phase);
        return (
          <AgentLED
            key={phase}
            status={s.status}
            label={AGENT_LABELS[phase]}
            summary={s.summary}
            timing={s.timing}
          />
        );
      })}

      {/* Route indicator */}
      {leaderDecision && (
        <>
          <div className="h-px bg-[var(--pb-border)] my-2" />
          <div className="text-[10px] text-[var(--pb-text-dim)]">
            <span className="opacity-50">ROUTE:</span>{" "}
            <span className="text-[var(--pb-amber)]">
              {leaderDecision.route.toUpperCase()}
            </span>
          </div>
        </>
      )}
    </aside>
  );
}
