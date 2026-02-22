"use client";

import { ChevronRight } from "lucide-react";

interface LegalBreadcrumbProps {
  hierarchy: Record<string, string>;
  sourceName?: string;
  size?: "sm" | "md";
  className?: string;
}

const LEVEL_ORDER = ["book", "part", "title", "chapter", "section"];

export default function LegalBreadcrumb({
  hierarchy,
  sourceName,
  size = "md",
  className = "",
}: LegalBreadcrumbProps) {
  const crumbs: string[] = [];

  if (sourceName) crumbs.push(sourceName);

  for (const level of LEVEL_ORDER) {
    if (hierarchy[level]) {
      crumbs.push(hierarchy[level]);
    }
  }

  if (crumbs.length === 0) return null;

  const textSize = size === "sm" ? "text-[11px]" : "text-xs";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const gap = size === "sm" ? "gap-1" : "gap-1.5";

  return (
    <div className={`flex flex-wrap items-center ${gap} ${textSize} text-foreground-tertiary ${className}`}>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className={`${iconSize} opacity-40`} />}
          <span className={i === 0 ? "font-medium text-[#A78BFA]" : ""}>
            {crumb}
          </span>
        </span>
      ))}
    </div>
  );
}
