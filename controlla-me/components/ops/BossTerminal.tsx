"use client";

/**
 * BossTerminal — Interactive CLI terminal panel for /ops.
 *
 * Lets the boss run whitelisted CLI commands from the browser.
 * Connects to POST /api/ops/exec via SSE and streams stdout/stderr.
 * Kill running processes via DELETE /api/ops/exec/:pid.
 *
 * Features:
 *   - Autocomplete dropdown for allowed commands
 *   - Command history with up/down arrows
 *   - Auto-scroll output with pause detection
 *   - Green text for stdout, red for stderr
 *   - Exit code display
 *   - Kill button for running processes
 *   - Clear button to reset output
 *   - Ctrl+C to kill running process
 *
 * SSE Protocol (from /api/ops/exec):
 *   event: started  — { pid, command }
 *   event: output   — { stream: "stdout", text }
 *   event: error    — { stream: "stderr", text }
 *   event: exit     — { code, signal, pid }
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  X,
  Play,
  Square,
  Trash2,
  ChevronDown,
  Loader2,
  ArrowDown,
} from "lucide-react";
import { getConsoleJsonHeaders } from "@/lib/utils/console-client";

// ── Types ────────────────────────────────────────────────────────────────────

interface OutputLine {
  id: number;
  text: string;
  stream: "stdout" | "stderr" | "system";
  timestamp: number;
}

type ProcessState = "idle" | "running" | "done";

// ── Allowed commands (for autocomplete) ──────────────────────────────────────

const ALLOWED_COMMANDS = [
  {
    command: "npx tsx scripts/company-tasks.ts board",
    label: "Task Board",
    desc: "Stato azienda: task per dipartimento e priorita",
  },
  {
    command: "npx tsx scripts/company-tasks.ts list",
    label: "Task List",
    desc: "Lista completa task con filtri",
  },
  {
    command: "npx tsx scripts/company-tasks.ts list --status open",
    label: "Task aperti",
    desc: "Solo task in stato open",
  },
  {
    command: "npx tsx scripts/company-tasks.ts list --status in_progress",
    label: "Task in corso",
    desc: "Solo task in stato in_progress",
  },
  {
    command: "npx tsx scripts/forma-mentis.ts context",
    label: "Forma Mentis Context",
    desc: "Contesto aziendale: sessioni recenti, warning, goals",
  },
  {
    command: "npx tsx scripts/forma-mentis.ts goals",
    label: "Forma Mentis Goals",
    desc: "Obiettivi aziendali: OKR, KPI, milestones",
  },
  {
    command: "npx tsx scripts/dept-context.ts --all",
    label: "Contesto Dipartimenti",
    desc: "Stato rapido di tutti i dipartimenti",
  },
  {
    command: "npx tsx scripts/daily-standup.ts --view",
    label: "Piano Giornaliero",
    desc: "Visualizza il piano del giorno",
  },
  {
    command: "npx tsx scripts/data-connector.ts status",
    label: "Data Connector Status",
    desc: "Stato pipeline dati e connettori",
  },
  {
    command: "git status",
    label: "Git Status",
    desc: "File modificati, staged, untracked",
  },
  {
    command: "git log --oneline -20",
    label: "Git Log",
    desc: "Ultimi 20 commit (oneline)",
  },
];

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_OUTPUT_LINES = 1000;
const HISTORY_MAX = 50;

// ── Component ────────────────────────────────────────────────────────────────

export function BossTerminal() {
  // State
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [processState, setProcessState] = useState<ProcessState>("idle");
  const [activePid, setActivePid] = useState<number | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedAutocomplete, setSelectedAutocomplete] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [exitCode, setExitCode] = useState<number | null>(null);

  // Refs
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lineIdRef = useRef(0);

  // ── Load history from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("boss-terminal-history");
      if (saved) setHistory(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  // ── Auto-scroll ──
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // ── Autocomplete filtering ──
  const filteredCommands = input.trim()
    ? ALLOWED_COMMANDS.filter(
        (c) =>
          c.command.toLowerCase().includes(input.toLowerCase()) ||
          c.label.toLowerCase().includes(input.toLowerCase())
      )
    : ALLOWED_COMMANDS;

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedAutocomplete(0);
  }, [input]);

  // ── Add output line ──
  const addLine = useCallback(
    (text: string, stream: "stdout" | "stderr" | "system") => {
      const id = ++lineIdRef.current;
      setOutput((prev) => {
        const next = [...prev, { id, text, stream, timestamp: Date.now() }];
        return next.length > MAX_OUTPUT_LINES
          ? next.slice(next.length - MAX_OUTPUT_LINES)
          : next;
      });
    },
    []
  );

  // ── Execute command ──
  const executeCommand = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || processState === "running") return;

      // Add to history
      setHistory((prev) => {
        const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(
          0,
          HISTORY_MAX
        );
        try {
          localStorage.setItem("boss-terminal-history", JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      setHistoryIdx(-1);

      // Add prompt line to output
      addLine(`$ ${trimmed}`, "system");
      setProcessState("running");
      setExitCode(null);
      setInput("");
      setShowAutocomplete(false);

      // Abort any previous connection
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/ops/exec", {
          method: "POST",
          headers: getConsoleJsonHeaders(),
          body: JSON.stringify({ command: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          addLine(
            `Errore: ${errBody.error ?? errBody.hint ?? `HTTP ${res.status}`}`,
            "stderr"
          );
          setProcessState("done");
          setExitCode(1);
          return;
        }

        // Parse SSE stream
        const reader = res.body?.getReader();
        if (!reader) {
          addLine("Errore: nessun body nella risposta", "stderr");
          setProcessState("done");
          setExitCode(1);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const events = buffer.split("\n\n");
          // Keep incomplete last event in buffer
          buffer = events.pop() ?? "";

          for (const eventBlock of events) {
            if (!eventBlock.trim()) continue;

            let eventType = "";
            let eventData = "";

            for (const line of eventBlock.split("\n")) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7);
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6);
              }
            }

            if (!eventType || !eventData) continue;

            try {
              const data = JSON.parse(eventData);

              switch (eventType) {
                case "started":
                  setActivePid(data.pid);
                  break;

                case "output": {
                  // Text may contain multiple lines
                  const text = data.text ?? "";
                  const lines = text.split(/\r?\n/);
                  for (const l of lines) {
                    if (l.length > 0) addLine(l, "stdout");
                  }
                  break;
                }

                case "error": {
                  const text = data.text ?? "";
                  const lines = text.split(/\r?\n/);
                  for (const l of lines) {
                    if (l.length > 0) addLine(l, "stderr");
                  }
                  break;
                }

                case "exit": {
                  const code = data.code;
                  const signal = data.signal;
                  setExitCode(code);
                  setProcessState("done");
                  setActivePid(null);
                  if (signal) {
                    addLine(
                      `Processo terminato con segnale ${signal}`,
                      "system"
                    );
                  } else if (code !== null && code !== 0) {
                    addLine(`Processo terminato con codice ${code}`, "system");
                  } else if (code === 0) {
                    addLine("Completato con successo", "system");
                  }
                  break;
                }
              }
            } catch {
              // Malformed JSON — ignore
            }
          }
        }

        // Safety net: if SSE stream ends without an explicit exit event,
        // mark the process as done. The setState is idempotent if already done.
        setProcessState((prev) => (prev === "running" ? "done" : prev));
        setActivePid((prev) => (prev !== null ? null : prev));
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // User cancelled — ignore
          return;
        }
        addLine(
          `Errore connessione: ${(err as Error).message ?? "sconosciuto"}`,
          "stderr"
        );
        setProcessState("done");
        setExitCode(1);
        setActivePid(null);
      }
    },
    [processState, addLine]
  );

  // ── Kill process ──
  const killProcess = useCallback(async () => {
    if (!activePid) return;

    try {
      await fetch(`/api/ops/exec/${activePid}`, {
        method: "DELETE",
        headers: getConsoleJsonHeaders(),
      });
    } catch {
      // ignore — the SSE stream will report the exit
    }

    // Also abort the fetch
    abortRef.current?.abort();
  }, [activePid]);

  // ── Clear output ──
  const clearOutput = useCallback(() => {
    setOutput([]);
    setExitCode(null);
    setProcessState("idle");
    lineIdRef.current = 0;
  }, []);

  // ── Handle input key events ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Enter — submit
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (showAutocomplete && filteredCommands.length > 0) {
          // Select from autocomplete
          const selected = filteredCommands[selectedAutocomplete];
          if (selected) {
            setInput(selected.command);
            setShowAutocomplete(false);
            // Execute immediately
            executeCommand(selected.command);
          }
        } else {
          executeCommand(input);
        }
        return;
      }

      // Ctrl+C — kill process
      if (e.key === "c" && e.ctrlKey) {
        e.preventDefault();
        if (processState === "running") {
          killProcess();
        }
        return;
      }

      // Tab — select autocomplete
      if (e.key === "Tab") {
        e.preventDefault();
        if (filteredCommands.length > 0) {
          const selected = filteredCommands[selectedAutocomplete];
          if (selected) {
            setInput(selected.command);
            setShowAutocomplete(false);
          }
        }
        return;
      }

      // Escape — close autocomplete
      if (e.key === "Escape") {
        setShowAutocomplete(false);
        return;
      }

      // ArrowUp — history / autocomplete navigation
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (showAutocomplete) {
          setSelectedAutocomplete((prev) =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
        } else if (history.length > 0) {
          const nextIdx = historyIdx + 1;
          if (nextIdx < history.length) {
            setHistoryIdx(nextIdx);
            setInput(history[nextIdx]);
          }
        }
        return;
      }

      // ArrowDown — history / autocomplete navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (showAutocomplete) {
          setSelectedAutocomplete((prev) =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
        } else if (historyIdx > 0) {
          const nextIdx = historyIdx - 1;
          setHistoryIdx(nextIdx);
          setInput(history[nextIdx]);
        } else if (historyIdx === 0) {
          setHistoryIdx(-1);
          setInput("");
        }
        return;
      }
    },
    [
      showAutocomplete,
      filteredCommands,
      selectedAutocomplete,
      input,
      processState,
      history,
      historyIdx,
      executeCommand,
      killProcess,
    ]
  );

  // ── Autocomplete item click ──
  const handleAutocompleteSelect = useCallback(
    (cmd: string) => {
      setInput(cmd);
      setShowAutocomplete(false);
      inputRef.current?.focus();
      // Execute immediately
      executeCommand(cmd);
    },
    [executeCommand]
  );

  // Close autocomplete on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-boss-terminal]")) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      data-boss-terminal
      className="flex flex-col h-full min-h-0"
      style={{ background: "#0a0a0a" }}
    >
      {/* ── Header ── */}
      <div
        className="flex-none flex items-center gap-2 px-4 py-2"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "#111",
        }}
      >
        <Terminal
          className="w-3.5 h-3.5"
          style={{ color: "#FF6B35" }}
          aria-hidden="true"
        />
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--fg-primary)" }}
        >
          Boss Terminal
        </span>
        <span
          className="text-[10px] font-mono"
          style={{ color: "var(--fg-muted)" }}
        >
          CLI Ops
        </span>

        <div className="flex-1" />

        {/* Process state indicator */}
        {processState === "running" && (
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#FF6B35]">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            PID {activePid ?? "..."}
          </span>
        )}

        {processState === "done" && exitCode !== null && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background:
                exitCode === 0
                  ? "rgba(52,211,153,0.1)"
                  : "rgba(239,68,68,0.1)",
              color: exitCode === 0 ? "#34D399" : "#EF4444",
            }}
          >
            exit {exitCode}
          </span>
        )}

        {/* Kill button */}
        <AnimatePresence>
          {processState === "running" && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              onClick={killProcess}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors
                focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
              style={{
                background: "rgba(239,68,68,0.15)",
                color: "#EF4444",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(239,68,68,0.25)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(239,68,68,0.15)")
              }
              aria-label="Interrompi processo"
              title="Ctrl+C"
            >
              <Square className="w-2.5 h-2.5" aria-hidden="true" />
              Kill
            </motion.button>
          )}
        </AnimatePresence>

        {/* Clear button */}
        <button
          onClick={clearOutput}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors
            focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
          style={{
            background: "rgba(255,255,255,0.04)",
            color: "var(--fg-muted)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
          }
          aria-label="Pulisci output"
        >
          <Trash2 className="w-2.5 h-2.5" aria-hidden="true" />
          Pulisci
        </button>
      </div>

      {/* ── Output area ── */}
      <div
        ref={outputRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed select-text min-h-0"
        style={{
          background: "#0a0a0a",
          color: "#e2e8f0",
        }}
        role="log"
        aria-label="Output terminale"
        aria-live="polite"
        aria-atomic="false"
      >
        {output.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30">
            <Terminal className="w-8 h-8" style={{ color: "#555" }} />
            <p className="text-xs text-center" style={{ color: "#555" }}>
              Digita un comando o seleziona dal menu.
              <br />
              <span className="text-[10px]">
                Tab per completare, Frecce per cronologia
              </span>
            </p>
          </div>
        ) : (
          output.map((line) => (
            <div
              key={line.id}
              className="whitespace-pre-wrap break-all"
              style={{
                color:
                  line.stream === "stderr"
                    ? "#FCA5A5"
                    : line.stream === "system"
                    ? "#666"
                    : "#34D399",
                backgroundColor:
                  line.stream === "stderr"
                    ? "rgba(239,68,68,0.04)"
                    : line.stream === "system"
                    ? "rgba(255,255,255,0.02)"
                    : "transparent",
                fontStyle: line.stream === "system" ? "italic" : "normal",
                paddingLeft: line.stream === "system" ? "0" : "0.5rem",
                borderLeft:
                  line.stream === "system"
                    ? "none"
                    : line.stream === "stderr"
                    ? "2px solid rgba(239,68,68,0.3)"
                    : "2px solid rgba(52,211,153,0.15)",
              }}
            >
              {line.text || "\u00a0"}
            </div>
          ))
        )}

        {/* Spinner while running */}
        {processState === "running" && (
          <div className="flex items-center gap-2 mt-1 opacity-60">
            <Loader2
              className="w-3 h-3 animate-spin"
              style={{ color: "#FF6B35" }}
            />
            <span style={{ color: "#FF6B35" }} className="text-[10px]">
              In esecuzione...
            </span>
          </div>
        )}
      </div>

      {/* ── Auto-scroll paused indicator ── */}
      <AnimatePresence>
        {!autoScroll && output.length > 0 && (
          <motion.button
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onClick={() => {
              setAutoScroll(true);
              if (outputRef.current) {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
              }
            }}
            className="flex-none flex items-center justify-center gap-1.5 py-1 w-full transition-colors
              focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
            style={{
              background: "rgba(255,107,53,0.08)",
              borderTop: "1px solid rgba(255,107,53,0.15)",
            }}
          >
            <ArrowDown className="w-2.5 h-2.5 text-[#FF6B35]" aria-hidden="true" />
            <span className="text-[9px] text-[#FF6B35]">
              Scorri in basso
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Input area ── */}
      <div
        className="flex-none relative"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#111",
        }}
      >
        {/* Autocomplete dropdown (opens upward) */}
        <AnimatePresence>
          {showAutocomplete && filteredCommands.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-full left-0 right-0 max-h-64 overflow-y-auto rounded-t-lg"
              style={{
                background: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.08)",
                borderBottom: "none",
                boxShadow: "0 -8px 24px rgba(0,0,0,0.5)",
              }}
              role="listbox"
              aria-label="Comandi disponibili"
            >
              {filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.command}
                  role="option"
                  aria-selected={i === selectedAutocomplete}
                  className="w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-colors"
                  style={{
                    background:
                      i === selectedAutocomplete
                        ? "rgba(255,107,53,0.1)"
                        : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                  }}
                  onClick={() => handleAutocompleteSelect(cmd.command)}
                  onMouseEnter={() => setSelectedAutocomplete(i)}
                >
                  <div className="flex items-center gap-2">
                    <Play
                      className="w-2.5 h-2.5 shrink-0"
                      style={{
                        color:
                          i === selectedAutocomplete ? "#FF6B35" : "#555",
                      }}
                      aria-hidden="true"
                    />
                    <span
                      className="text-[11px] font-mono truncate"
                      style={{
                        color:
                          i === selectedAutocomplete
                            ? "#FF6B35"
                            : "var(--fg-secondary)",
                      }}
                    >
                      {cmd.command}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pl-[18px]">
                    <span
                      className="text-[9px] font-semibold"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {cmd.label}
                    </span>
                    <span
                      className="text-[9px] truncate"
                      style={{ color: "var(--fg-invisible)" }}
                    >
                      {cmd.desc}
                    </span>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input row */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span
            className="text-[11px] font-mono font-bold shrink-0 select-none"
            style={{ color: "#FF6B35" }}
            aria-hidden="true"
          >
            $
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setHistoryIdx(-1);
              if (!showAutocomplete) setShowAutocomplete(true);
            }}
            onFocus={() => setShowAutocomplete(true)}
            onKeyDown={handleKeyDown}
            disabled={processState === "running"}
            placeholder={
              processState === "running"
                ? "In esecuzione... (Ctrl+C per interrompere)"
                : "Digita un comando..."
            }
            className="flex-1 bg-transparent text-[11px] font-mono outline-none
              placeholder-[#444] disabled:opacity-50"
            style={{ color: "#e2e8f0" }}
            aria-label="Comando CLI"
            aria-autocomplete="list"
            aria-expanded={showAutocomplete}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Toggle autocomplete */}
          <button
            onClick={() => {
              setShowAutocomplete((p) => !p);
              inputRef.current?.focus();
            }}
            className="shrink-0 p-1 rounded transition-colors
              focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
            style={{ color: "var(--fg-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#FF6B35")}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--fg-muted)")
            }
            aria-label="Mostra comandi disponibili"
          >
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          {/* Run / Kill button */}
          {processState === "running" ? (
            <button
              onClick={killProcess}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-colors
                focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
              style={{
                background: "rgba(239,68,68,0.2)",
                color: "#EF4444",
              }}
              aria-label="Interrompi"
            >
              <X className="w-3 h-3" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => executeCommand(input)}
              disabled={!input.trim()}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-colors
                disabled:opacity-30 focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
              style={{
                background: input.trim()
                  ? "rgba(255,107,53,0.2)"
                  : "rgba(255,255,255,0.04)",
                color: input.trim() ? "#FF6B35" : "var(--fg-muted)",
              }}
              onMouseEnter={(e) => {
                if (input.trim())
                  e.currentTarget.style.background = "rgba(255,107,53,0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = input.trim()
                  ? "rgba(255,107,53,0.2)"
                  : "rgba(255,255,255,0.04)";
              }}
              aria-label="Esegui comando"
            >
              <Play className="w-3 h-3" aria-hidden="true" />
              Esegui
            </button>
          )}
        </div>

        {/* Hints */}
        <div
          className="flex items-center gap-3 px-3 pb-1.5 text-[9px]"
          style={{ color: "var(--fg-invisible)" }}
        >
          <span>Enter: esegui</span>
          <span>Tab: completa</span>
          <span>Frecce: cronologia</span>
          {processState === "running" && <span>Ctrl+C: interrompi</span>}
        </div>
      </div>
    </div>
  );
}
