"use client";

/**
 * TerminalMonitor — Terminal Control Panel for /ops "Terminali" tab.
 *
 * Split-panel layout using reusable components from components/console/:
 *   +----------------------------+----------------------------------+
 *   | TERMINAL LIST (left)       | OUTPUT PANEL (right)             |
 *   | - TerminalPanel cards      | - TerminalOutputViewer stream    |
 *   |   + expandable agents      | - chat input for console sessions|
 *   +----------------------------+----------------------------------+
 *
 * On mobile, stacks vertically with the output viewer below the terminal list.
 *
 * ADR-005: Terminal/Agent Monitoring Architecture
 */

import { useState } from "react";
import { TerminalPanel } from "@/components/console/TerminalPanel";
import { TerminalOutputViewer } from "@/components/console/TerminalOutputViewer";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SessionInfo {
  pid: number;
  type: "console" | "task-runner" | "daemon" | "interactive";
  target: string;
  department?: string;
  currentTask?: string;
  startedAt: string;
  status: "active" | "closing";
  agentCount: number;
  agents: Array<{
    id: string;
    department: string;
    status: "running" | "done" | "error";
    task?: string;
    timestamp: number;
  }>;
  sessionId?: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TerminalMonitor() {
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);

  return (
    <div className="h-full flex flex-col md:flex-row min-h-0">
      {/* Left panel: terminal list */}
      <div
        className="w-full md:w-80 lg:w-96 flex-none flex flex-col min-h-0 md:max-h-full overflow-hidden"
        style={{ borderRight: "1px solid var(--border-dark-subtle)" }}
      >
        <TerminalPanel
          selectedPid={selectedSession?.pid ?? null}
          onSelectSession={(session) =>
            setSelectedSession((prev) =>
              prev?.pid === session.pid ? null : session as SessionInfo
            )
          }
        />
      </div>

      {/* Right panel: output viewer */}
      <div className="flex-1 flex flex-col min-h-0" style={{ background: "#0a0a0a" }}>
        <TerminalOutputViewer
          pid={selectedSession?.pid ?? null}
          sessionType={selectedSession?.type}
          sessionTarget={selectedSession?.target}
          showChatInput={selectedSession?.type === "console"}
          sessionId={selectedSession?.sessionId}
        />
      </div>
    </div>
  );
}
