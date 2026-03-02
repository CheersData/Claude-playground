"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import AnimatedCount from "./AnimatedCount";
import DensityBar from "./DensityBar";

interface InstituteInfo {
  name: string;
  label: string;
  count: number;
}

interface InstituteArticle {
  id: string;
  article_number: string;
  article_title: string | null;
  source_name: string;
  hierarchy: Record<string, string>;
}

interface InstituteGridProps {
  institutes: InstituteInfo[];
  loading: boolean;
  selectedInstitute: string | null;
  instituteArticles: InstituteArticle[];
  loadingArticles: boolean;
  onInstituteClick: (name: string) => void;
  onArticleClick: (id: string) => void;
  onBack: () => void;
}

export default function InstituteGrid({
  institutes,
  loading,
  selectedInstitute,
  instituteArticles,
  loadingArticles,
  onInstituteClick,
  onArticleClick,
  onBack,
}: InstituteGridProps) {
  const maxCount = Math.max(...institutes.map((i) => i.count), 1);

  // ─── Institute detail: article list ───
  if (selectedInstitute) {
    const inst = institutes.find((i) => i.name === selectedInstitute);
    const label = inst?.label || selectedInstitute.replace(/_/g, " ");

    return (
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-foreground-tertiary hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Istituti
        </button>

        <h2 className="font-serif text-3xl mb-1">
          {label.replace(/^./, (c) => c.toUpperCase())}
        </h2>
        {!loadingArticles && (
          <p className="text-sm text-foreground-tertiary mb-6">
            {instituteArticles.length} {instituteArticles.length === 1 ? "articolo" : "articoli"}
          </p>
        )}
        <div className="border-t border-border mb-6" />

        {loadingArticles ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-foreground-tertiary animate-spin" />
          </div>
        ) : (
          <div>
            {instituteArticles.map((art, i) => (
              <motion.button
                key={art.id}
                onClick={() => onArticleClick(art.id)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className="w-full text-left py-3 border-b border-border-subtle hover:bg-surface-hover transition-colors -mx-2 px-2 rounded-lg"
              >
                <span className="font-medium text-sm">
                  Art. {art.article_number}
                </span>
                {art.article_title && (
                  <span className="text-foreground-secondary text-sm ml-1.5">
                    &mdash; {art.article_title}
                  </span>
                )}
                <p className="text-xs text-foreground-tertiary mt-0.5">
                  {art.source_name}
                </p>
              </motion.button>
            ))}
            {instituteArticles.length === 0 && (
              <p className="text-center text-foreground-tertiary py-8">
                Nessun articolo per questo istituto
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Institute grid ───

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-foreground-tertiary animate-spin" />
      </div>
    );
  }

  if (institutes.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-foreground-tertiary">
          Gli istituti giuridici vengono popolati tramite il tagging degli articoli.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-border">
        <h2 className="text-lg font-semibold">Istituti Giuridici</h2>
        <span className="text-sm text-foreground-tertiary tabular-nums">
          <AnimatedCount value={institutes.length} className="font-medium text-foreground-secondary" /> istituti
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
        {institutes.map((inst, i) => (
          <motion.button
            key={inst.name}
            onClick={() => onInstituteClick(inst.name)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.02 }}
            className="text-left py-3 border-b border-border-subtle group hover:bg-surface-hover transition-colors -mx-2 px-2 rounded-lg"
          >
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-medium group-hover:text-[#A78BFA] transition-colors truncate mr-3">
                {inst.label}
              </span>
              <span className="text-xs text-foreground-tertiary tabular-nums shrink-0">
                {inst.count}
              </span>
            </div>
            <DensityBar
              value={inst.count}
              max={maxCount}
              delay={0.2 + i * 0.02}
            />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
