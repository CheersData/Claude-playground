"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import {
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  Braces,
  List,
  Tag,
  GripVertical,
  AlertTriangle,
} from "lucide-react";
import type { SchemaField, FieldType } from "./index";

// ─── Type → Icon mapping ────────────────────────────────────────────

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

// ─── Props ──────────────────────────────────────────────────────────

interface FieldNodeProps {
  field: SchemaField;
  side: "source" | "target";
  isMapped?: boolean;
  isHighlighted?: boolean;
  confidence?: number;
  onDragStart?: (fieldId: string, side: "source" | "target") => void;
  onDragEnd?: () => void;
  onDrop?: (fieldId: string, side: "source" | "target") => void;
  onPortRef?: (fieldId: string, el: HTMLDivElement | null) => void;
  onClick?: (fieldId: string) => void;
}

// ─── Component ──────────────────────────────────────────────────────

export default function FieldNode({
  field,
  side,
  isMapped,
  isHighlighted,
  confidence,
  onDragStart,
  onDragEnd,
  onDrop,
  onPortRef,
  onClick,
}: FieldNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const Icon = TYPE_ICONS[field.type] || Type;
  const typeColor = TYPE_COLORS[field.type] || "var(--fg-secondary)";

  // Entry animation via CSS
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ fieldId: field.id, side }));
      e.dataTransfer.effectAllowed = "link";
      onDragStart?.(field.id, side);
    },
    [field.id, side, onDragStart],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "link";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onDrop?.(field.id, side);
    },
    [field.id, side, onDrop],
  );

  const handleDragEndLocal = useCallback(() => {
    onDragEnd?.();
  }, [onDragEnd]);

  return (
    <div
      ref={nodeRef}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={handleDragEndLocal}
      onClick={() => onClick?.(field.id)}
      className="group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm select-none"
      style={{
        background: isHighlighted
          ? "var(--bg-overlay)"
          : isMapped
            ? "rgba(93, 228, 199, 0.06)"
            : "transparent",
        border: `1px solid ${isHighlighted ? "var(--accent)" : isMapped ? "rgba(93, 228, 199, 0.2)" : "var(--border-dark-subtle)"}`,
        cursor: "grab",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : `translateX(${side === "source" ? "-12px" : "12px"})`,
        transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s, border-color 0.15s",
      }}
      role="listitem"
      aria-label={`Campo ${field.name}, tipo ${field.type}${field.required ? ", obbligatorio" : ""}${isMapped ? ", mappato" : ""}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(field.id);
        }
      }}
    >
      {/* Drag grip */}
      <GripVertical
        className="w-3.5 h-3.5 shrink-0 opacity-30 group-hover:opacity-60 transition-opacity"
        style={{ color: "var(--fg-muted)" }}
      />

      {/* Type icon */}
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: typeColor }} />

      {/* Field name */}
      <span
        className="truncate flex-1 font-medium"
        style={{ color: "var(--fg-primary)" }}
      >
        {field.name}
      </span>

      {/* Required badge */}
      {field.required && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wider shrink-0"
          style={{ color: "var(--accent)" }}
        >
          req
        </span>
      )}

      {/* Confidence badge */}
      {confidence !== undefined && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
          style={{
            background:
              confidence >= 90
                ? "rgba(93, 228, 199, 0.15)"
                : confidence >= 70
                  ? "rgba(255, 252, 194, 0.15)"
                  : "rgba(229, 141, 120, 0.15)",
            color:
              confidence >= 90
                ? "var(--success)"
                : confidence >= 70
                  ? "var(--caution)"
                  : "var(--error)",
          }}
        >
          {confidence < 70 && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
          {confidence}%
        </span>
      )}

      {/* Connection port */}
      <div
        ref={(el) => onPortRef?.(field.id, el)}
        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 transition-colors"
        style={{
          [side === "source" ? "right" : "left"]: "-6px",
          borderColor: isMapped ? "var(--success)" : "var(--border-dark)",
          background: isMapped ? "var(--success)" : "var(--bg-base)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
