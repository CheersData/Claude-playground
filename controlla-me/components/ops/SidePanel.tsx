"use client";

import { type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface SidePanelProps {
  side: "left" | "right";
  title: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  width?: string;
}

// ── Animation variants ────────────────────────────────────────────────────────

const panelVariants = {
  left: {
    open: { x: 0, opacity: 1 },
    closed: { x: "-100%", opacity: 0 },
  },
  right: {
    open: { x: 0, opacity: 1 },
    closed: { x: "100%", opacity: 0 },
  },
};

const transition = { type: "spring" as const, stiffness: 300, damping: 30 };

// ── Component ─────────────────────────────────────────────────────────────────

export function SidePanel({
  side,
  title,
  icon,
  open,
  onToggle,
  children,
  width = "w-80",
}: SidePanelProps) {
  const isLeft = side === "left";

  // Chevron that points "inward" when open (collapse), "outward" when closed
  const CollapseIcon = isLeft ? ChevronLeft : ChevronRight;

  return (
    <>
      {/* ── Desktop (md+) ────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-shrink-0">
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            /* ── Expanded panel ──────────────────────────────────────── */
            <motion.div
              key="panel-open"
              initial={panelVariants[side].closed}
              animate={panelVariants[side].open}
              exit={panelVariants[side].closed}
              transition={transition}
              className={`${width} flex flex-col
                bg-[var(--bg-raised)] border border-[var(--border-dark-subtle)]
                ${isLeft ? "rounded-r-xl border-l-0" : "rounded-l-xl border-r-0"}
                overflow-hidden`}
            >
              {/* Header */}
              <div
                className={`flex items-center gap-2 px-4 py-3
                  border-b border-[var(--border-dark-subtle)]
                  bg-[var(--bg-overlay)]/40`}
              >
                {icon && (
                  <span className="text-[var(--accent)] shrink-0">{icon}</span>
                )}
                <span className="text-sm font-medium text-[var(--fg-primary)] truncate flex-1">
                  {title}
                </span>
                <button
                  onClick={onToggle}
                  aria-label={`Chiudi pannello ${title}`}
                  className="p-1.5 rounded-md text-[var(--fg-invisible)]
                    hover:text-[var(--fg-secondary)] hover:bg-[var(--bg-overlay)]
                    transition-colors cursor-pointer"
                >
                  <CollapseIcon size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">{children}</div>
            </motion.div>
          ) : (
            /* ── Collapsed strip ─────────────────────────────────────── */
            <motion.button
              key="panel-collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onToggle}
              aria-label={`Apri pannello ${title}`}
              className={`w-10 flex flex-col items-center gap-3 py-4
                bg-[var(--bg-raised)] border border-[var(--border-dark-subtle)]
                ${isLeft ? "rounded-r-xl border-l-0" : "rounded-l-xl border-r-0"}
                hover:bg-[var(--bg-overlay)] transition-colors cursor-pointer
                group`}
            >
              {/* Icon */}
              {icon && (
                <span className="text-[var(--fg-invisible)] group-hover:text-[var(--accent)] transition-colors shrink-0">
                  {icon}
                </span>
              )}

              {/* Rotated title */}
              <span
                className="text-[11px] font-medium tracking-wider uppercase
                  text-[var(--fg-invisible)] group-hover:text-[var(--fg-secondary)]
                  transition-colors whitespace-nowrap"
                style={{
                  writingMode: "vertical-rl",
                  textOrientation: "mixed",
                  transform: isLeft ? "rotate(180deg)" : undefined,
                }}
              >
                {title}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mobile (< md) ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onToggle}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />

            {/* Overlay panel */}
            <motion.div
              key="mobile-panel"
              initial={panelVariants[side].closed}
              animate={panelVariants[side].open}
              exit={panelVariants[side].closed}
              transition={transition}
              className={`fixed top-0 ${isLeft ? "left-0" : "right-0"} z-50
                h-full w-[85vw] max-w-sm flex flex-col
                bg-[var(--bg-raised)] border-[var(--border-dark-subtle)]
                ${isLeft ? "border-r" : "border-l"}
                md:hidden`}
            >
              {/* Header */}
              <div
                className={`flex items-center gap-2 px-4 py-3
                  border-b border-[var(--border-dark-subtle)]
                  bg-[var(--bg-overlay)]/40`}
              >
                {icon && (
                  <span className="text-[var(--accent)] shrink-0">{icon}</span>
                )}
                <span className="text-sm font-medium text-[var(--fg-primary)] truncate flex-1">
                  {title}
                </span>
                <button
                  onClick={onToggle}
                  aria-label={`Chiudi pannello ${title}`}
                  className="p-1.5 rounded-md text-[var(--fg-invisible)]
                    hover:text-[var(--fg-secondary)] hover:bg-[var(--bg-overlay)]
                    transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">{children}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
