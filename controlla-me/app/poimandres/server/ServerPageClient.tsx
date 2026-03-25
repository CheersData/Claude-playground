"use client";

/**
 * ServerPageClient — Pagina dedicata server health per poimandres.work/server.
 *
 * Layout full-screen in stile terminale con:
 * - Header con titolo e status
 * - ServerHealthTerminal (metriche complete)
 * - BossTerminal (CLI interattivo) sotto
 */

import { useState, useEffect } from "react";
import { Server, Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { ServerHealthTerminal } from "@/components/ops/ServerHealthTerminal";

export function ServerPageClient() {
  const [showTerminal, setShowTerminal] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  // Check auth from sessionStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = sessionStorage.getItem("ops-token");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial hydration from sessionStorage
    setIsAuthed(!!token);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      sessionStorage.setItem("ops-token", tokenInput.trim());
      setIsAuthed(true);
    }
  };

  // ── Login gate ──
  if (!isAuthed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0d0e17" }}
      >
        <form
          onSubmit={handleLogin}
          className="rounded-lg p-6 w-full max-w-sm"
          style={{ background: "#1a1b26", border: "1px solid #2a2b3d" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-5 h-5" style={{ color: "#5de4c7" }} />
            <span className="font-mono text-sm font-bold" style={{ color: "#e4f0fb" }}>
              Server Access
            </span>
          </div>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Console token"
            className="w-full px-3 py-2 rounded font-mono text-sm mb-3"
            style={{
              background: "#16171f",
              border: "1px solid #2a2b3d",
              color: "#e4f0fb",
              outline: "none",
            }}
            autoFocus
          />
          <button
            type="submit"
            className="w-full py-2 rounded font-mono text-sm font-bold transition-colors"
            style={{
              background: "#5de4c7",
              color: "#0d0e17",
            }}
          >
            Accedi
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0d0e17" }}>
      {/* ── Header ── */}
      <header
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid #2a2b3d" }}
      >
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5" style={{ color: "#5de4c7" }} />
          <span className="font-mono text-sm font-bold" style={{ color: "#e4f0fb" }}>
            Poimandres Server
          </span>
        </div>
        <a
          href="/console"
          className="font-mono text-xs px-3 py-1.5 rounded transition-colors hover:bg-white/5"
          style={{ color: "#767c9d", border: "1px solid #2a2b3d" }}
        >
          Console
        </a>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* ── Server Health ── */}
        <ServerHealthTerminal pollInterval={15000} />

        {/* ── Collapsible Boss Terminal ── */}
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: "#1a1b26", border: "1px solid #2a2b3d" }}
        >
          <button
            onClick={() => setShowTerminal(!showTerminal)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" style={{ color: "#FFC832" }} />
              <span className="font-mono text-xs font-bold" style={{ color: "#e4f0fb" }}>
                Terminale interattivo
              </span>
            </div>
            {showTerminal ? (
              <ChevronUp className="w-3.5 h-3.5" style={{ color: "#767c9d" }} />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" style={{ color: "#767c9d" }} />
            )}
          </button>
          {showTerminal && (
            <div style={{ height: "400px", borderTop: "1px solid #2a2b3d" }}>
              <BossTerminalLazy />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Lazy-load BossTerminal to avoid heavy initial bundle ──
function BossTerminalLazy() {
  const [BossTerminal, setBossTerminal] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    import("@/components/ops/BossTerminal").then((mod) => {
      setBossTerminal(() => mod.BossTerminal);
    });
  }, []);

  if (!BossTerminal) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="font-mono text-xs" style={{ color: "#767c9d" }}>
          Caricamento terminale...
        </span>
      </div>
    );
  }

  return <BossTerminal />;
}
