"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { AnimatePresence } from "framer-motion";
import SchemaExplorer from "./SchemaExplorer";
import TargetSchemaPanel from "./TargetSchemaPanel";
import MappingLine from "./MappingLine";
import TransformEditor from "./TransformEditor";
import type {
  SchemaEntity,
  SchemaField,
  FieldMappingEntry,
  TransformRule,
} from "./index";

interface MappingCanvasProps {
  sourceEntity: SchemaEntity | null;
  targetEntity: SchemaEntity | null;
  mappings: FieldMappingEntry[];
  onMappingAdd: (sourceId: string, targetId: string) => void;
  onMappingRemove: (mappingId: string) => void;
  onTransformChange: (mappingId: string, transform: TransformRule | undefined) => void;
  onTargetFieldAdd?: (field: SchemaField) => void;
  onTargetFieldRemove?: (fieldId: string) => void;
}

export default function MappingCanvas({
  sourceEntity,
  targetEntity,
  mappings,
  onMappingAdd,
  onMappingRemove,
  onTransformChange,
  onTargetFieldAdd,
  onTargetFieldRemove,
}: MappingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Port positions keyed by fieldId
  const portRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [portPositions, setPortPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map(),
  );

  // DnD state
  const [draggingSource, setDraggingSource] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Transform editor
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);

  // Highlight
  const [highlightedMapping, setHighlightedMapping] = useState<string | null>(null);

  // Mapped field ID sets
  const mappedSourceIds = useMemo(
    () => new Set(mappings.map((m) => m.sourceFieldId)),
    [mappings],
  );
  const mappedTargetIds = useMemo(
    () => new Set(mappings.map((m) => m.targetFieldId)),
    [mappings],
  );

  // Highlighted field IDs
  const highlightedSourceId = useMemo(() => {
    if (!highlightedMapping) return null;
    return mappings.find((m) => m.id === highlightedMapping)?.sourceFieldId ?? null;
  }, [highlightedMapping, mappings]);
  const highlightedTargetId = useMemo(() => {
    if (!highlightedMapping) return null;
    return mappings.find((m) => m.id === highlightedMapping)?.targetFieldId ?? null;
  }, [highlightedMapping, mappings]);

  // Recalculate port positions
  const recalcPorts = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newPositions = new Map<string, { x: number; y: number }>();
    portRefs.current.forEach((el, id) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      newPositions.set(id, {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top,
      });
    });
    setPortPositions(newPositions);
  }, []);

  useEffect(() => {
    recalcPorts(); // eslint-disable-line react-hooks/set-state-in-effect -- initial layout measurement + resize subscription
    const timer = setInterval(recalcPorts, 500);
    window.addEventListener("resize", recalcPorts);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", recalcPorts);
    };
  }, [recalcPorts, sourceEntity, targetEntity, mappings]);

  // Port ref callback
  const handlePortRef = useCallback(
    (fieldId: string, el: HTMLDivElement | null) => {
      if (el) portRefs.current.set(fieldId, el);
      else portRefs.current.delete(fieldId);
    },
    [],
  );

  // DnD handlers
  const handleSourceDragStart = useCallback((fieldId: string) => {
    setDraggingSource(fieldId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingSource(null);
    setMousePos(null);
  }, []);

  const handleTargetDrop = useCallback(
    (targetFieldId: string) => {
      if (draggingSource) {
        onMappingAdd(draggingSource, targetFieldId);
        setDraggingSource(null);
        setMousePos(null);
      }
    },
    [draggingSource, onMappingAdd],
  );

  // Track mouse for preview line
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingSource || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [draggingSource],
  );

  // Click mapping line to edit transform
  const handleLineClick = useCallback((mappingId: string) => {
    setEditingMappingId((prev) => (prev === mappingId ? null : mappingId));
    setHighlightedMapping(mappingId);
  }, []);

  const editingMapping = useMemo(
    () => mappings.find((m) => m.id === editingMappingId),
    [mappings, editingMappingId],
  );

  return (
    <div
      ref={containerRef}
      className="relative flex h-full"
      onMouseMove={handleMouseMove}
      onDragOver={(e) => e.preventDefault()}
      role="application"
      aria-label="Canvas di mapping campi. Trascina un campo sorgente su un campo destinazione per creare un mapping."
    >
      {/* Source panel */}
      <div
        className="w-[38%] shrink-0 border-r overflow-hidden"
        style={{ borderColor: "var(--border-dark-subtle)" }}
      >
        <SchemaExplorer
          entity={sourceEntity}
          mappedFieldIds={mappedSourceIds}
          highlightedFieldId={highlightedSourceId}
          onDragStart={handleSourceDragStart}
          onDragEnd={handleDragEnd}
          onFieldClick={(id) => {
            const m = mappings.find((mp) => mp.sourceFieldId === id);
            if (m) setHighlightedMapping(m.id);
          }}
          onPortRef={handlePortRef}
        />
      </div>

      {/* SVG overlay for lines */}
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10 }}
        aria-hidden="true"
      >
        {/* Existing mapping lines */}
        {mappings.map((m) => {
          const fromPos = portPositions.get(m.sourceFieldId);
          const toPos = portPositions.get(m.targetFieldId);
          if (!fromPos || !toPos) return null;
          return (
            <g key={m.id} style={{ pointerEvents: "auto" }}>
              <MappingLine
                from={fromPos}
                to={toPos}
                confidence={m.confidence}
                isHighlighted={highlightedMapping === m.id}
                onClick={() => handleLineClick(m.id)}
              />
            </g>
          );
        })}
        {/* Preview line while dragging */}
        {draggingSource && mousePos && portPositions.get(draggingSource) && (
          <MappingLine
            from={portPositions.get(draggingSource)!}
            to={mousePos}
            isPreview
          />
        )}
      </svg>

      {/* Target panel */}
      <div className="w-[38%] shrink-0 overflow-hidden">
        <TargetSchemaPanel
          entity={targetEntity}
          mappedFieldIds={mappedTargetIds}
          highlightedFieldId={highlightedTargetId}
          onDrop={handleTargetDrop}
          onFieldClick={(id) => {
            const m = mappings.find((mp) => mp.targetFieldId === id);
            if (m) setHighlightedMapping(m.id);
          }}
          onPortRef={handlePortRef}
          onAddField={onTargetFieldAdd}
          onRemoveField={onTargetFieldRemove}
        />
      </div>

      {/* Transform editor popover */}
      <AnimatePresence>
        {editingMapping && (
          <TransformEditor
            mapping={editingMapping}
            sourceField={
              sourceEntity?.fields.find((f) => f.id === editingMapping.sourceFieldId) ?? null
            }
            targetField={
              targetEntity?.fields.find((f) => f.id === editingMapping.targetFieldId) ?? null
            }
            onTransformChange={(t) => onTransformChange(editingMapping.id, t)}
            onRemoveMapping={() => {
              onMappingRemove(editingMapping.id);
              setEditingMappingId(null);
              setHighlightedMapping(null);
            }}
            onClose={() => {
              setEditingMappingId(null);
              setHighlightedMapping(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
