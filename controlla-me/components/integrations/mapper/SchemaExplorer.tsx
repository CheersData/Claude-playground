"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronRight, Database, Filter } from "lucide-react";
import FieldNode from "./FieldNode";
import type { SchemaField, SchemaEntity, FieldType } from "./index";

interface SchemaExplorerProps {
  entity: SchemaEntity | null;
  mappedFieldIds: Set<string>;
  highlightedFieldId?: string | null;
  onDragStart?: (fieldId: string) => void;
  onDragEnd?: () => void;
  onFieldClick?: (fieldId: string) => void;
  onPortRef?: (fieldId: string, el: HTMLDivElement | null) => void;
}

const TYPE_FILTERS: FieldType[] = ["string", "number", "boolean", "date", "object", "array"];

export default function SchemaExplorer({
  entity,
  mappedFieldIds,
  highlightedFieldId,
  onDragStart,
  onDragEnd,
  onFieldClick,
  onPortRef,
}: SchemaExplorerProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<FieldType | null>(null);
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((fieldId: string) => {
    setExpandedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }, []);

  const filteredFields = useMemo(() => {
    if (!entity) return [];
    let fields = entity.fields;
    if (search) {
      const q = search.toLowerCase();
      fields = fields.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.description?.toLowerCase().includes(q),
      );
    }
    if (typeFilter) {
      fields = fields.filter((f) => f.type === typeFilter);
    }
    return fields;
  }, [entity, search, typeFilter]);

  const stats = useMemo(() => {
    if (!entity) return { total: 0, mapped: 0 };
    return {
      total: entity.fields.length,
      mapped: entity.fields.filter((f) => mappedFieldIds.has(f.id)).length,
    };
  }, [entity, mappedFieldIds]);

  if (!entity) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-3 p-6"
        style={{ color: "var(--fg-muted)" }}
      >
        <Database className="w-10 h-10 opacity-40" />
        <p className="text-sm">Seleziona un&apos;entità per esplorare lo schema</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border-dark-subtle)" }}
      >
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--fg-primary)" }}
          >
            Schema Sorgente
          </h3>
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            {stats.mapped}/{stats.total} campi mappati
          </p>
        </div>
        <div
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{
            background: "rgba(93, 228, 199, 0.12)",
            color: "var(--success)",
          }}
        >
          {entity.name}
        </div>
      </div>

      {/* Search + filter */}
      <div className="px-4 py-2 space-y-2">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: "var(--fg-muted)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca campo..."
            className="w-full rounded-lg pl-8 pr-3 py-2 text-xs outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-primary)",
            }}
            aria-label="Cerca campo nello schema sorgente"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setTypeFilter(null)}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
            style={{
              background: !typeFilter ? "var(--accent)" : "transparent",
              color: !typeFilter ? "#fff" : "var(--fg-muted)",
              border: `1px solid ${!typeFilter ? "var(--accent)" : "var(--border-dark-subtle)"}`,
            }}
            aria-pressed={!typeFilter}
          >
            Tutti
          </button>
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
              style={{
                background: typeFilter === t ? "var(--accent)" : "transparent",
                color: typeFilter === t ? "#fff" : "var(--fg-muted)",
                border: `1px solid ${typeFilter === t ? "var(--accent)" : "var(--border-dark-subtle)"}`,
              }}
              aria-pressed={typeFilter === t}
            >
              {t}
            </button>
          ))}
          <Filter className="w-3 h-3 self-center" style={{ color: "var(--fg-muted)" }} />
        </div>
      </div>

      {/* Fields list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1" role="list" aria-label="Campi schema sorgente">
        <AnimatePresence mode="popLayout">
          {filteredFields.map((field) => (
            <div key={field.id}>
              <FieldNode
                field={field}
                side="source"
                isMapped={mappedFieldIds.has(field.id)}
                isHighlighted={highlightedFieldId === field.id}
                onDragStart={(id) => onDragStart?.(id)}
                onDragEnd={onDragEnd}
                onClick={(id) => {
                  if (field.children?.length) toggleExpand(id);
                  onFieldClick?.(id);
                }}
                onPortRef={onPortRef}
              />
              {/* Nested children for object types */}
              {field.children && expandedObjects.has(field.id) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-6 mt-1 space-y-1 border-l-2 pl-2"
                  style={{ borderColor: "var(--border-dark-subtle)" }}
                >
                  {field.children.map((child) => (
                    <FieldNode
                      key={child.id}
                      field={child}
                      side="source"
                      isMapped={mappedFieldIds.has(child.id)}
                      isHighlighted={highlightedFieldId === child.id}
                      onDragStart={(id) => onDragStart?.(id)}
                      onDragEnd={onDragEnd}
                      onClick={onFieldClick}
                      onPortRef={onPortRef}
                    />
                  ))}
                </motion.div>
              )}
              {field.children && (
                <button
                  onClick={() => toggleExpand(field.id)}
                  className="ml-8 mt-0.5 flex items-center gap-1 text-[10px] transition-colors"
                  style={{ color: "var(--fg-muted)" }}
                  aria-expanded={expandedObjects.has(field.id)}
                  aria-label={`Espandi sotto-campi di ${field.name}`}
                >
                  <ChevronRight
                    className="w-3 h-3 transition-transform"
                    style={{
                      transform: expandedObjects.has(field.id) ? "rotate(90deg)" : "rotate(0)",
                    }}
                  />
                  {field.children.length} sotto-campi
                </button>
              )}
            </div>
          ))}
        </AnimatePresence>

        {filteredFields.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: "var(--fg-muted)" }}>
            Nessun campo trovato
          </p>
        )}
      </div>
    </div>
  );
}
