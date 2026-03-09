"use client";

import { useEffect, useState } from "react";

interface ConsoleHeaderProps {
  status: "idle" | "processing" | "done" | "error" | "clarification";
  userName?: string | null;
  corpusActive?: boolean;
  onCorpusToggle?: () => void;
  onPowerToggle?: () => void;
  onShellToggle?: () => void;
  onCompanyToggle?: () => void;
  onPrint?: () => void;
}

export default function ConsoleHeader({ status, userName, corpusActive, onCorpusToggle, onPowerToggle, onShellToggle, onCompanyToggle, onPrint }: ConsoleHeaderProps) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const statusLabel = {
    idle: "Pronto",
    processing: "In elaborazione",
    done: "Completato",
    error: "Errore",
    clarification: "In attesa",
  }[status];

  const statusColor = {
    idle: "text-[var(--foreground-tertiary)]",
    processing: "text-[var(--foreground)]",
    done: "text-[var(--foreground)]",
    error: "text-red-500",
    clarification: "text-amber-600",
  }[status];

  return (
    <header className="flex items-center justify-between px-4 py-3 md:px-8 md:py-5 border-b border-[var(--border)]">
      <div className="flex items-center gap-3 md:gap-4">
        <h1 className="text-lg md:text-xl font-serif tracking-tight text-[var(--foreground)]">
          lexmea
        </h1>
        <span className="text-[11px] text-[var(--foreground-tertiary)] tracking-wide hidden md:inline">
          Assistenza a professionisti giuridici
        </span>
      </div>

      <div className="flex items-center gap-3 md:gap-6 text-xs">
        {onPrint && status === "done" && (
          <button
            onClick={onPrint}
            className="text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] transition-colors print:hidden hidden sm:inline"
          >
            Stampa PDF
          </button>
        )}
        {onCompanyToggle && (
          <button
            onClick={onCompanyToggle}
            className="text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] transition-colors print:hidden"
          >
            Company
          </button>
        )}
        {onShellToggle && (
          <button
            onClick={onShellToggle}
            className="text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] transition-colors print:hidden font-mono"
            title="Shell Commands"
          >
            Shell
          </button>
        )}
        {onPowerToggle && (
          <button
            onClick={onPowerToggle}
            className="text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] transition-colors print:hidden"
          >
            Power
          </button>
        )}
        {onCorpusToggle && (
          <button
            onClick={onCorpusToggle}
            className={`transition-colors print:hidden ${
              corpusActive
                ? "text-[var(--agent-investigator)] font-medium"
                : "text-[var(--foreground-tertiary)] hover:text-[var(--foreground)]"
            }`}
          >
            Corpus
          </button>
        )}
        <a
          href="/ops"
          className="text-[var(--foreground-tertiary)] hover:text-[var(--accent)] transition-colors print:hidden"
        >
          Ops
        </a>
        {userName && (
          <span className="text-[var(--foreground-secondary)] hidden sm:inline">{userName}</span>
        )}
        <span className={statusColor} role="status" aria-live="polite">{statusLabel}</span>
        <span className="text-[var(--foreground-tertiary)] tabular-nums opacity-50 hidden sm:inline" aria-label={`Ora corrente: ${time}`}>
          {time}
        </span>
      </div>
    </header>
  );
}
