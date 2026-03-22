"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Target, Plus, Trash2 } from "lucide-react";
import FieldNode from "./FieldNode";
import type { SchemaField, SchemaEntity, FieldType } from "./index";

interface TargetSchemaPanelProps {
  entity: SchemaEntity | null;
  mappedFieldIds: Set<string>;
  highlightedFieldId?: string | null;
  onDrop?: (targetFieldId: string) => void;
  onFieldClick?: (fieldId: string) => void;
  onPortRef?: (fieldId: string, el: HTMLDivElement | null) => void;
  onAddField?: (field: SchemaField) => void;
  onRemoveField?: (fieldId: string) => void;
}

export default function TargetSchemaPanel({
  entity,
  mappedFieldIds,
  highlightedFieldId,
  onDrop,
  onFieldClick,
  onPortRef,
  onAddField,
  onRemoveField,
}: TargetSchemaPanelProps) {
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("string");

  const filteredFields = useMemo(() => {
    if (!entity) return [];
    if (!search) return entity.fields;
    const q = search.toLowerCase();
    return entity.fields.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q),
    );
  }, [entity, search]);

  const stats = useMemo(() => {
    if (!entity) return { total: 0, mapped: 0, unmapped: 0 };
    const mapped = entity.fields.filter((f) => mappedFieldIds.has(f.id)).length;
    return { total: entity.fields.length, mapped, unmapped: entity.fields.length - mapped };
  }, [entity, mappedFieldIds]);

  const handleAddField = () => {
    if (!newFieldName.trim()) return;
    onAddField?.({
      id: `custom_${Date.now()}`,
      name: newFieldName.trim(),
      type: newFieldType,
      required: false,
    });
    setNewFieldName("");
    setNewFieldType("string");
    setShowAddForm(false);
  };

  if (!entity) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-3 p-6"
        style={{ color: "var(--fg-muted)" }}
      >
        <Target className="w-10 h-10 opacity-40" />
        <p className="text-sm">Schema destinazione non disponibile</p>
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
          <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
            Schema Destinazione
          </h3>
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            {stats.unmapped} campi da mappare
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
          style={{
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            background: showAddForm ? "rgba(255, 107, 53, 0.1)" : "transparent",
          }}
          aria-expanded={showAddForm}
          aria-label="Aggiungi campo personalizzato"
        >
          <Plus className="w-3 h-3" />
          Campo
        </button>
      </div>

      {/* Add field form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 py-2 border-b overflow-hidden"
            style={{ borderColor: "var(--border-dark-subtle)" }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Nome campo..."
                className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--border-dark-subtle)",
                  color: "var(--fg-primary)",
                }}
                onKeyDown={(e) => e.key === "Enter" && handleAddField()}
                aria-label="Nome del nuovo campo"
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as FieldType)}
                className="rounded-lg px-2 py-1.5 text-xs outline-none"
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--border-dark-subtle)",
                  color: "var(--fg-primary)",
                }}
                aria-label="Tipo del nuovo campo"
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
              </select>
              <button
                onClick={handleAddField}
                disabled={!newFieldName.trim()}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
                style={{ background: "var(--accent)" }}
              >
                Aggiungi
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: "var(--fg-muted)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca campo destinazione..."
            className="w-full rounded-lg pl-8 pr-3 py-2 text-xs outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-primary)",
            }}
            aria-label="Cerca campo nello schema destinazione"
          />
        </div>
      </div>

      {/* Fields list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1" role="list" aria-label="Campi schema destinazione">
        <AnimatePresence mode="popLayout">
          {filteredFields.map((field) => (
            <div key={field.id} className="group relative">
              <FieldNode
                field={field}
                side="target"
                isMapped={mappedFieldIds.has(field.id)}
                isHighlighted={highlightedFieldId === field.id}
                onDrop={(id) => onDrop?.(id)}
                onClick={onFieldClick}
                onPortRef={onPortRef}
              />
              {/* Remove custom field */}
              {field.id.startsWith("custom_") && (
                <button
                  onClick={() => onRemoveField?.(field.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 rounded p-1 transition-opacity"
                  style={{ color: "var(--error)" }}
                  aria-label={`Rimuovi campo ${field.name}`}
                >
                  <Trash2 className="w-3 h-3" />
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
