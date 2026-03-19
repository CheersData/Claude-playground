"use client";

/**
 * DataModelExplorer — Visual tree/accordion for connector entity data models.
 *
 * Features:
 *   - Expandable entity groups with field details (type, description, required)
 *   - Search/filter across all entities and fields
 *   - Checkbox selection for field mapping
 *   - Core/required fields pre-checked and labeled
 *   - Visual entity group categories (Vendite, Anagrafiche, Documenti)
 *   - Animated expand/collapse via Framer Motion
 *
 * Design: Poimandres dark theme, accent #FF6B35, Lucide icons, Italian labels.
 */

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ChevronRight,
  Database,
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  Braces,
  List,
  Tag,
  CheckSquare,
  Square,
  Layers,
  Filter,
  Info,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

// ─── Types ───

export interface EntityFieldMeta {
  id: string;
  name: string;
  type: FieldType;
  description?: string;
  required?: boolean;
  example?: string;
  category?: string;
  children?: EntityFieldMeta[];
}

export interface EntityMeta {
  id: string;
  name: string;
  /** Entity group: "vendite" | "anagrafiche" | "documenti" | "configurazione" | "altro" */
  group?: string;
  description?: string;
  recordCount?: number;
  fields: EntityFieldMeta[];
}

export type FieldType = "string" | "number" | "boolean" | "date" | "object" | "array" | "enum";

// ─── Constants ───

const TYPE_ICONS: Record<FieldType, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  object: Braces,
  array: List,
  enum: Tag,
};

const TYPE_COLORS: Record<FieldType, string> = {
  string: "var(--info)",
  number: "var(--caution)",
  boolean: "var(--success)",
  date: "var(--accent)",
  object: "var(--fg-secondary)",
  array: "#a78bfa",
  enum: "#d0679d",
};

const TYPE_LABELS: Record<FieldType, string> = {
  string: "Testo",
  number: "Numero",
  boolean: "Si/No",
  date: "Data",
  object: "Oggetto",
  array: "Lista",
  enum: "Scelta",
};

const GROUP_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  vendite: {
    label: "Vendite",
    color: "var(--success)",
    bg: "rgba(93, 228, 199, 0.08)",
  },
  anagrafiche: {
    label: "Anagrafiche",
    color: "var(--info)",
    bg: "rgba(173, 215, 255, 0.08)",
  },
  documenti: {
    label: "Documenti",
    color: "var(--accent)",
    bg: "rgba(255, 107, 53, 0.08)",
  },
  configurazione: {
    label: "Configurazione",
    color: "var(--caution)",
    bg: "rgba(255, 250, 194, 0.08)",
  },
  altro: {
    label: "Altro",
    color: "var(--fg-muted)",
    bg: "var(--bg-overlay)",
  },
};

// ─── Props ───

interface DataModelExplorerProps {
  entities: EntityMeta[];
  /** Set of field IDs currently selected for mapping */
  selectedFieldIds?: Set<string>;
  /** Called when user toggles a field checkbox */
  onToggleField?: (entityId: string, fieldId: string) => void;
  /** Called when user selects/deselects all fields of an entity */
  onToggleEntity?: (entityId: string) => void;
  /** Read-only mode (no checkboxes, pure exploration) */
  readOnly?: boolean;
}

// ─── Helpers ───

function inferGroup(entityName: string, entityId: string): string {
  const n = (entityName + " " + entityId).toLowerCase();
  if (
    n.includes("fattur") ||
    n.includes("invoice") ||
    n.includes("payment") ||
    n.includes("pagament") ||
    n.includes("abbonament") ||
    n.includes("subscription") ||
    n.includes("deal") ||
    n.includes("opportunit")
  )
    return "vendite";
  if (
    n.includes("contatt") ||
    n.includes("contact") ||
    n.includes("client") ||
    n.includes("fornitor") ||
    n.includes("supplier") ||
    n.includes("aziend") ||
    n.includes("company") ||
    n.includes("account")
  )
    return "anagrafiche";
  if (
    n.includes("file") ||
    n.includes("document") ||
    n.includes("cartel") ||
    n.includes("folder") ||
    n.includes("report") ||
    n.includes("nota") ||
    n.includes("note")
  )
    return "documenti";
  if (
    n.includes("config") ||
    n.includes("pipeline") ||
    n.includes("setting") ||
    n.includes("campagn") ||
    n.includes("campaign")
  )
    return "configurazione";
  return "altro";
}

function matchesSearch(field: EntityFieldMeta, query: string): boolean {
  const q = query.toLowerCase();
  return (
    field.name.toLowerCase().includes(q) ||
    (field.description?.toLowerCase().includes(q) ?? false) ||
    field.type.toLowerCase().includes(q) ||
    (field.id.toLowerCase().includes(q))
  );
}

function countFieldsRecursive(fields: EntityFieldMeta[]): number {
  let count = 0;
  for (const f of fields) {
    count += 1;
    if (f.children) count += countFieldsRecursive(f.children);
  }
  return count;
}

// ─── Sub-components ───

function FieldRow({
  field,
  entityId,
  depth,
  isSelected,
  onToggle,
  readOnly,
  isHighlighted,
}: {
  field: EntityFieldMeta;
  entityId: string;
  depth: number;
  isSelected: boolean;
  onToggle?: () => void;
  readOnly?: boolean;
  isHighlighted?: boolean;
}) {
  const [childExpanded, setChildExpanded] = useState(false);
  const Icon = TYPE_ICONS[field.type] || Type;
  const typeColor = TYPE_COLORS[field.type] || "var(--fg-secondary)";

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8 }}
        transition={{ duration: 0.15 }}
        className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
        style={{
          marginLeft: depth * 20,
          background: isHighlighted
            ? "rgba(255, 107, 53, 0.08)"
            : isSelected
              ? "rgba(93, 228, 199, 0.04)"
              : "transparent",
          border: isHighlighted
            ? "1px solid rgba(255, 107, 53, 0.2)"
            : "1px solid transparent",
        }}
      >
        {/* Checkbox */}
        {!readOnly && (
          <button
            onClick={onToggle}
            className="shrink-0 transition-colors"
            style={{ color: isSelected ? "var(--success)" : "var(--fg-muted)" }}
            aria-label={`${isSelected ? "Deseleziona" : "Seleziona"} campo ${field.name}`}
            aria-pressed={isSelected}
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
        )}

        {/* Type icon */}
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: typeColor }} />

        {/* Field name + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium truncate"
              style={{ color: "var(--fg-primary)" }}
            >
              {field.name}
            </span>

            {field.required && (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{
                  background: "rgba(255, 107, 53, 0.12)",
                  color: "var(--accent)",
                }}
              >
                Obbligatorio
              </span>
            )}

            {field.children && field.children.length > 0 && (
              <button
                onClick={() => setChildExpanded(!childExpanded)}
                className="shrink-0 flex items-center gap-0.5 text-[10px] transition-colors"
                style={{ color: "var(--fg-muted)" }}
                aria-expanded={childExpanded}
                aria-label={`${childExpanded ? "Comprimi" : "Espandi"} sotto-campi di ${field.name}`}
              >
                <ChevronRight
                  className="w-3 h-3 transition-transform"
                  style={{
                    transform: childExpanded ? "rotate(90deg)" : "rotate(0)",
                  }}
                />
                {field.children.length}
              </button>
            )}
          </div>

          {field.description && (
            <p
              className="text-xs mt-0.5 truncate"
              style={{ color: "var(--fg-muted)" }}
              title={field.description}
            >
              {field.description}
            </p>
          )}
        </div>

        {/* Type badge */}
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            background: `${typeColor}15`,
            color: typeColor,
            border: `1px solid ${typeColor}25`,
          }}
        >
          {TYPE_LABELS[field.type] || field.type}
        </span>

        {/* Example value */}
        {field.example && (
          <span
            className="hidden sm:block shrink-0 text-[10px] font-mono max-w-[120px] truncate"
            style={{ color: "var(--fg-invisible)" }}
            title={`Es: ${field.example}`}
          >
            {field.example}
          </span>
        )}
      </motion.div>

      {/* Children (nested fields for object/array types) */}
      <AnimatePresence>
        {childExpanded && field.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="ml-5 border-l-2 pl-1"
              style={{ borderColor: "var(--border-dark-subtle)" }}
            >
              {field.children.map((child) => (
                <FieldRow
                  key={child.id}
                  field={child}
                  entityId={entityId}
                  depth={depth + 1}
                  isSelected={false}
                  readOnly={readOnly}
                  isHighlighted={false}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function EntityAccordion({
  entity,
  group,
  isExpanded,
  onToggleExpand,
  selectedFieldIds,
  onToggleField,
  onToggleEntity,
  readOnly,
  searchQuery,
}: {
  entity: EntityMeta;
  group: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedFieldIds: Set<string>;
  onToggleField?: (entityId: string, fieldId: string) => void;
  onToggleEntity?: (entityId: string) => void;
  readOnly?: boolean;
  searchQuery: string;
}) {
  const gc = GROUP_CONFIG[group] || GROUP_CONFIG.altro;

  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return entity.fields;
    return entity.fields.filter((f) => matchesSearch(f, searchQuery));
  }, [entity.fields, searchQuery]);

  const totalFields = countFieldsRecursive(entity.fields);
  const requiredFields = entity.fields.filter((f) => f.required);
  const selectedCount = entity.fields.filter((f) =>
    selectedFieldIds.has(`${entity.id}.${f.id}`)
  ).length;

  const allSelected = selectedCount === entity.fields.length && entity.fields.length > 0;

  if (searchQuery && filteredFields.length === 0) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: isExpanded
          ? `1px solid ${gc.color}30`
          : "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Entity header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--bg-overlay)]"
        aria-expanded={isExpanded}
        aria-controls={`entity-panel-${entity.id}`}
      >
        {/* Expand chevron */}
        <ChevronRight
          className="w-4 h-4 shrink-0 transition-transform"
          style={{
            color: "var(--fg-muted)",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
          }}
        />

        {/* Entity icon + name */}
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
          style={{ background: gc.bg }}
        >
          <Database className="w-4 h-4" style={{ color: gc.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--fg-primary)" }}
            >
              {entity.name}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: gc.bg, color: gc.color }}
            >
              {gc.label}
            </span>
          </div>
          {entity.description && (
            <p
              className="text-xs mt-0.5 truncate"
              style={{ color: "var(--fg-muted)" }}
            >
              {entity.description}
            </p>
          )}
        </div>

        {/* Stats badges */}
        <div className="flex items-center gap-2 shrink-0">
          {entity.recordCount !== undefined && entity.recordCount > 0 && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--bg-overlay)", color: "var(--fg-muted)" }}
            >
              ~{entity.recordCount.toLocaleString("it-IT")} record
            </span>
          )}
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
            style={{ background: "var(--bg-overlay)", color: "var(--info)" }}
          >
            {totalFields} campi
          </span>
          {requiredFields.length > 0 && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
              style={{
                background: "rgba(255, 107, 53, 0.08)",
                color: "var(--accent)",
              }}
            >
              {requiredFields.length} obbligatori
            </span>
          )}
          {!readOnly && selectedCount > 0 && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
              style={{
                background: "rgba(93, 228, 199, 0.12)",
                color: "var(--success)",
              }}
            >
              {selectedCount} selezionati
            </span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id={`entity-panel-${entity.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div
              className="px-5 pb-4"
              style={{ borderTop: `1px solid ${gc.color}15` }}
            >
              {/* Select all bar */}
              {!readOnly && (
                <div
                  className="flex items-center justify-between py-2.5 mb-2"
                  style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
                >
                  <button
                    onClick={() => onToggleEntity?.(entity.id)}
                    className="flex items-center gap-2 text-xs font-medium transition-colors"
                    style={{
                      color: allSelected ? "var(--success)" : "var(--fg-muted)",
                    }}
                  >
                    {allSelected ? (
                      <CheckSquare className="w-3.5 h-3.5" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
                  </button>
                  {requiredFields.length > 0 && (
                    <div
                      className="flex items-center gap-1.5 text-[10px]"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      <ShieldCheck className="w-3 h-3" style={{ color: "var(--accent)" }} />
                      I campi obbligatori vengono selezionati automaticamente
                    </div>
                  )}
                </div>
              )}

              {/* Field list */}
              <div className="space-y-0.5" role="list" aria-label={`Campi di ${entity.name}`}>
                {filteredFields.map((field) => {
                  const fieldKey = `${entity.id}.${field.id}`;
                  const isSelected = selectedFieldIds.has(fieldKey);
                  return (
                    <FieldRow
                      key={field.id}
                      field={field}
                      entityId={entity.id}
                      depth={0}
                      isSelected={isSelected}
                      onToggle={() => onToggleField?.(entity.id, field.id)}
                      readOnly={readOnly}
                      isHighlighted={
                        searchQuery
                          ? matchesSearch(field, searchQuery)
                          : false
                      }
                    />
                  );
                })}

                {filteredFields.length === 0 && (
                  <p
                    className="text-xs text-center py-4"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    Nessun campo corrisponde alla ricerca
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ───

export default function DataModelExplorer({
  entities,
  selectedFieldIds = new Set(),
  onToggleField,
  onToggleEntity,
  readOnly = false,
}: DataModelExplorerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const [activeTypeFilter, setActiveTypeFilter] = useState<FieldType | null>(null);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string | null>(null);

  // Group entities
  const groupedEntities = useMemo(() => {
    const groups = new Map<string, EntityMeta[]>();
    for (const entity of entities) {
      const group = entity.group || inferGroup(entity.name, entity.id);
      const list = groups.get(group) || [];
      list.push(entity);
      groups.set(group, list);
    }
    // Sort by GROUP_CONFIG order
    const order = Object.keys(GROUP_CONFIG);
    return Array.from(groups.entries()).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
  }, [entities]);

  // Available groups for filter
  const availableGroups = useMemo(
    () => groupedEntities.map(([g]) => g),
    [groupedEntities]
  );

  // Filtered entities
  const filteredGrouped = useMemo(() => {
    let result = groupedEntities;

    if (activeGroupFilter) {
      result = result.filter(([g]) => g === activeGroupFilter);
    }

    if (activeTypeFilter) {
      result = result.map(([group, ents]) => [
        group,
        ents.map((e) => ({
          ...e,
          fields: e.fields.filter((f) => f.type === activeTypeFilter),
        })).filter((e) => e.fields.length > 0),
      ] as [string, EntityMeta[]]).filter(([, ents]) => ents.length > 0);
    }

    return result;
  }, [groupedEntities, activeGroupFilter, activeTypeFilter]);

  const toggleExpand = useCallback((entityId: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedEntities(new Set(entities.map((e) => e.id)));
  }, [entities]);

  const collapseAll = useCallback(() => {
    setExpandedEntities(new Set());
  }, []);

  // Stats
  const totalEntities = entities.length;
  const totalFields = entities.reduce(
    (sum, e) => sum + countFieldsRecursive(e.fields),
    0
  );
  const totalRequired = entities.reduce(
    (sum, e) => sum + e.fields.filter((f) => f.required).length,
    0
  );
  const totalSelected = selectedFieldIds.size;

  const TYPE_FILTERS: FieldType[] = ["string", "number", "boolean", "date", "object", "array", "enum"];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-xl font-semibold"
            style={{ color: "var(--fg-primary)" }}
          >
            Modello Dati
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--fg-secondary)" }}>
            Esplora entita e campi disponibili nel connettore
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-muted)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            Espandi tutto
          </button>
          <button
            onClick={collapseAll}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-muted)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            Comprimi tutto
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dark-subtle)",
          }}
        >
          <div
            className="text-lg font-bold"
            style={{ color: "var(--fg-primary)" }}
          >
            {totalEntities}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
            Entita
          </div>
        </div>
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dark-subtle)",
          }}
        >
          <div
            className="text-lg font-bold"
            style={{ color: "var(--info)" }}
          >
            {totalFields}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
            Campi totali
          </div>
        </div>
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dark-subtle)",
          }}
        >
          <div
            className="text-lg font-bold"
            style={{ color: "var(--accent)" }}
          >
            {totalRequired}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
            Obbligatori
          </div>
        </div>
        {!readOnly && (
          <div
            className="rounded-xl p-3 text-center"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            <div
              className="text-lg font-bold"
              style={{ color: "var(--success)" }}
            >
              {totalSelected}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              Selezionati
            </div>
          </div>
        )}
      </div>

      {/* Search + filters */}
      <div className="space-y-3 mb-5">
        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--fg-muted)" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca entita o campi..."
            className="w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-primary)",
            }}
            aria-label="Cerca nel modello dati"
          />
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Group filters */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" style={{ color: "var(--fg-muted)" }} />
            <button
              onClick={() => setActiveGroupFilter(null)}
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
              style={{
                background: !activeGroupFilter ? "var(--accent)" : "transparent",
                color: !activeGroupFilter ? "#fff" : "var(--fg-muted)",
                border: `1px solid ${!activeGroupFilter ? "var(--accent)" : "var(--border-dark-subtle)"}`,
              }}
              aria-pressed={!activeGroupFilter}
            >
              Tutti
            </button>
            {availableGroups.map((g) => {
              const gc = GROUP_CONFIG[g] || GROUP_CONFIG.altro;
              const isActive = activeGroupFilter === g;
              return (
                <button
                  key={g}
                  onClick={() => setActiveGroupFilter(isActive ? null : g)}
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                  style={{
                    background: isActive ? gc.color : "transparent",
                    color: isActive ? "#1b1e28" : gc.color,
                    border: `1px solid ${isActive ? gc.color : gc.color + "40"}`,
                  }}
                  aria-pressed={isActive}
                >
                  {gc.label}
                </button>
              );
            })}
          </div>

          {/* Separator */}
          <div
            className="h-4 w-px"
            style={{ background: "var(--border-dark-subtle)" }}
          />

          {/* Type filters */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" style={{ color: "var(--fg-muted)" }} />
            {TYPE_FILTERS.map((t) => {
              const isActive = activeTypeFilter === t;
              const color = TYPE_COLORS[t];
              return (
                <button
                  key={t}
                  onClick={() => setActiveTypeFilter(isActive ? null : t)}
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                  style={{
                    background: isActive ? color : "transparent",
                    color: isActive ? "#1b1e28" : color,
                    border: `1px solid ${isActive ? color : color + "30"}`,
                  }}
                  aria-pressed={isActive}
                >
                  {TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Entity tree */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredGrouped.map(([group, ents]) => (
            <div key={group}>
              {filteredGrouped.length > 1 && (
                <div className="flex items-center gap-2 mb-2 mt-1">
                  <div
                    className="flex-1 h-px"
                    style={{ background: (GROUP_CONFIG[group]?.color || "var(--fg-muted)") + "25" }}
                  />
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: GROUP_CONFIG[group]?.color || "var(--fg-muted)" }}
                  >
                    {GROUP_CONFIG[group]?.label || group}
                  </span>
                  <div
                    className="flex-1 h-px"
                    style={{ background: (GROUP_CONFIG[group]?.color || "var(--fg-muted)") + "25" }}
                  />
                </div>
              )}

              <div className="space-y-2">
                {ents.map((entity) => (
                  <EntityAccordion
                    key={entity.id}
                    entity={entity}
                    group={group}
                    isExpanded={expandedEntities.has(entity.id)}
                    onToggleExpand={() => toggleExpand(entity.id)}
                    selectedFieldIds={selectedFieldIds}
                    onToggleField={onToggleField}
                    onToggleEntity={onToggleEntity}
                    readOnly={readOnly}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            </div>
          ))}
        </AnimatePresence>

        {filteredGrouped.length === 0 && (
          <div
            className="flex flex-col items-center py-12 rounded-xl"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            <Info className="w-8 h-8 mb-3" style={{ color: "var(--fg-muted)" }} />
            <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
              Nessuna entita trovata con i filtri applicati
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setActiveGroupFilter(null);
                setActiveTypeFilter(null);
              }}
              className="mt-3 text-xs px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "var(--bg-overlay)",
                color: "var(--fg-muted)",
                border: "1px solid var(--border-dark-subtle)",
              }}
            >
              Resetta filtri
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-4 mt-5 px-4 py-3 rounded-xl text-[10px]"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-dark-subtle)",
          color: "var(--fg-muted)",
        }}
      >
        <span className="font-semibold uppercase tracking-wider" style={{ color: "var(--fg-invisible)" }}>
          Legenda tipi:
        </span>
        {TYPE_FILTERS.map((t) => {
          const Icon = TYPE_ICONS[t];
          return (
            <span key={t} className="inline-flex items-center gap-1">
              <Icon className="w-3 h-3" style={{ color: TYPE_COLORS[t] }} />
              {TYPE_LABELS[t]}
            </span>
          );
        })}
        <span className="ml-auto inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" style={{ color: "var(--accent)" }} />
          = Obbligatorio
        </span>
      </div>
    </div>
  );
}
