"use client";

/**
 * SyncSuccess — Full-screen celebration overlay on first successful connector sync.
 *
 * Features:
 *   - Particle/confetti animation using CSS + framer-motion
 *   - Animated checkmark
 *   - Summary of imported documents
 *   - CTA: "Vai alla dashboard" / "Connetti un altro servizio"
 *   - Shows only once per connector (localStorage)
 *
 * Design: Poimandres dark theme, green success palette.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Check,
  ArrowRight,
  Plug,
  FileText,
  Sparkles,
} from "lucide-react";

// ─── Constants ───

const STORAGE_PREFIX = "controlla_sync_success_";

// ─── Types ───

interface SyncSuccessProps {
  connectorId: string;
  connectorName: string;
  documentsImported: number;
  documentsAnalyzed: number;
  /** Called when the overlay is dismissed */
  onDismiss: () => void;
}

// ─── Particle system ───

interface Particle {
  id: number;
  x: number;       // start X (vw)
  y: number;       // start Y (vh)
  size: number;     // px
  color: string;
  delay: number;    // s
  duration: number; // s
  drift: number;    // horizontal drift px
}

const PARTICLE_COLORS = [
  "var(--success)",
  "var(--accent)",
  "var(--info-bright)",
  "var(--caution)",
  "#A78BFA",
  "#FF6B6B",
  "#FFC832",
];

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: 100 + Math.random() * 20, // start below viewport
    size: 4 + Math.random() * 8,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    delay: Math.random() * 0.8,
    duration: 1.5 + Math.random() * 2,
    drift: (Math.random() - 0.5) * 120,
  }));
}

// ─── Component ───

export default function SyncSuccess({
  connectorId,
  connectorName,
  documentsImported,
  documentsAnalyzed,
  onDismiss,
}: SyncSuccessProps) {
  const [visible, setVisible] = useState(false);

  const particles = useMemo(() => generateParticles(40), []);

  // Check if already shown for this connector
  useEffect(() => {
    try {
      const key = `${STORAGE_PREFIX}${connectorId}`;
      const alreadyShown = localStorage.getItem(key);
      if (!alreadyShown) {
        setVisible(true);
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {
      // localStorage unavailable — show anyway
      setVisible(true);
    }
  }, [connectorId]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 400); // wait for exit animation
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="sync-success-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          style={{
            background: "rgba(0, 0, 0, 0.80)",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* ─── Particles ─── */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map((p) => (
              <motion.div
                key={p.id}
                initial={{
                  x: `${p.x}vw`,
                  y: `${p.y}vh`,
                  opacity: 1,
                  scale: 0,
                  rotate: 0,
                }}
                animate={{
                  y: `-20vh`,
                  x: `calc(${p.x}vw + ${p.drift}px)`,
                  opacity: [1, 1, 0],
                  scale: [0, 1.2, 0.8],
                  rotate: Math.random() * 360,
                }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  ease: "easeOut",
                }}
                className="absolute rounded-full"
                style={{
                  width: p.size,
                  height: p.size,
                  background: p.color,
                  boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                }}
              />
            ))}
          </div>

          {/* ─── Card ─── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md rounded-2xl p-8 text-center"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark)",
              boxShadow: "0 25px 80px rgba(0, 0, 0, 0.5), 0 0 60px rgba(93, 228, 199, 0.08)",
            }}
          >
            {/* Top accent */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
              style={{
                background: "linear-gradient(90deg, transparent, var(--success), transparent)",
              }}
            />

            {/* ─── Animated checkmark circle ─── */}
            <div className="flex justify-center mb-6">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-center w-20 h-20 rounded-full"
                style={{
                  background: "linear-gradient(135deg, rgba(93, 228, 199, 0.2), rgba(93, 228, 199, 0.05))",
                  border: "2px solid rgba(93, 228, 199, 0.4)",
                  boxShadow: "0 0 40px rgba(93, 228, 199, 0.15)",
                }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.7, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Check className="w-10 h-10" style={{ color: "var(--success)" }} strokeWidth={2.5} />
                </motion.div>
              </motion.div>
            </div>

            {/* ─── Heading ─── */}
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="font-serif text-2xl tracking-tight mb-2"
              style={{ color: "var(--fg-primary)" }}
            >
              Connessione riuscita!
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.75, duration: 0.4 }}
              className="text-sm mb-6"
              style={{ color: "var(--fg-secondary)" }}
            >
              <strong style={{ color: "var(--success)" }}>{connectorName}</strong> e ora collegato al tuo account.
            </motion.p>

            {/* ─── Stats row ─── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.4 }}
              className="flex items-center justify-center gap-4 mb-8"
            >
              <div
                className="flex items-center gap-2 rounded-xl px-4 py-2.5"
                style={{
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border-dark-subtle)",
                }}
              >
                <FileText className="w-4 h-4" style={{ color: "var(--info-bright)" }} />
                <div className="text-left">
                  <span className="block text-lg font-bold" style={{ color: "var(--fg-primary)" }}>
                    {documentsImported.toLocaleString("it-IT")}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                    importati
                  </span>
                </div>
              </div>

              <div
                className="flex items-center gap-2 rounded-xl px-4 py-2.5"
                style={{
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border-dark-subtle)",
                }}
              >
                <Sparkles className="w-4 h-4" style={{ color: "var(--success)" }} />
                <div className="text-left">
                  <span className="block text-lg font-bold" style={{ color: "var(--fg-primary)" }}>
                    {documentsAnalyzed.toLocaleString("it-IT")}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                    analizzati
                  </span>
                </div>
              </div>
            </motion.div>

            {/* ─── CTAs ─── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05, duration: 0.4 }}
              className="flex flex-col gap-3"
            >
              <Link
                href={`/integrazione/${connectorId}?tab=sync`}
                className="flex items-center justify-center gap-2 rounded-xl py-3 px-6 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg"
                style={{
                  background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                  boxShadow: "0 4px 16px rgba(255, 107, 53, 0.25)",
                }}
              >
                Vai alla dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                href="/integrazione"
                onClick={handleDismiss}
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-6 text-sm font-medium transition-all hover:scale-[1.01]"
                style={{
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border-dark)",
                  color: "var(--fg-secondary)",
                }}
              >
                <Plug className="w-3.5 h-3.5" />
                Connetti un altro servizio
              </Link>
            </motion.div>

            {/* ─── Dismiss ─── */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3 }}
              onClick={handleDismiss}
              className="mt-4 text-xs transition-colors hover-color-primary"
              style={{ color: "var(--fg-muted)" }}
            >
              Chiudi
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
