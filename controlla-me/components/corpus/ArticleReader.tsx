"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import LegalBreadcrumb from "@/components/LegalBreadcrumb";

interface ArticleData {
  id: string;
  source_id: string;
  source_name: string;
  article_number: string;
  article_title: string | null;
  article_text: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  related_institutes: string[];
  url: string | null;
}

interface ArticleReaderProps {
  article: ArticleData;
  onInstituteClick?: (institute: string) => void;
}

export default function ArticleReader({
  article,
  onInstituteClick,
}: ArticleReaderProps) {
  const paragraphs = article.article_text
    .split("\n")
    .filter((p) => p.trim().length > 0);

  return (
    <div className="max-w-[680px] mx-auto">
      {/* Breadcrumb */}
      <LegalBreadcrumb
        hierarchy={article.hierarchy}
        sourceName={article.source_name}
        size="sm"
        className="mb-8"
      />

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="font-serif text-4xl md:text-5xl tracking-tight"
      >
        Articolo {article.article_number}
      </motion.h1>

      {article.article_title && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="text-xl text-foreground-secondary font-light mt-3"
        >
          {article.article_title}
        </motion.p>
      )}

      {/* Pills: keywords + institutes */}
      {((article.keywords?.length > 0) || (article.related_institutes?.length > 0)) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex flex-wrap gap-1.5 mt-5"
        >
          {article.keywords?.map((kw) => (
            <span
              key={kw}
              className="px-2.5 py-1 text-[11px] rounded-md bg-background-secondary text-foreground-tertiary"
            >
              {kw.replace(/_/g, " ")}
            </span>
          ))}
          {article.related_institutes?.map((inst) =>
            onInstituteClick ? (
              <button
                key={inst}
                onClick={() => onInstituteClick(inst)}
                className="px-2.5 py-1 text-[11px] rounded-md bg-[#A78BFA]/5 text-[#A78BFA]/70 hover:bg-[#A78BFA]/10 transition-colors"
              >
                {inst.replace(/_/g, " ")}
              </button>
            ) : (
              <Link
                key={inst}
                href={`/corpus?tab=istituti&institute=${encodeURIComponent(inst)}`}
                className="px-2.5 py-1 text-[11px] rounded-md bg-[#A78BFA]/5 text-[#A78BFA]/70 hover:bg-[#A78BFA]/10 transition-colors"
              >
                {inst.replace(/_/g, " ")}
              </Link>
            )
          )}
        </motion.div>
      )}

      {/* Divider */}
      <div className="border-t border-border mt-8 mb-10" />

      {/* Article text */}
      <div className="space-y-4">
        {paragraphs.map((paragraph, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.3,
              delay: Math.min(i * 0.05, 0.5),
            }}
            className="font-serif text-[18px] md:text-[19px] leading-[2] text-foreground/90"
          >
            {paragraph}
          </motion.p>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border mt-12 pt-6 flex items-center justify-between">
        <span className="text-xs text-foreground-tertiary">
          {article.source_name}
        </span>
        {article.url && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-foreground-tertiary hover:text-foreground transition-colors"
          >
            Fonte ufficiale &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
