"use client";

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

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${textSize} ${className}`}>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <span className="text-foreground-tertiary/40">/</span>
          )}
          <span className={i === 0 ? "text-foreground-secondary" : "text-foreground-tertiary"}>
            {crumb}
          </span>
        </span>
      ))}
    </div>
  );
}
