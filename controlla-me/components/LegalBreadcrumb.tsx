"use client";

import { ChevronRight, Home } from "lucide-react";

interface LegalBreadcrumbProps {
  source: string | null;
  article: { ref: string; title: string | null } | null;
  onHomeClick: () => void;
  onSourceClick: () => void;
}

export default function LegalBreadcrumb({
  source,
  article,
  onHomeClick,
  onSourceClick,
}: LegalBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-6 overflow-x-auto">
      <button
        onClick={onHomeClick}
        className="flex items-center gap-1 text-foreground-tertiary hover:text-foreground transition-colors shrink-0"
      >
        <Home className="w-3.5 h-3.5" />
        <span>Corpus</span>
      </button>

      {source && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />
          <button
            onClick={onSourceClick}
            className={`truncate max-w-[200px] transition-colors ${
              article
                ? "text-foreground-tertiary hover:text-foreground"
                : "text-foreground font-medium"
            }`}
          >
            {source}
          </button>
        </>
      )}

      {article && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />
          <span className="text-foreground font-medium truncate max-w-[300px]">
            {article.ref}
            {article.title && ` — ${article.title}`}
          </span>
        </>
      )}
    </nav>
  );
}
