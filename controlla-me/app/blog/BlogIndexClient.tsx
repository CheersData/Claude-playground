"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Tag,
  BookOpen,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { articles } from "./articles";

// ─── Article Card ───

function ArticleCard({ article, index }: { article: (typeof articles)[0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/blog/${article.slug}`}
        className="group block rounded-2xl border border-border-subtle bg-surface hover:border-accent/30 transition-all duration-300 overflow-hidden"
      >
        {/* Color strip header */}
        <div
          className="h-2 w-full"
          style={{ background: `linear-gradient(to right, ${article.coverColor}, ${article.coverColor}88)` }}
        />

        <div className="p-6 md:p-8">
          {/* Category + reading time */}
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
              <Tag className="w-3 h-3" />
              {article.category}
            </span>
            <span className="text-foreground-tertiary text-xs">|</span>
            <span className="inline-flex items-center gap-1 text-xs text-foreground-tertiary">
              <Clock className="w-3 h-3" />
              {article.readingTime}
            </span>
          </div>

          {/* Title */}
          <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-2 group-hover:text-accent transition-colors duration-300">
            {article.title}
          </h2>

          {/* Subtitle */}
          <p className="text-foreground-secondary text-base mb-4 leading-relaxed">
            {article.subtitle}
          </p>

          {/* Description */}
          <p className="text-foreground-tertiary text-sm leading-relaxed mb-6 line-clamp-2">
            {article.description}
          </p>

          {/* Footer: author + date + CTA */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-foreground-tertiary">
              <span>{article.author}</span>
              <span className="mx-2">·</span>
              <time dateTime={article.publishedAt}>
                {new Date(article.publishedAt).toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-accent group-hover:gap-2 transition-all">
              Leggi
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-border-subtle">
            {article.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-background-secondary px-3 py-1 text-xs text-foreground-tertiary"
              >
                {tag}
              </span>
            ))}
            {article.tags.length > 4 && (
              <span className="text-xs text-foreground-tertiary py-1">
                +{article.tags.length - 4}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Blog Index ───

export default function BlogIndexClient() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-[800px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Torna alla home
            </Link>

            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-accent" />
              </div>
            </div>

            <h1 className="font-serif text-4xl md:text-5xl text-foreground mb-4">
              Il blog di{" "}
              <span className="italic text-accent">controlla.me</span>
            </h1>
            <p className="text-lg text-foreground-secondary leading-relaxed max-w-[600px] mx-auto">
              Guide pratiche, approfondimenti legali e analisi per capire i tuoi diritti.
              Scritti dalla redazione, verificati dall&apos;intelligenza artificiale.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="px-6 pb-24">
        <div className="max-w-[900px] mx-auto">
          <div className="flex flex-col gap-8">
            {articles.map((article, i) => (
              <ArticleCard key={article.slug} article={article} index={i} />
            ))}
          </div>

          {/* Empty state (for future, when filters are added) */}
          {articles.length === 0 && (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-foreground-tertiary" />
              <p className="text-lg text-foreground-secondary">
                Nessun articolo disponibile al momento.
              </p>
              <p className="text-sm text-foreground-tertiary mt-1">
                Torna presto per nuovi contenuti.
              </p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
