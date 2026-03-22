"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Tag,
  BookOpen,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { articles } from "@/app/blog/articles";

// ─── Poimandres Navbar (Blog) ───

function PoimandresNavbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border-subtle">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="inline-flex items-baseline gap-0.5">
          <span className="font-serif text-xl text-foreground italic">
            poimandres
          </span>
          <span className="font-serif text-xl text-accent">.work</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link
            href="/blog"
            className="text-sm text-foreground font-medium"
          >
            Blog
          </Link>
          <Link
            href="https://controlla.me"
            className="text-sm text-foreground-secondary hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            controlla.me
            <ExternalLink className="w-3 h-3" />
          </Link>
          <Link
            href="https://controlla.me"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold text-white bg-gradient-to-r from-accent to-amber-500 hover:scale-[1.03] transition-transform"
            style={{ boxShadow: "0 4px 16px rgba(255,107,53,0.2)" }}
          >
            Analizza un contratto
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="flex md:hidden items-center gap-3">
          <Link
            href="https://controlla.me"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white bg-accent"
          >
            Analizza
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Article Card ───

function ArticleCard({
  article,
  index,
}: {
  article: (typeof articles)[0];
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.1 + index * 0.08,
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link
        href={`/blog/${article.slug}`}
        className="group block rounded-2xl border border-border-subtle bg-surface hover:border-accent/30 transition-all duration-300 overflow-hidden"
      >
        <div
          className="h-2 w-full"
          style={{
            background: `linear-gradient(to right, ${article.coverColor}, ${article.coverColor}88)`,
          }}
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

          {/* Footer */}
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

export default function PoimandresBlogIndexClient() {
  return (
    <div className="min-h-screen bg-background">
      <PoimandresNavbar />

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
              <span className="italic text-accent">poimandres</span>
            </h1>
            <p className="text-lg text-foreground-secondary leading-relaxed max-w-[600px] mx-auto">
              Guide pratiche, approfondimenti legali e analisi per capire i
              tuoi diritti. Scritti dalla redazione, verificati
              dall&apos;intelligenza artificiale.
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

      {/* CTA */}
      <section className="px-6 pb-24">
        <div className="max-w-[700px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="rounded-2xl border border-accent/20 p-8 text-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,107,53,0.06), rgba(255,107,53,0.02))",
            }}
          >
            <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-5">
              <Sparkles className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-serif text-2xl text-foreground mb-3">
              Vuoi verificare il tuo contratto?
            </h3>
            <p className="text-foreground-secondary text-sm leading-relaxed max-w-[440px] mx-auto mb-6">
              Carica il tuo documento su controlla.me. 4 agenti AI lo
              analizzeranno in meno di 60 secondi. Gratis per le prime 3
              analisi.
            </p>
            <Link
              href="https://controlla.me"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-accent to-amber-500 hover:scale-[1.03] transition-transform"
              style={{ boxShadow: "0 8px 24px rgba(255,107,53,0.25)" }}
            >
              Analizza gratis
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Simple footer */}
      <footer className="border-t border-border-subtle">
        <div className="max-w-[1000px] mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-baseline gap-0.5">
            <span className="font-serif text-lg text-foreground italic">
              poimandres
            </span>
            <span className="font-serif text-lg text-accent">.work</span>
          </Link>
          <p className="text-xs text-foreground-tertiary">
            {new Date().getFullYear()} poimandres.work — Un progetto di{" "}
            <Link
              href="https://controlla.me"
              className="text-accent hover:underline"
            >
              controlla.me
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
