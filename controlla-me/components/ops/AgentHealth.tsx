"use client";

import { Activity } from "lucide-react";

interface AgentHealthProps {
  agents: Record<string, { model: string; maxTokens: number; temperature: number }> | null;
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

export function AgentHealth({ agents }: AgentHealthProps) {
  return (
    <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4" />
        AGENT HEALTH
      </h3>

      {!agents ? (
        <p className="text-zinc-500 text-sm">Caricamento...</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(agents).map(([name, config]) => (
            <div key={name} className="flex items-center gap-3 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-zinc-300 w-28 truncate">
                {AGENT_LABELS[name] ?? name}
              </span>
              <span className="text-zinc-500 text-xs flex-1 truncate">
                {config.model}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
