"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  AlertTriangle,
  Circle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActivityEventType =
  | "done"
  | "completed"
  | "in_progress"
  | "blocked"
  | "review_pending"
  | "open";

export type ActivityEventPriority =
  | "critical"
  | "high"
  | "medium"
  | "low";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  department?: string;
  priority?: ActivityEventPriority;
}

// ─── Status config ──────────────────────────────────────────────────────────

const STATUS_MAP: Record<
  ActivityEventType,
  { icon: typeof Circle; color: string; animate?: boolean }
> = {
  done:           { icon: CheckCircle2,  color: "text-[var(--success)]" },
  completed:      { icon: CheckCircle2,  color: "text-[var(--success)]" },
  in_progress:    { icon: Loader2,       color: "text-[var(--identity-gold)]", animate: true },
  blocked:        { icon: XCircle,       color: "text-[var(--error)]" },
  review_pending: { icon: AlertTriangle, color: "text-[var(--identity-violet)]" },
  open:           { icon: Circle,        color: "text-[var(--info)]" },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ActivityFeed({
  events,
  onEventClick,
  maxItems = 10,
}: {
  events: ActivityEvent[];
  onEventClick?: (event: ActivityEvent) => void;
  maxItems?: number;
}) {
  const items = events.slice(0, maxItems);

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--fg-secondary)] text-center py-6">
        Nessuna attivit&agrave; recente
      </p>
    );
  }

  return (
    <div className="space-y-px">
      {items.map((ev, i) => {
        const cfg = STATUS_MAP[ev.type] ?? STATUS_MAP.open;
        const Icon = cfg.icon;

        return (
          <motion.button
            key={ev.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02, duration: 0.2 }}
            onClick={() => onEventClick?.(ev)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg
              hover:bg-[var(--bg-overlay)] transition-colors duration-150
              text-left group"
          >
            <Icon
              className={`w-4 h-4 shrink-0 ${cfg.color} ${
                cfg.animate ? "animate-spin" : ""
              }`}
            />
            <span className="text-sm text-[var(--fg-primary)] group-hover:text-white truncate flex-1">
              {ev.title}
            </span>
            {ev.department && (
              <span className="text-xs text-[var(--fg-invisible)] font-mono
                px-2 py-0.5 rounded bg-[var(--bg-base)] shrink-0">
                {ev.department}
              </span>
            )}
            {ev.priority && ["critical", "high"].includes(ev.priority) && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  ev.priority === "critical"
                    ? "bg-[var(--error)]"
                    : "bg-[var(--identity-gold)]"
                }`}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
