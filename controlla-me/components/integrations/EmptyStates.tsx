"use client";

/**
 * EmptyStates — Helpful empty state components for the integration UI.
 *
 * States:
 *   - NoConnectors: no connectors configured, CTA to explore catalog
 *   - NoSyncHistory: no sync activity yet
 *   - NoRecords: no records imported
 *
 * Design: Poimandres dark theme, minimal illustrations with CSS art.
 */

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Plug,
  ArrowRight,
  RefreshCw,
  FileText,
  Zap,
  Database,
} from "lucide-react";

// ─── Shared animation ───

const containerVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

// ─── NoConnectors ───

export function NoConnectors() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center text-center py-16 px-6"
    >
      {/* Illustration: 3 connector plugs */}
      <div className="relative mb-8">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, rgba(255, 107, 53, 0.15), rgba(255, 107, 53, 0.05))",
            border: "1px solid rgba(255, 107, 53, 0.2)",
          }}
        >
          <Plug className="w-10 h-10" style={{ color: "var(--accent)" }} />
        </div>
        {/* Floating orbit dots */}
        <motion.div
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: "rgba(93, 228, 199, 0.2)" }}
          animate={{ y: [-2, 2, -2] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <Zap className="w-3 h-3" style={{ color: "var(--success)" }} />
        </motion.div>
        <motion.div
          className="absolute -bottom-1 -left-3 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: "rgba(137, 221, 255, 0.2)" }}
          animate={{ y: [2, -2, 2] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        >
          <Database className="w-2.5 h-2.5" style={{ color: "var(--info-bright)" }} />
        </motion.div>
      </div>

      <h3
        className="font-serif text-xl tracking-tight mb-2"
        style={{ color: "var(--fg-primary)" }}
      >
        Collega il tuo primo servizio
      </h3>

      <p
        className="text-sm max-w-md leading-relaxed mb-6"
        style={{ color: "var(--fg-secondary)" }}
      >
        Connetti le tue piattaforme (fatturazione, CRM, documenti) e centralizza i dati per
        l&apos;analisi AI automatica. Setup in meno di 2 minuti.
      </p>

      <Link
        href="/integrazione"
        className="inline-flex items-center gap-2 rounded-xl py-3 px-6 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg"
        style={{
          background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
          boxShadow: "0 4px 16px rgba(255, 107, 53, 0.25)",
        }}
      >
        <Plug className="w-4 h-4" />
        Esplora connettori
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>

      {/* Feature hints */}
      <div className="flex flex-wrap justify-center gap-4 mt-8">
        {[
          { label: "Setup rapido", color: "var(--success)" },
          { label: "Sicurezza AES-256", color: "var(--info-bright)" },
          { label: "Analisi AI automatica", color: "var(--accent)" },
        ].map((hint) => (
          <span
            key={hint.label}
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--fg-muted)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: hint.color }}
            />
            {hint.label}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// ─── NoSyncHistory ───

export function NoSyncHistory({
  onStartSync,
}: {
  onStartSync?: () => void;
}) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center text-center py-12 px-6"
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        <RefreshCw className="w-8 h-8" style={{ color: "var(--fg-muted)" }} />
      </div>

      <h3
        className="text-base font-semibold mb-1"
        style={{ color: "var(--fg-primary)" }}
      >
        Nessuna sincronizzazione ancora
      </h3>

      <p
        className="text-sm max-w-sm leading-relaxed mb-5"
        style={{ color: "var(--fg-muted)" }}
      >
        Le sincronizzazioni appariranno qui dopo la prima esecuzione.
        Configura il connettore e avvia il primo sync.
      </p>

      {onStartSync && (
        <button
          onClick={onStartSync}
          className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-sm font-semibold text-white transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
          }}
        >
          <RefreshCw className="w-4 h-4" />
          Avvia sync
        </button>
      )}
    </motion.div>
  );
}

// ─── NoRecords ───

export function NoRecords() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center text-center py-12 px-6"
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        <FileText className="w-8 h-8" style={{ color: "var(--fg-muted)" }} />
      </div>

      <h3
        className="text-base font-semibold mb-1"
        style={{ color: "var(--fg-primary)" }}
      >
        Nessun documento importato
      </h3>

      <p
        className="text-sm max-w-sm leading-relaxed"
        style={{ color: "var(--fg-muted)" }}
      >
        Una volta completata la sincronizzazione, i documenti importati appariranno qui
        pronti per l&apos;analisi legale AI.
      </p>
    </motion.div>
  );
}
