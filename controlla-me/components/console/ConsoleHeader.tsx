"use client";

import { useEffect, useState } from "react";

interface ConsoleHeaderProps {
  status: "idle" | "processing" | "done" | "error" | "clarification";
  userName?: string | null;
  corpusActive?: boolean;
  onCorpusToggle?: () => void;
  onPowerToggle?: () => void;
  onCompanyToggle?: () => void;
  onPrint?: () => void;
}

export default function ConsoleHeader({ status, userName, corpusActive, onCorpusToggle, onPowerToggle, onCompanyToggle, onPrint }: ConsoleHeaderProps) {
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
    <header className="flex items-center justify-between px-4 py-3 md:px-8 md:py-5 border-b border-[#E5E5E5]">
      <div className="flex items-center gap-3 md:gap-4">
        <h1 className="text-lg md:text-xl font-serif tracking-tight text-[#1A1A1A]">
          lexmea
        </h1>
        <span className="text-[11px] text-[#9B9B9B] tracking-wide hidden md:inline">
          Assistenza a professionisti giuridici
        </span>
      </div>

      <div className="flex items-center gap-3 md:gap-6 text-xs">
        {onPrint && status === "done" && (
          <button
            onClick={onPrint}
            className="text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors print:hidden hidden sm:inline"
          >
            Stampa PDF
          </button>
        )}
        {onCompanyToggle && (
          <button
            onClick={onCompanyToggle}
            className="text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors print:hidden"
          >
            Company
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
            className={`transition-colors print:hidden ${
              corpusActive
                ? "text-[#A78BFA] font-medium"
                : "text-[#9B9B9B] hover:text-[#1A1A1A]"
            }`}
          >
            Corpus
          </button>
        )}
        {userName && (
          <span className="text-[#6B6B6B] hidden sm:inline">{userName}</span>
        )}
        <span className={statusColor}>{statusLabel}</span>
        <span className="text-[#9B9B9B] tabular-nums opacity-50 hidden sm:inline">
          {time}
        </span>
      </div>
    </header>
  );
}
