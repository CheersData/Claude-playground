"use client";

import { motion } from "framer-motion";
import AnimatedCount from "./AnimatedCount";
import DensityBar from "./DensityBar";

interface SourceInfo {
  source_id: string;
  source_name: string;
  source_type: string;
  article_count: number;
}

interface SourcesGridProps {
  sources: SourceInfo[];
  onSourceClick: (sourceId: string) => void;
}

export default function SourcesGrid({
  sources,
  onSourceClick,
}: SourcesGridProps) {
  const italianSources = sources.filter((s) => s.source_type === "normattiva");
  const euSources = sources.filter((s) => s.source_type === "eurlex");
  const maxCount = Math.max(...sources.map((s) => s.article_count), 1);

  return (
    <div className="space-y-12">
      {italianSources.length > 0 && (
        <SourceGroup
          label="IT"
          title="Fonti Italiane"
          sources={italianSources}
          maxCount={maxCount}
          onSourceClick={onSourceClick}
          baseDelay={0}
        />
      )}
      {euSources.length > 0 && (
        <SourceGroup
          label="EU"
          title="Fonti Europee"
          sources={euSources}
          maxCount={maxCount}
          onSourceClick={onSourceClick}
          baseDelay={italianSources.length * 0.05}
        />
      )}
      {sources.length === 0 && (
        <div className="text-center py-16">
          <p className="text-foreground-tertiary">Nessuna fonte caricata</p>
          <pre className="mt-4 text-sm text-foreground-tertiary">
            npx tsx scripts/seed-corpus.ts all
          </pre>
        </div>
      )}
    </div>
  );
}

function SourceGroup({
  label,
  title,
  sources,
  maxCount,
  onSourceClick,
  baseDelay,
}: {
  label: string;
  title: string;
  sources: SourceInfo[];
  maxCount: number;
  onSourceClick: (sourceId: string) => void;
  baseDelay: number;
}) {
  const totalArticles = sources.reduce((sum, s) => sum + s.article_count, 0);

  return (
    <div>
      {/* Group header */}
      <div className="flex items-baseline justify-between mb-1 pb-4 border-b border-border">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] tracking-[2px] uppercase text-foreground-tertiary font-medium">
            {label}
          </span>
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <span className="text-sm text-foreground-tertiary tabular-nums">
          {sources.length} fonti &middot;{" "}
          <AnimatedCount value={totalArticles} className="font-medium text-foreground-secondary" /> articoli
        </span>
      </div>

      {/* Source rows */}
      <div>
        {sources.map((source, i) => (
          <motion.button
            key={source.source_id}
            onClick={() => onSourceClick(source.source_id)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: baseDelay + i * 0.05 }}
            className="w-full text-left py-5 border-b border-border-subtle group hover:bg-surface-hover transition-colors -mx-3 px-3 rounded-lg"
          >
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-medium group-hover:text-[#A78BFA] transition-colors">
                {source.source_name}
              </span>
              <span className="text-sm text-foreground-tertiary tabular-nums ml-4 shrink-0">
                <AnimatedCount
                  value={source.article_count}
                  duration={1000}
                  suffix=" articoli"
                />
              </span>
            </div>
            <DensityBar
              value={source.article_count}
              max={maxCount}
              delay={0.3 + baseDelay + i * 0.05}
            />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
