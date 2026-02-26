"use client";

import { useEffect, useState } from "react";

interface ConsoleHeaderProps {
  status: "idle" | "processing" | "done" | "error" | "clarification";
  userName?: string | null;
  onCorpusToggle?: () => void;
}

export default function ConsoleHeader({ status, userName, onCorpusToggle }: ConsoleHeaderProps) {
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
    idle: "text-[var(--pb-text-dim)]",
    processing: "text-[var(--pb-green)]",
    done: "text-[var(--pb-green)]",
    error: "text-[var(--pb-red)]",
    clarification: "text-[var(--pb-amber)]",
  }[status];

  return (
    <header className="pipboy-glow flex items-center justify-between px-6 py-4 bg-[var(--pb-bg-panel)]">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-serif italic tracking-wide text-[var(--pb-green)]">
          lexmea
        </h1>
        <span className="text-[10px] text-[var(--pb-text-dim)] tracking-wider">
          Assistenza a professionisti giuridici
        </span>
      </div>

      <div className="flex items-center gap-6 text-xs">
        {onCorpusToggle && (
          <button
            onClick={onCorpusToggle}
            className="text-[var(--pb-text-dim)] hover:text-[var(--pb-green)] transition-colors tracking-wider"
          >
            Corpus
          </button>
        )}
        {userName && (
          <span className="text-[var(--pb-text-dim)]">{userName}</span>
        )}
        <span className={statusColor}>{statusLabel}</span>
        <span className="text-[var(--pb-text-dim)] tabular-nums opacity-60">
          {time}
        </span>
      </div>
    </header>
  );
}
