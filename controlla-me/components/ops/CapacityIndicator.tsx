"use client";

import { motion, AnimatePresence } from "framer-motion";

interface CapacityIndicatorProps {
  activeCount: number;
  maxCapacity?: number;
}

type CapacityState = "available" | "busy" | "maxed";

function getState(active: number, max: number): CapacityState {
  if (active <= 0) return "available";
  if (active >= max) return "maxed";
  return "busy";
}

const STATE_CONFIG: Record<
  CapacityState,
  { color: string; label: (n: number) => string }
> = {
  available: {
    color: "#34D399",
    label: () => "Disponibile",
  },
  busy: {
    color: "#FFC832",
    label: (n) => `${n} attiv${n === 1 ? "o" : "i"}`,
  },
  maxed: {
    color: "#F87171",
    label: () => "A tappo",
  },
};

export function CapacityIndicator({
  activeCount,
  maxCapacity = 5,
}: CapacityIndicatorProps) {
  const state = getState(activeCount, maxCapacity);
  const { color, label } = STATE_CONFIG[state];

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--bg-raised)] border border-[var(--border-dark-subtle)]">
      {/* Dot with optional pulse */}
      <span className="relative flex h-2 w-2">
        {state === "busy" && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: color, opacity: 0.6 }}
            animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        {state === "maxed" ? (
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: `0 0 6px 1px ${color}`,
            }}
          />
        ) : (
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
      </span>

      {/* Label */}
      <AnimatePresence mode="wait">
        <motion.span
          key={state + activeCount}
          className="text-xs font-medium whitespace-nowrap"
          style={{ color }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {label(activeCount)}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
