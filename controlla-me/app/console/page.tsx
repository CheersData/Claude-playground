"use client";

import { useState, useRef, useCallback } from "react";
import PipBoyShell from "@/components/console/PipBoyShell";
import ConsoleHeader from "@/components/console/ConsoleHeader";
import ConsoleInput from "@/components/console/ConsoleInput";
import AgentPanel from "@/components/console/AgentPanel";
import OutputPanel from "@/components/console/OutputPanel";
import type { ConsoleAgentPhase, ConsolePhaseStatus, LeaderDecision } from "@/lib/types";

type PageStatus = "idle" | "processing" | "done" | "error";

interface AgentStatus {
  status: ConsolePhaseStatus | "idle";
  summary?: string;
  timing?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConsoleResult = any;

export default function ConsolePage() {
  const [status, setStatus] = useState<PageStatus>("idle");
  const [leaderDecision, setLeaderDecision] = useState<LeaderDecision | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Map<ConsoleAgentPhase, AgentStatus>>(new Map());
  const [results, setResults] = useState<ConsoleResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  const handleSubmit = useCallback(
    async (message: string, file: File | null) => {
      // Reset state
      setStatus("processing");
      setLeaderDecision(null);
      setAgentStatuses(new Map());
      setResults([]);
      setError(null);

      // Abort previous request
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

          // Parse SSE events from buffer
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
                  handleSSEEvent(eventType, data);
                } catch {
                  // Skip malformed JSON
                }
                eventType = "";
                eventData = "";
              }
            }
          }
        }

        // If we reach here without explicit complete/error, mark as done
        setStatus((prev) => (prev === "processing" ? "done" : prev));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Errore di connessione";
        setError(msg);
        setStatus("error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSSEEvent = useCallback((eventType: string, data: any) => {
    switch (eventType) {
      case "agent": {
        const phase = data.phase as ConsoleAgentPhase;
        updateAgent(phase, {
          status: data.status,
          summary: data.summary,
          timing: data.timing,
        });

        // Capture leader decision
        if (phase === "leader" && data.decision) {
          setLeaderDecision(data.decision);
        }
        break;
      }
      case "result":
        setResults((prev) => [...prev, data]);
        break;
      case "complete":
        setStatus("done");
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

  return (
    <PipBoyShell>
      <ConsoleHeader status={status} />

      <main className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 p-4 max-w-7xl mx-auto">
        {/* Left: Input + Output */}
        <div className="space-y-4 min-w-0">
          <ConsoleInput onSubmit={handleSubmit} disabled={isProcessing} />

          {/* Status bar when processing */}
          {isProcessing && (
            <div className="text-xs text-[var(--pb-green)] flex items-center gap-2">
              <span className="pipboy-cursor">&gt;</span>
              <span>Elaborazione in corso...</span>
            </div>
          )}

          {/* Done status */}
          {status === "done" && results.length > 0 && (
            <div className="text-xs text-[var(--pb-green)]">
              &gt; Analisi completata.
            </div>
          )}

          <OutputPanel results={results} error={error} />
        </div>

        {/* Right: Agent Panel */}
        <AgentPanel
          agents={agentStatuses}
          leaderDecision={leaderDecision}
        />
      </main>

      {/* Footer */}
      <footer className="text-center text-[10px] text-[var(--pb-text-dim)] opacity-30 py-4">
        LEXMEA CONSOLE v1.0 — Powered by AI agents
      </footer>
    </PipBoyShell>
  );
}
