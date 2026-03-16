"use client";

import { motion } from "framer-motion";
import { Database, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { SchemaEntity } from "./index";

interface EntitySelectorProps {
  entities: SchemaEntity[];
  activeEntityId: string | null;
  onSelect: (entityId: string) => void;
  mappingCounts?: Record<string, { mapped: number; total: number }>;
}

export default function EntitySelector({
  entities,
  activeEntityId,
  onSelect,
  mappingCounts,
}: EntitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeEntity = entities.find((e) => e.id === activeEntityId);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  if (entities.length <= 4) {
    // Tab-based for few entities
    return (
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Seleziona entità">
        {entities.map((entity) => {
          const isActive = entity.id === activeEntityId;
          const counts = mappingCounts?.[entity.id];
          return (
            <button
              key={entity.id}
              onClick={() => onSelect(entity.id)}
              className="relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                background: isActive ? "rgba(255, 107, 53, 0.1)" : "transparent",
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border-dark-subtle)"}`,
                color: isActive ? "var(--accent)" : "var(--fg-secondary)",
              }}
              role="tab"
              aria-selected={isActive}
              aria-controls={`entity-panel-${entity.id}`}
            >
              <Database className="w-3.5 h-3.5" />
              {entity.name}
              {counts && (
                <span
                  className="text-[10px] font-semibold"
                  style={{
                    color:
                      counts.mapped === counts.total
                        ? "var(--success)"
                        : "var(--fg-muted)",
                  }}
                >
                  {counts.mapped}/{counts.total}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="entity-indicator"
                  className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Dropdown for many entities
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        style={{
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-dark-subtle)",
          color: "var(--fg-primary)",
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <Database className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
        {activeEntity?.name ?? "Seleziona entità"}
        <ChevronDown
          className="w-3.5 h-3.5 ml-1 transition-transform"
          style={{
            color: "var(--fg-muted)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0)",
          }}
        />
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute top-full left-0 mt-1 w-64 rounded-xl overflow-hidden z-30"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dark)",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.3)",
          }}
          role="listbox"
          aria-label="Entità disponibili"
        >
          {entities.map((entity) => {
            const isActive = entity.id === activeEntityId;
            const counts = mappingCounts?.[entity.id];
            return (
              <button
                key={entity.id}
                onClick={() => {
                  onSelect(entity.id);
                  setIsOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm transition-colors text-left"
                style={{
                  background: isActive ? "rgba(255, 107, 53, 0.08)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--fg-primary)",
                }}
                role="option"
                aria-selected={isActive}
              >
                <Database className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{entity.name}</span>
                {entity.recordCount !== undefined && (
                  <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                    {entity.recordCount.toLocaleString("it-IT")} rec
                  </span>
                )}
                {counts && (
                  <span
                    className="text-[10px] font-semibold shrink-0"
                    style={{
                      color:
                        counts.mapped === counts.total
                          ? "var(--success)"
                          : "var(--fg-muted)",
                    }}
                  >
                    {counts.mapped}/{counts.total}
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
