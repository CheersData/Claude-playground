"use client";

/**
 * DebugStrip — Compact debug panel that appears during agent activity.
 *
 * Collapsed (default): single-line showing latest event + elapsed time.
 * Expanded: scrollable monospace log of the last 20 events, color-coded by type.
 * Hidden when no agent is active (AnimatePresence exit animation).
 */

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronUp,
  ChevronDown,
  Bug,
  Zap,
  AlertTriangle,
  Info,
  DollarSign,
  Play,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DebugEvent {
  ts: number;
  type: "spawn" | "chunk" | "turn-end" | "error" | "info" | "cost";
  msg: string;
  agent?: string;
}

export interface DebugStripProps {
  events: DebugEvent[];
  isActive: boolean;
  onToggleExpand?: () => void;
  expanded?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_VISIBLE_EVENTS = 20;

/** Format timestamp as HH:MM:SS */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** Elapsed seconds since the earliest event */
function elapsedLabel(events: DebugEvent[]): string {
  if (events.length === 0) return "0s";
  const first = events[0].ts;
  const last = events[events.length - 1].ts;
  const sec = Math.round((last - first) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m${rem > 0 ? ` ${rem}s` : ""}`;
}

/** Color classes per event type */
function typeColor(type: DebugEvent["type"]): string {
  switch (type) {
    case "error":
      return "text-red-400";
    case "cost":
      return "text-yellow-400";
    case "spawn":
      return "text-emerald-400";
    case "turn-end":
      return "text-blue-400";
    case "chunk":
      return "text-neutral-500";
    case "info":
    default:
      return "text-neutral-400";
  }
}

/** Tiny icon per event type (collapsed indicator) */
function TypeIcon({ type }: { type: DebugEvent["type"] }) {
  const cls = `w-3 h-3 shrink-0 ${typeColor(type)}`;
  switch (type) {
    case "error":
      return <AlertTriangle className={cls} />;
    case "cost":
      return <DollarSign className={cls} />;
    case "spawn":
      return <Play className={cls} />;
    case "info":
      return <Info className={cls} />;
    default:
      return <Zap className={cls} />;
  }
}

/** Type badge label for expanded rows */
function typeLabel(type: DebugEvent["type"]): string {
  switch (type) {
    case "spawn":
      return "SPAWN";
    case "chunk":
      return "CHUNK";
    case "turn-end":
      return "DONE ";
    case "error":
      return "ERROR";
    case "info":
      return "INFO ";
    case "cost":
      return "COST ";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DebugStrip({
  events,
  isActive,
  onToggleExpand,
  expanded: controlledExpanded,
}: DebugStripProps) {
  // Internal expanded state (used when uncontrolled)
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const scrollRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  }, [onToggleExpand]);

  // Tail events to last N
  const visibleEvents = useMemo(
    () => events.slice(-MAX_VISIBLE_EVENTS),
    [events],
  );

  const latest = visibleEvents.length > 0
    ? visibleEvents[visibleEvents.length - 1]
    : null;

  // Auto-scroll to bottom when expanded and new events arrive
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [expanded, visibleEvents.length]);

  // Reset internal expanded when strip hides
  useEffect(() => {
    if (!isActive) setInternalExpanded(false);
  }, [isActive]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="bg-[#111] border border-[#333] rounded-lg overflow-hidden"
        >
          {/* ── Collapsed bar ─────────────────────────────────── */}
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-2 w-full h-8 px-3 text-[11px] font-mono
                       text-neutral-300 hover:bg-[#1a1a1a] transition-colors cursor-pointer
                       select-none"
          >
            <Bug className="w-3 h-3 shrink-0 text-neutral-500" />

            {latest ? (
              <>
                <TypeIcon type={latest.type} />
                {latest.agent && (
                  <span className="text-[#FF6B35] shrink-0">
                    [{latest.agent}]
                  </span>
                )}
                <span className="truncate flex-1 text-left">{latest.msg}</span>
              </>
            ) : (
              <span className="flex-1 text-left text-neutral-500">
                Waiting for events...
              </span>
            )}

            <span className="shrink-0 text-neutral-500 tabular-nums ml-auto pl-2">
              {elapsedLabel(events)}
            </span>

            {expanded ? (
              <ChevronDown className="w-3 h-3 shrink-0 text-neutral-500" />
            ) : (
              <ChevronUp className="w-3 h-3 shrink-0 text-neutral-500" />
            )}
          </button>

          {/* ── Expanded log ──────────────────────────────────── */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="border-t border-[#222]" />
                <div
                  ref={scrollRef}
                  className="max-h-48 overflow-y-auto px-3 py-1.5 text-[11px] font-mono
                             leading-[18px] scrollbar-thin scrollbar-thumb-[#333]
                             scrollbar-track-transparent"
                >
                  {visibleEvents.length === 0 ? (
                    <p className="text-neutral-600 py-1">No events yet.</p>
                  ) : (
                    visibleEvents.map((ev, i) => (
                      <div
                        key={`${ev.ts}-${i}`}
                        className="flex gap-1.5 whitespace-nowrap"
                      >
                        <span className="text-neutral-600 shrink-0">
                          [{formatTime(ev.ts)}]
                        </span>
                        <span className={`shrink-0 ${typeColor(ev.type)}`}>
                          {typeLabel(ev.type)}
                        </span>
                        {ev.agent && (
                          <span className="text-[#FF6B35] shrink-0">
                            {ev.agent}
                          </span>
                        )}
                        <span
                          className={`truncate ${
                            ev.type === "error"
                              ? "text-red-300"
                              : "text-neutral-300"
                          }`}
                        >
                          {ev.msg}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
