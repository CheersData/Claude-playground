"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Department colors ──────────────────────────────────────────────── */

export const DEPT_COLORS: Record<string, string> = {
  "ufficio-legale": "#FF6B6B",
  trading: "#FFC832",
  architecture: "#4ECDC4",
  "data-engineering": "#A78BFA",
  "quality-assurance": "#60A5FA",
  operations: "#34D399",
  security: "#F87171",
  strategy: "#FBBF24",
  marketing: "#FB923C",
  protocols: "#818CF8",
  "ux-ui": "#F472B6",
  acceleration: "#2DD4BF",
  finance: "#A3E635",
  cme: "#FF6B35",
  interactive: "#38BDF8",
};

const DEPT_LABELS: Record<string, string> = {
  "ufficio-legale": "Ufficio Legale",
  trading: "Trading",
  architecture: "Architecture",
  "data-engineering": "Data Engineering",
  "quality-assurance": "Quality Assurance",
  operations: "Operations",
  security: "Security",
  strategy: "Strategy",
  marketing: "Marketing",
  protocols: "Protocols",
  "ux-ui": "UX/UI",
  acceleration: "Acceleration",
  finance: "Finance",
  cme: "CME",
  interactive: "Boss Terminal",
};

const DEPT_KEYS = Object.keys(DEPT_COLORS);

/* ── Types ──────────────────────────────────────────────────────────── */

export interface AgentDotsProps {
  activeAgents: Map<
    string,
    { department: string; task?: string; status: "running" | "done" | "error" }
  >;
}

/* ── Tooltip ────────────────────────────────────────────────────────── */

function Tooltip({
  dept,
  info,
}: {
  dept: string;
  info?: { task?: string; status: "running" | "done" | "error" };
}) {
  const label = DEPT_LABELS[dept] ?? dept;
  const statusLabel =
    info?.status === "running"
      ? "Attivo"
      : info?.status === "done"
        ? "Completato"
        : info?.status === "error"
          ? "Errore"
          : "Inattivo";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
    >
      <div className="bg-[#1a1a1a] border border-[#333] rounded-md px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-lg">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: DEPT_COLORS[dept] ?? "#555" }}
          />
          <span className="text-white/90 font-medium">{label}</span>
          <span className="text-white/40">&#183;</span>
          <span
            className={
              info?.status === "error"
                ? "text-red-400"
                : info?.status === "running"
                  ? "text-emerald-400"
                  : info?.status === "done"
                    ? "text-white/50"
                    : "text-white/30"
            }
          >
            {statusLabel}
          </span>
        </div>
        {info?.task && (
          <p className="text-white/40 mt-0.5 max-w-[200px] truncate">
            {info.task}
          </p>
        )}
      </div>
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-[#333]" />
    </motion.div>
  );
}

/* ── Dot ────────────────────────────────────────────────────────────── */

function Dot({
  dept,
  info,
}: {
  dept: string;
  info?: { task?: string; status: "running" | "done" | "error" };
}) {
  const [hovered, setHovered] = useState(false);
  const color = DEPT_COLORS[dept] ?? "#555";
  const isActive = info?.status === "running";
  const isError = info?.status === "error";
  const isDone = info?.status === "done";

  // Resolve display color: error = red, active/done = dept color, inactive = gray
  const dotColor = isError ? "#EF4444" : isActive || isDone ? color : "#333";

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pulse ring (only for running state) */}
      {isActive && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      )}

      {/* Dot */}
      <motion.span
        className="relative block w-2.5 h-2.5 rounded-full cursor-pointer"
        style={{ backgroundColor: dotColor }}
        animate={
          isActive
            ? { scale: [1, 1.2, 1], opacity: [1, 0.85, 1] }
            : { scale: 1, opacity: isDone ? 0.6 : isError ? 1 : 0.35 }
        }
        transition={
          isActive
            ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      />

      {/* Tooltip */}
      <AnimatePresence>{hovered && <Tooltip dept={dept} info={info} />}</AnimatePresence>
    </div>
  );
}

/* ── AgentDots ──────────────────────────────────────────────────────── */

export function AgentDots({ activeAgents }: AgentDotsProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1.5">
      {DEPT_KEYS.map((dept) => {
        // Find matching agent info by department key
        let info: { task?: string; status: "running" | "done" | "error" } | undefined;
        activeAgents.forEach((value) => {
          if (value.department === dept) {
            info = value;
          }
        });

        return <Dot key={dept} dept={dept} info={info} />;
      })}
    </div>
  );
}
