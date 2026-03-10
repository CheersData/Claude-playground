"use client";

import { motion } from "framer-motion";
import { Zap, Clock, CalendarDays, Hand } from "lucide-react";
import { type LucideIcon } from "lucide-react";

// ─── Types ───

export type SyncFrequency = "realtime" | "hourly" | "six_hours" | "daily" | "manual";

interface FrequencyOption {
  id: SyncFrequency;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface FrequencyStepProps {
  selected: SyncFrequency;
  onChange: (freq: SyncFrequency) => void;
}

// ─── Constants ───

const FREQUENCY_OPTIONS: FrequencyOption[] = [
  {
    id: "realtime",
    label: "Tempo reale (webhook)",
    description: "I dati vengono sincronizzati istantaneamente ad ogni modifica",
    icon: Zap,
  },
  {
    id: "hourly",
    label: "Ogni ora",
    description: "Sincronizzazione automatica ogni 60 minuti",
    icon: Clock,
  },
  {
    id: "six_hours",
    label: "Ogni 6 ore",
    description: "Quattro sincronizzazioni al giorno, a orari regolari",
    icon: Clock,
  },
  {
    id: "daily",
    label: "Giornaliera (06:00)",
    description: "Una sincronizzazione completa ogni mattina alle 06:00",
    icon: CalendarDays,
  },
  {
    id: "manual",
    label: "Manuale",
    description: "Sincronizza solo quando lo richiedi tu dalla dashboard",
    icon: Hand,
  },
];

// ─── Component ───

export default function FrequencyStep({ selected, onChange }: FrequencyStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold" style={{ color: "var(--fg-primary)" }}>
        Frequenza sincronizzazione
      </h2>
      <p className="text-sm mt-2" style={{ color: "var(--fg-secondary)" }}>
        Scegli con quale frequenza vuoi aggiornare i dati
      </p>

      {/* Radio group */}
      <div className="mt-6 space-y-2" role="radiogroup" aria-label="Frequenza sincronizzazione">
        {FREQUENCY_OPTIONS.map((option) => {
          const isSelected = selected === option.id;
          const Icon = option.icon;

          return (
            <motion.div
              key={option.id}
              layout
              onClick={() => onChange(option.id)}
              className="flex items-start gap-4 rounded-xl p-4 cursor-pointer transition-colors select-none"
              style={{
                background: isSelected ? "rgba(255, 107, 53, 0.05)" : "var(--bg-raised)",
                border: isSelected
                  ? "1px solid rgba(255, 107, 53, 0.3)"
                  : "1px solid var(--border-dark-subtle)",
              }}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onChange(option.id)}
              whileHover={{
                borderColor: isSelected ? "rgba(255, 107, 53, 0.3)" : "var(--border-dark)",
              }}
            >
              {/* Radio circle */}
              <div
                className="w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center transition-colors"
                style={{
                  border: isSelected ? "2px solid var(--accent)" : "2px solid var(--border-dark)",
                }}
              >
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </div>

              {/* Icon */}
              <Icon
                className="w-5 h-5 shrink-0 mt-0.5"
                style={{ color: isSelected ? "var(--accent)" : "var(--fg-muted)" }}
              />

              {/* Text */}
              <div className="flex-1 min-w-0">
                <span
                  className="text-sm font-medium"
                  style={{ color: isSelected ? "var(--fg-primary)" : "var(--fg-secondary)" }}
                >
                  {option.label}
                </span>
                <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>
                  {option.description}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
