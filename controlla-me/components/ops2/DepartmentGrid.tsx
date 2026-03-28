"use client";

import { ChevronRight } from "lucide-react";
import type { Department } from "@/lib/company/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeptStats {
  total: number;
  open: number;
  done: number;
  inProgress?: number;
}

interface DepartmentGridProps {
  departments: Record<string, DeptStats> | null | undefined;
  onSelectDept: (dept: Department) => void;
}

// ─── Dept config ─────────────────────────────────────────────────────────────

const DEPT_LABELS: Record<string, string> = {
  "ufficio-legale": "Ufficio Legale",
  "data-engineering": "Data Engineering",
  "quality-assurance": "Quality Assurance",
  architecture: "Architecture",
  finance: "Finance",
  operations: "Operations",
  security: "Security",
  strategy: "Strategy",
  marketing: "Marketing",
  trading: "Trading",
  integration: "Integrazione",
  music: "Musica",
  protocols: "Protocolli",
  "ux-ui": "UX/UI",
  acceleration: "Acceleration",
};

const DEPT_COLORS: Record<string, string> = {
  "ufficio-legale": "#4ECDC4",
  "data-engineering": "#60A5FA",
  "quality-assurance": "#34D399",
  architecture: "#A78BFA",
  finance: "#FFC832",
  operations: "#FF6B35",
  security: "#F87171",
  strategy: "#6EE7B7",
  marketing: "#F9A8D4",
  trading: "#86EFAC",
  integration: "#93C5FD",
  music: "#C084FC",
  protocols: "#FCD34D",
  "ux-ui": "#F472B6",
  acceleration: "#FB923C",
};

function getHealthPill(open: number, inProgress: number, total: number) {
  if (total === 0) return { label: "—", color: "var(--fg-invisible)", dot: "bg-[var(--fg-invisible)]" };
  if (open === 0 && inProgress === 0) return { label: "OK", color: "var(--success)", dot: "bg-[var(--success)]" };
  if (open > 5 || inProgress > 3) return { label: "Alto", color: "var(--error)", dot: "bg-[var(--error)] animate-pulse" };
  return { label: "Attivo", color: "#f59e0b", dot: "bg-[#f59e0b]" };
}

function DeptCard({
  id,
  stats,
  onClick,
}: {
  id: string;
  stats: DeptStats;
  onClick: () => void;
}) {
  const label = DEPT_LABELS[id] ?? id;
  const color = DEPT_COLORS[id] ?? "#FF6B35";
  const inProgress = stats.inProgress ?? 0;
  const health = getHealthPill(stats.open, inProgress, stats.total);

  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-2.5 rounded-xl p-4 text-left transition-all duration-150 w-full"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${color}40`;
        e.currentTarget.style.background = "var(--bg-overlay)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-dark-subtle)";
        e.currentTarget.style.background = "var(--bg-raised)";
      }}
    >
      {/* Top row: name + health pill */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: color }}
          />
          <span
            className="text-sm font-medium truncate"
            style={{ color: "var(--fg-primary)" }}
          >
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
          <span className="text-[10px]" style={{ color: health.color }}>
            {health.label}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--fg-invisible)" }}>
        {stats.open > 0 && (
          <span style={{ color: "var(--info)" }}>{stats.open} open</span>
        )}
        {inProgress > 0 && (
          <span style={{ color: "var(--identity-gold)" }}>{inProgress} in corso</span>
        )}
        <span style={{ color: "var(--success)" }}>{stats.done} done</span>
        <ChevronRight
          className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-60 transition-opacity"
          style={{ color: "var(--fg-secondary)" }}
        />
      </div>
    </button>
  );
}

// ─── Grid component ──────────────────────────────────────────────────────────

export function DepartmentGrid({ departments, onSelectDept }: DepartmentGridProps) {
  if (!departments) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 h-20 animate-pulse"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
          />
        ))}
      </div>
    );
  }

  const entries = Object.entries(departments).sort(
    ([, a], [, b]) => (b.open + (b.inProgress ?? 0)) - (a.open + (a.inProgress ?? 0))
  );

  if (entries.length === 0) {
    return (
      <p className="text-sm text-center py-8" style={{ color: "var(--fg-invisible)" }}>
        Nessun dipartimento trovato.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {entries.map(([id, stats]) => (
        <DeptCard
          key={id}
          id={id}
          stats={stats}
          onClick={() => onSelectDept(id as Department)}
        />
      ))}
    </div>
  );
}
