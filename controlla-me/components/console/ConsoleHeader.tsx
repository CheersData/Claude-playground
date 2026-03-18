"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";

interface ConsoleHeaderProps {
  status: "idle" | "processing" | "done" | "error" | "clarification";
  userName?: string | null;
  corpusActive?: boolean;
  onCorpusToggle?: () => void;
  onPowerToggle?: () => void;
  onShellToggle?: () => void;
  onCompanyToggle?: () => void;
  onTerminalToggle?: () => void;
  onPrint?: () => void;
}

const statusDotColor: Record<ConsoleHeaderProps["status"], string> = {
  idle: "bg-[var(--foreground-tertiary)]",
  processing: "bg-[var(--accent)]",
  done: "bg-emerald-500",
  error: "bg-red-500",
  clarification: "bg-amber-500",
};

export default function ConsoleHeader({ status, userName, corpusActive, onCorpusToggle, onPowerToggle, onShellToggle, onCompanyToggle, onTerminalToggle, onPrint }: ConsoleHeaderProps) {
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
    idle: "text-[var(--foreground-secondary)]",
    processing: "text-[var(--foreground)]",
    done: "text-[var(--foreground)]",
    error: "text-red-700",
    clarification: "text-amber-700",
  }[status];

  const isAnimating = status === "processing" || status === "clarification";

  return (
    <header className="flex items-center justify-between px-4 py-3 md:px-8 md:py-5 border-b border-[var(--border)] gap-3">
      {/* Left side: brand + tagline */}
      <div className="flex items-center gap-3 md:gap-4 shrink-0">
        <h1 className="text-lg md:text-xl font-serif tracking-tight text-[var(--foreground)]">
          lexmea
        </h1>
        <span className="text-[11px] text-[var(--foreground-secondary)] tracking-wide hidden md:inline truncate max-w-[220px]">
          Assistenza a professionisti giuridici
        </span>
      </div>

      {/* Right side: actions + status */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 text-xs min-w-0">
        {onPrint && status === "done" && (
          <button
            onClick={onPrint}
            className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors print:hidden hidden md:inline flex-shrink-0 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            aria-label="Stampa risultati in PDF"
          >
            Stampa PDF
          </button>
        )}
        {onCompanyToggle && (
          <button
            onClick={onCompanyToggle}
            className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors print:hidden hidden lg:inline flex-shrink-0 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            aria-label="Apri pannello Company"
          >
            Company
          </button>
        )}
        {onShellToggle && (
          <button
            onClick={onShellToggle}
            className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors print:hidden hidden lg:inline flex-shrink-0 font-mono focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            aria-label="Apri pannello comandi Shell"
          >
            Shell
          </button>
        )}
        {onTerminalToggle && (
          <button
            onClick={onTerminalToggle}
            className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors print:hidden hidden lg:inline flex-shrink-0 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            aria-label="Apri pannello Terminal — processi attivi"
          >
            <Activity className="w-3.5 h-3.5 inline-block mr-1" />
            Terminal
          </button>
        )}
        {onPowerToggle && (
          <button
            onClick={onPowerToggle}
            className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors print:hidden flex-shrink-0 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            aria-label="Apri pannello Power — modelli e catene di fallback"
          >
            Power
          </button>
        )}
        {onCorpusToggle && (
          <button
            onClick={onCorpusToggle}
            className={`transition-colors print:hidden flex-shrink-0 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] ${
              corpusActive
                ? "text-[var(--agent-investigator)] font-medium"
                : "text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
            }`}
            aria-label={`${corpusActive ? "Chiudi" : "Apri"} pannello Corpus legislativo`}
            aria-pressed={corpusActive}
          >
            Corpus
          </button>
        )}
        <a
          href="/ops"
          className="text-[var(--foreground-secondary)] hover:text-[var(--accent-text)] transition-colors print:hidden flex-shrink-0 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
          aria-label="Vai alla dashboard Operations"
        >
          Ops
        </a>
        {userName && (
          <span className="text-[var(--foreground-secondary)] hidden md:inline min-w-0 truncate max-w-[120px]">{userName}</span>
        )}

        {/* Status dot + label */}
        <span className="flex items-center gap-1.5 flex-shrink-0" role="status" aria-live="polite">
          <motion.div
            className={`w-2 h-2 rounded-full ${statusDotColor[status]}`}
            aria-hidden="true"
            animate={
              isAnimating
                ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }
                : { scale: 1, opacity: 1 }
            }
            transition={
              isAnimating
                ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.3 }
            }
          />
          <span className={`${statusColor} truncate max-w-[100px]`}>{statusLabel}</span>
        </span>

        <time className="text-[var(--foreground-secondary)] tabular-nums hidden sm:inline flex-shrink-0" aria-label={`Ora corrente: ${time}`} dateTime={time}>
          {time}
        </time>
      </div>
    </header>
  );
}
