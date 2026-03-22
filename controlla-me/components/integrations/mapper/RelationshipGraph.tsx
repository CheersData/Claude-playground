"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Database, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import type { SchemaEntity, EntityRelationship } from "./index";

interface RelationshipGraphProps {
  entities: SchemaEntity[];
  relationships: EntityRelationship[];
  activeEntityId?: string | null;
  onEntityClick?: (entityId: string) => void;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
}

const RELATION_COLORS: Record<EntityRelationship["type"], string> = {
  "one-to-one": "var(--info)",
  "one-to-many": "var(--success)",
  "many-to-many": "var(--caution)",
};

const RELATION_LABELS: Record<EntityRelationship["type"], string> = {
  "one-to-one": "1:1",
  "one-to-many": "1:N",
  "many-to-many": "N:N",
};

export default function RelationshipGraph({
  entities,
  relationships,
  activeEntityId,
  onEntityClick,
}: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  // Calculate node positions in a circle layout
  const nodePositions = useMemo((): NodePosition[] => {
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const radius = Math.min(cx, cy) * 0.65;
    return entities.map((entity, i) => {
      const angle = (i / entities.length) * 2 * Math.PI - Math.PI / 2;
      return {
        id: entity.id,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });
  }, [entities, dimensions]);

  const posMap = useMemo(
    () => new Map(nodePositions.map((n) => [n.id, n])),
    [nodePositions],
  );

  // Resize observer
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.2, 2)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.2, 0.4)), []);
  const handleZoomFit = useCallback(() => setZoom(1), []);

  if (entities.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--fg-muted)" }}
      >
        <p className="text-sm">Nessuna entità da visualizzare</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[300px]">
      {/* Zoom controls */}
      <div
        className="absolute top-3 right-3 flex flex-col gap-1 z-10 rounded-lg p-1"
        style={{
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        <button
          onClick={handleZoomIn}
          className="rounded p-1.5 transition-colors"
          style={{ color: "var(--fg-secondary)" }}
          aria-label="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="rounded p-1.5 transition-colors"
          style={{ color: "var(--fg-secondary)" }}
          aria-label="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleZoomFit}
          className="rounded p-1.5 transition-colors"
          style={{ color: "var(--fg-secondary)" }}
          aria-label="Adatta vista"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="w-full h-full"
        role="img"
        aria-label="Grafo relazioni tra entità"
      >
        <g transform={`scale(${zoom}) translate(${(1 - zoom) * dimensions.width / 2 / zoom}, ${(1 - zoom) * dimensions.height / 2 / zoom})`}>
          {/* Relationship edges */}
          {relationships.map((rel, i) => {
            const from = posMap.get(rel.from);
            const to = posMap.get(rel.to);
            if (!from || !to) return null;
            const color = RELATION_COLORS[rel.type];
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;

            return (
              <g key={`${rel.from}-${rel.to}-${i}`}>
                <motion.line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={0.5}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                />
                {/* Relation type badge */}
                <rect
                  x={midX - 14}
                  y={midY - 8}
                  width={28}
                  height={16}
                  rx={8}
                  fill="var(--bg-overlay)"
                  stroke={color}
                  strokeWidth={1}
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  fill={color}
                  fontSize={9}
                  fontWeight={600}
                  fontFamily="var(--font-sans)"
                >
                  {RELATION_LABELS[rel.type]}
                </text>
                {/* Custom label */}
                {rel.label && (
                  <text
                    x={midX}
                    y={midY + 18}
                    textAnchor="middle"
                    fill="var(--fg-muted)"
                    fontSize={8}
                    fontFamily="var(--font-sans)"
                  >
                    {rel.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Entity nodes */}
          {nodePositions.map((pos) => {
            const entity = entities.find((e) => e.id === pos.id);
            if (!entity) return null;
            const isActive = pos.id === activeEntityId;
            return (
              <g
                key={pos.id}
                onClick={() => onEntityClick?.(pos.id)}
                style={{ cursor: "pointer" }}
                role="button"
                tabIndex={0}
                aria-label={`Entità ${entity.name}, ${entity.fields.length} campi`}
              >
                <motion.circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isActive ? 32 : 28}
                  fill="var(--bg-raised)"
                  stroke={isActive ? "var(--accent)" : "var(--border-dark)"}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                />
                {/* DB icon placeholder */}
                <foreignObject
                  x={pos.x - 8}
                  y={pos.y - 12}
                  width={16}
                  height={16}
                >
                  <Database
                    className="w-4 h-4"
                    style={{ color: isActive ? "var(--accent)" : "var(--fg-secondary)" }}
                  />
                </foreignObject>
                {/* Entity name */}
                <text
                  x={pos.x}
                  y={pos.y + 8}
                  textAnchor="middle"
                  fill={isActive ? "var(--accent)" : "var(--fg-primary)"}
                  fontSize={10}
                  fontWeight={600}
                  fontFamily="var(--font-sans)"
                >
                  {entity.name.length > 10
                    ? entity.name.slice(0, 9) + "…"
                    : entity.name}
                </text>
                {/* Fields count badge */}
                <circle
                  cx={pos.x + 20}
                  cy={pos.y - 20}
                  r={10}
                  fill="var(--bg-overlay)"
                  stroke="var(--border-dark-subtle)"
                  strokeWidth={1}
                />
                <text
                  x={pos.x + 20}
                  y={pos.y - 17}
                  textAnchor="middle"
                  fill="var(--fg-muted)"
                  fontSize={8}
                  fontWeight={600}
                  fontFamily="var(--font-sans)"
                >
                  {entity.fields.length}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
