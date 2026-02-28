"use client";

import { useEffect, useState } from "react";

interface ConsoleHeaderProps {
  status: "idle" | "processing" | "done" | "error" | "clarification";
  userName?: string | null;
  onCorpusToggle?: () => void;
  onPowerToggle?: () => void;
  onPrint?: () => void;
}

export default function ConsoleHeader({ status, userName, onCorpusToggle, onPowerToggle, onPrint }: ConsoleHeaderProps) {
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
    idle: "text-[#9B9B9B]",
    processing: "text-[#1A1A1A]",
    done: "text-[#1A1A1A]",
    error: "text-red-500",
    clarification: "text-amber-600",
  }[status];

  return (
    <header className="flex items-center justify-between px-8 py-5 border-b border-[#E5E5E5]">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-serif tracking-tight text-[#1A1A1A]">
          lexmea
        </h1>
        <span className="text-[11px] text-[#9B9B9B] tracking-wide hidden md:inline">
          Assistenza a professionisti giuridici
        </span>
      </div>

      <div className="flex items-center gap-6 text-xs">
        {onPrint && status === "done" && (
          <button
            onClick={onPrint}
            className="text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors print:hidden"
          >
            Stampa PDF
          </button>
        )}
        {onPowerToggle && (
          <button
            onClick={onPowerToggle}
            className="text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors print:hidden"
          >
            Power
          </button>
        )}
        {onCorpusToggle && (
          <button
            onClick={onCorpusToggle}
            className="text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors print:hidden"
          >
            Corpus
          </button>
        )}
        {userName && (
          <span className="text-[#6B6B6B]">{userName}</span>
        )}
        <span className={statusColor}>{statusLabel}</span>
        <span className="text-[#9B9B9B] tabular-nums opacity-50">
          {time}
        </span>
      </div>
    </header>
  );
}
