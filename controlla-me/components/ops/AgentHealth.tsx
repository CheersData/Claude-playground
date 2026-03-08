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
 * - Green (--ops-teal): enabled and running on primary model
 * - Yellow (--ops-accent): enabled but running on a fallback model (degraded)
 * - Red (--ops-error): disabled or has errors
 */
function getStatusColor(agent: AgentInfo): string {
  const enabled = agent.enabled ?? true;
  if (!enabled) return "bg-[var(--ops-error)]";
  if (agent.chainPosition !== undefined && agent.chainPosition > 0) return "bg-[var(--ops-accent)]";
  return "bg-[var(--ops-teal)]";
}

function getStatusLabel(agent: AgentInfo): string {
  const enabled = agent.enabled ?? true;
  if (!enabled) return "Disabilitato";
  if (agent.chainPosition !== undefined && agent.chainPosition > 0) return `Fallback #${agent.chainPosition}`;
  return "OK";
}

export function AgentHealth({ agents }: AgentHealthProps) {
  return (
    <div className="bg-[var(--ops-surface)] rounded-xl p-6 border border-[var(--ops-border-subtle)]">
      <h3 className="text-sm font-semibold text-[var(--ops-muted)] flex items-center gap-2 mb-4 uppercase tracking-wider text-xs">
        <Activity className="w-4 h-4" />
        Agent Health
      </h3>

      {!agents ? (
        <p className="text-[var(--ops-muted)] text-sm">Caricamento...</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(agents).map(([name, config]) => (
            <div key={name} className="flex items-center gap-3 text-sm">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(config)}`}
                title={getStatusLabel(config)}
              />
              <span className="text-[var(--ops-fg-muted)] w-28 truncate">
                {AGENT_LABELS[name] ?? name}
              </span>
              <span className="text-[var(--ops-muted)] text-xs flex-1 truncate font-mono">
                {config.model}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
