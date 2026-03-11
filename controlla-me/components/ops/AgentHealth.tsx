"use client";

import { Activity } from "lucide-react";

interface AgentInfo {
  model: string;
  maxTokens: number;
  temperature: number;
  /** Whether the agent is enabled. Undefined = assume enabled (backward compat). */
  enabled?: boolean;
  /** Position in the fallback chain (0 = primary model, >0 = using fallback). */
  chainPosition?: number;
}

interface AgentHealthProps {
  agents: Record<string, AgentInfo> | null;
}

const AGENT_LABELS: Record<string, string> = {
  classifier: "Classifier",
  analyzer: "Analyzer",
  investigator: "Investigator",
  advisor: "Advisor",
  "corpus-agent": "Corpus Agent",
  "question-prep": "Question Prep",
  leader: "Leader",
};

/**
 * Determine dot color based on agent status:
 * - Green (--success): enabled and running on primary model
 * - Yellow (--accent): enabled but running on a fallback model (degraded)
 * - Red (--error): disabled or has errors
 */
function getStatusColor(agent: AgentInfo): string {
  const enabled = agent.enabled ?? true;
  if (!enabled) return "bg-[var(--error)]";
  if (agent.chainPosition !== undefined && agent.chainPosition > 0) return "bg-[var(--accent)]";
  return "bg-[var(--success)]";
}

function getStatusLabel(agent: AgentInfo): string {
  const enabled = agent.enabled ?? true;
  if (!enabled) return "Disabilitato";
  if (agent.chainPosition !== undefined && agent.chainPosition > 0) return `Fallback #${agent.chainPosition}`;
  return "OK";
}

export function AgentHealth({ agents }: AgentHealthProps) {
  // Count active/total agents
  const agentEntries = agents ? Object.entries(agents) : [];
  const totalAgents = agentEntries.length;
  const activeAgents = agentEntries.filter(([, c]) => c.enabled !== false).length;

  return (
    <div className="bg-[var(--bg-raised)] rounded-xl p-6 border border-[var(--border-dark-subtle)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--fg-invisible)] flex items-center gap-2 uppercase tracking-wider text-xs">
          <Activity className="w-4 h-4" />
          Agent Health
        </h3>
        {agents && (
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-lg"
            style={{
              background: activeAgents === totalAgents ? "rgba(93,228,199,0.1)" : "rgba(229,141,120,0.1)",
              color: activeAgents === totalAgents ? "var(--success)" : "var(--error)",
            }}
          >
            {activeAgents}/{totalAgents} attivi
          </span>
        )}
      </div>

      {!agents ? (
        <p className="text-[var(--fg-invisible)] text-sm">Caricamento...</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(agents).map(([name, config]) => (
            <div key={name} className="flex items-center gap-3 text-sm">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(config)}`}
                title={getStatusLabel(config)}
              />
              <span className="text-[var(--fg-secondary)] w-28 truncate">
                {AGENT_LABELS[name] ?? name}
              </span>
              <span className="text-[var(--fg-invisible)] text-xs flex-1 truncate font-mono">
                {config.model}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
