"use client";

import { useEffect, useState } from "react";

interface ConsoleHeaderProps {
  status: "idle" | "processing" | "done" | "error";
}

export default function ConsoleHeader({ status }: ConsoleHeaderProps) {
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
    idle: "PRONTO",
    processing: "IN ELABORAZIONE",
    done: "COMPLETATO",
    error: "ERRORE",
  }[status];

  const statusColor = {
    idle: "text-[var(--pb-text-dim)]",
    processing: "text-[var(--pb-green)]",
    done: "text-[var(--pb-green)]",
    error: "text-[var(--pb-red)]",
  }[status];

  return (
    <header className="pipboy-glow flex items-center justify-between px-4 py-3 bg-[var(--pb-bg-panel)]">
      <div className="flex items-center gap-3">
        <h1
          className="text-lg font-bold tracking-wider"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          LEXMEA
        </h1>
        <span className="text-xs text-[var(--pb-text-dim)]">v1.0</span>
      </div>

      <div className="flex items-center gap-6 text-xs">
        <span className={statusColor}>
          [{statusLabel}]
        </span>
        <span className="text-[var(--pb-text-dim)] tabular-nums">{time}</span>
      </div>
    </header>
  );
}
