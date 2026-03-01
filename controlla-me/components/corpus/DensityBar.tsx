"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface DensityBarProps {
  value: number;
  max: number;
  delay?: number;
  color?: string;
}

export default function DensityBar({
  value,
  max,
  delay = 0.3,
  color = "bg-[#A78BFA]/30",
}: DensityBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30px" });
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;

  return (
    <div ref={ref} className="h-[3px] bg-border-subtle rounded-full w-full">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={isInView ? { width: `${pct}%` } : { width: 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay }}
      />
    </div>
  );
}
