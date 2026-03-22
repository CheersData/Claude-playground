"use client";

/**
 * IntegrationAgentPanel — Floating side panel wrapper for IntegrationAgentChat.
 *
 * - Slides in from the right on desktop (400px wide, side panel — no backdrop)
 * - Slides up from the bottom on mobile (full-screen drawer with backdrop + drag-to-close)
 * - Header with title, connector name, close button
 * - AnimatePresence for smooth open/close
 * - z-50 to sit above page content but not block interaction on desktop
 *
 * Design: Poimandres dark theme, accent #FF6B35
 */

import { useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bot } from "lucide-react";
import IntegrationAgentChat from "./IntegrationAgentChat";

// ─── Types ───

interface IntegrationAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  connectorType?: string;
  connectorId?: string;
}

// ─── Responsive hook ───

function useIsMobile() {
  const ref = useRef(false);
  useEffect(() => {
    const check = () => {
      ref.current = window.innerWidth < 768;
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  // For SSR safety return false initially; the motion variants handle both anyway
  return ref;
}

// ─── Component ───

export default function IntegrationAgentPanel({
  isOpen,
  onClose,
  connectorType,
  connectorId,
}: IntegrationAgentPanelProps) {
  const isMobileRef = useIsMobile();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Handle drag end on mobile — close if dragged down far enough
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > 100 || info.velocity.y > 300) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            style={{ background: "rgba(0, 0, 0, 0.6)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel container */}
          <motion.div
            className="fixed z-50 flex flex-col
              inset-x-0 bottom-0 top-12
              md:inset-y-0 md:left-auto md:right-0 md:w-[400px]"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={{
              hidden: {
                // Mobile: slide up from bottom; Desktop: slide in from right
                y: isMobileRef.current ? "100%" : 0,
                x: isMobileRef.current ? 0 : "100%",
                opacity: 0,
              },
              visible: {
                y: 0,
                x: 0,
                opacity: 1,
                transition: {
                  type: "spring",
                  stiffness: 400,
                  damping: 35,
                  mass: 0.8,
                },
              },
              exit: {
                y: isMobileRef.current ? "100%" : 0,
                x: isMobileRef.current ? 0 : "100%",
                opacity: 0,
                transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
              },
            }}
            // Mobile drag-to-close
            drag={isMobileRef.current ? "y" : false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{
              background: "var(--bg-base)",
              borderLeft: "1px solid var(--border-dark)",
              boxShadow:
                "-8px 0 32px rgba(0, 0, 0, 0.4), inset 1px 0 0 rgba(255, 107, 53, 0.06)",
            }}
          >
            {/* Mobile drag handle */}
            <div className="flex justify-center py-2 md:hidden">
              <div
                className="w-10 h-1 rounded-full"
                style={{ background: "var(--fg-muted)", opacity: 0.4 }}
              />
            </div>

            {/* Header */}
            <div
              className="flex items-center gap-3 px-5 py-4 shrink-0"
              style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
            >
              <div
                className="flex items-center justify-center w-9 h-9 rounded-lg"
                style={{ background: "rgba(255, 107, 53, 0.1)" }}
              >
                <Bot className="w-5 h-5" style={{ color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  className="text-sm font-semibold"
                  style={{ color: "var(--fg-primary)" }}
                >
                  Assistente Integrazione
                </h2>
                {connectorType && (
                  <p
                    className="text-xs truncate"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    {connectorType}
                  </p>
                )}
                {!connectorType && (
                  <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                    Chiedimi cosa vuoi collegare
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover-bg-hover"
                style={{ color: "var(--fg-muted)" }}
                aria-label="Chiudi assistente"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat content — fills remaining space */}
            <div
              className="flex-1 overflow-hidden"
              style={{ height: "calc(100% - 73px)" }}
            >
              <IntegrationAgentChat
                connectorType={connectorType}
                connectorId={connectorId}
                embedded
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
