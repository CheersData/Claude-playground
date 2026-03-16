"use client";

import { Search } from "lucide-react";
import { CATEGORY_LABELS } from "./ConnectorCard";

// ─── Types ───

export type CategoryFilter = string;

interface IntegrationFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeCategory: CategoryFilter;
  onCategoryChange: (category: CategoryFilter) => void;
  categoryCounts: Record<string, number>;
  availableCategories: string[];
}

// ─── Component ───

export default function IntegrationFilters({
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  categoryCounts,
  availableCategories,
}: IntegrationFiltersProps) {
  return (
    <div>
      {/* Search bar */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-[var(--accent)]/20 focus-within:border-[var(--accent)]/50"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        <Search className="w-4 h-4 shrink-0" style={{ color: "var(--fg-muted)" }} />
        <input
          type="text"
          placeholder="Cerca connettore..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "var(--fg-primary)" }}
          aria-label="Cerca connettore"
        />
      </div>

      {/* Category filter pills */}
      <div
        className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-none"
        role="tablist"
        aria-label="Filtra per categoria"
      >
        {availableCategories.map((key) => {
          const isActive = activeCategory === key;
          const count = categoryCounts[key] || 0;
          const label = CATEGORY_LABELS[key] || key;
          return (
            <button
              key={key}
              onClick={() => onCategoryChange(key)}
              role="tab"
              aria-selected={isActive}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all ${!isActive ? "hover-border-dark" : ""}`}
              style={{
                background: isActive ? "rgba(255, 107, 53, 0.15)" : "var(--bg-overlay)",
                color: isActive ? "var(--accent)" : "var(--fg-muted)",
                border: isActive
                  ? "1px solid rgba(255, 107, 53, 0.3)"
                  : "1px solid transparent",
              }}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>
    </div>
  );
}
