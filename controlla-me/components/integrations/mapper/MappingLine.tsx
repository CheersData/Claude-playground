"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

interface MappingLineProps {
  /** Source port position { x, y } relative to SVG container */
  from: { x: number; y: number };
  /** Target port position { x, y } relative to SVG container */
  to: { x: number; y: number };
  /** 0-100 */
  confidence?: number;
  isHighlighted?: boolean;
  isPreview?: boolean;
  onClick?: () => void;
}

function confidenceColor(c?: number): string {
  if (c === undefined) return "var(--fg-muted)";
  if (c >= 90) return "var(--success)";
  if (c >= 70) return "var(--caution)";
  return "var(--error)";
}

export default function MappingLine({
  from,
  to,
  confidence,
  isHighlighted,
  isPreview,
  onClick,
}: MappingLineProps) {
  const path = useMemo(() => {
    const dx = Math.abs(to.x - from.x);
    const cpOffset = Math.max(dx * 0.4, 40);
    return `M ${from.x} ${from.y} C ${from.x + cpOffset} ${from.y}, ${to.x - cpOffset} ${to.y}, ${to.x} ${to.y}`;
  }, [from, to]);

  const color = isHighlighted ? "var(--accent)" : confidenceColor(confidence);
  const opacity = isPreview ? 0.4 : isHighlighted ? 1 : 0.7;
  const strokeWidth = isHighlighted ? 2.5 : 2;

  return (
    <g onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      {/* Hit area (invisible wider path for easier clicking) */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        aria-hidden="true"
      />
      {/* Visible line */}
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={isPreview ? "6 4" : "none"}
        opacity={opacity}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* Confidence label at midpoint */}
      {confidence !== undefined && !isPreview && (
        <motion.g
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.2 }}
        >
          <rect
            x={(from.x + to.x) / 2 - 14}
            y={(from.y + to.y) / 2 - 9}
            width={28}
            height={18}
            rx={9}
            fill="var(--bg-overlay)"
            stroke={color}
            strokeWidth={1}
          />
          <text
            x={(from.x + to.x) / 2}
            y={(from.y + to.y) / 2 + 4}
            textAnchor="middle"
            fill={color}
            fontSize={9}
            fontWeight={600}
            fontFamily="var(--font-sans)"
          >
            {confidence}%
          </text>
        </motion.g>
      )}
    </g>
  );
}
