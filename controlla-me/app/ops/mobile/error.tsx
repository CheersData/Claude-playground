"use client";

/**
 * Error boundary for /ops/mobile route.
 *
 * Catches unhandled errors from MobileOpsView, preventing
 * "errore imprevisto" crashes on mobile browsers.
 */

import { useEffect } from "react";

export default function MobileOpsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[OpsMobile] Unhandled error:", error);
  }, [error]);

  return (
    <div
      className="flex items-center justify-center min-h-screen px-4"
      style={{ background: "#1b1e28" }}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-sm space-y-4"
        style={{
          background: "#252837",
          border: "1px solid #383b4d",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        <div>
          <h2
            className="text-lg font-semibold font-serif"
            style={{ color: "#e4f0fb" }}
          >
            Ops Mobile — Errore
          </h2>
          <p className="text-sm mt-2" style={{ color: "#a6accd" }}>
            Si è verificato un errore nel caricamento.
          </p>
        </div>

        <div
          className="px-3 py-2 rounded-lg text-xs font-mono overflow-x-auto"
          style={{
            background: "#1b1e28",
            border: "1px solid #383b4d",
            color: "#e58d78",
          }}
        >
          {error.message || "Errore sconosciuto"}
        </div>

        <button
          onClick={reset}
          className="w-full px-4 py-3 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
          style={{
            background: "#FF6B35",
            boxShadow: "0 2px 12px rgba(255,107,53,0.3)",
          }}
        >
          Riprova
        </button>
      </div>
    </div>
  );
}
