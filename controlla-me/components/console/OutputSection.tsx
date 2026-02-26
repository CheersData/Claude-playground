"use client";

import { useState } from "react";

interface OutputSectionProps {
  title: string;
  timing?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function OutputSection({
  title,
  timing,
  defaultOpen = true,
  children,
}: OutputSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="pipboy-panel rounded-md overflow-hidden pipboy-reveal">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-[rgba(51,255,102,0.03)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[var(--pb-green)]">
            {open ? "[-]" : "[+]"}
          </span>
          <span className="font-medium tracking-wide">{title}</span>
        </div>
        {timing != null && (
          <span className="text-[var(--pb-text-dim)] text-[10px]">
            {(timing / 1000).toFixed(1)}s
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 text-sm leading-relaxed border-t border-[var(--pb-border)]">
          <div className="pt-2">{children}</div>
        </div>
      )}
    </div>
  );
}
