"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Tag,
  AlertTriangle,
  Info,
  Lightbulb,
  Quote,
  Shield,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { BlogArticle, ArticleSection } from "../articles";

// ─── Section Renderers ───

function SectionRenderer({ section, index }: { section: ArticleSection; index: number }) {
  const delay = 0.05 + index * 0.03;

  switch (section.type) {
    case "intro":
      return (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay, duration: 0.4 }}
          className="text-lg text-foreground-secondary leading-relaxed mb-8 font-medium"
        >
          {section.content}
        </motion.p>
      );

    case "heading":
      return (
        <motion.h2
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay, duration: 0.4 }}
          className="font-serif text-2xl md:text-3xl text-foreground mt-12 mb-5"
        >
          {section.content}
        </motion.h2>
      );

    case "paragraph":
      return (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay, duration: 0.4 }}
          className="text-base text-foreground-secondary leading-relaxed mb-5"
        >
          {section.content}
        </motion.p>
      );

    case "list":
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay, duration: 0.4 }}
          className="mb-6"
        >
          {section.content && (
            <p className="text-base text-foreground-secondary font-medium mb-3">
              {section.content}
            </p>
          )}
          <ul className="space-y-2.5 pl-1">
            {section.items?.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground-secondary leading-relaxed">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      );

    case "callout": {
      const variants = {
        warning: {
          icon: AlertTriangle,
          bg: "rgba(255, 107, 53, 0.06)",
          border: "rgba(255, 107, 53, 0.2)",
          iconColor: "#FF6B35",
        },
        info: {
          icon: Info,
          bg: "rgba(167, 139, 250, 0.06)",
          border: "rgba(167, 139, 250, 0.2)",
          iconColor: "#A78BFA",
        },
        tip: {
          icon: Lightbulb,
          bg: "rgba(78, 205, 196, 0.06)",
          border: "rgba(78, 205, 196, 0.2)",
          iconColor: "#4ECDC4",
        },
      };
      const v = variants[section.variant || "info"];
      const IconComp = v.icon;
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay, duration: 0.4 }}
          className="rounded-xl p-5 mb-6 flex gap-4"
          style={{ background: v.bg, border: `1px solid ${v.border}` }}
        >
          <IconComp className="w-5 h-5 shrink-0 mt-0.5" style={{ color: v.iconColor }} />
          <p className="text-sm text-foreground-secondary leading-relaxed">{section.content}</p>
        </motion.div>
      );
    }

    case "quote":
      return (
        <motion.blockquote
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay, duration: 0.4 }}
          className="border-l-3 border-accent/40 pl-5 py-2 mb-6 flex gap-3"
        >
          <Quote className="w-5 h-5 text-accent/40 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground-tertiary italic leading-relaxed">
            {section.content}
          </p>
        </motion.blockquote>
      );

    default:
      return null;
  }
}

// ─── Article Detail ───

export default function ArticleDetailClient({ article }: { article: BlogArticle }) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Article Header */}
      <article className="pt-32 pb-24 px-6">
        <div className="max-w-[720px] mx-auto">
          {/* Breadcrumb */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
          >
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Torna al blog
            </Link>
          </motion.div>

          {/* Meta */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.4 }}
            className="flex flex-wrap items-center gap-3 mb-6"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
              <Tag className="w-3 h-3" />
              {article.category}
            </span>
            <span className="text-foreground-tertiary text-xs">|</span>
            <span className="inline-flex items-center gap-1 text-xs text-foreground-tertiary">
              <Clock className="w-3 h-3" />
              {article.readingTime}
            </span>
            <span className="text-foreground-tertiary text-xs">|</span>
            <time dateTime={article.publishedAt} className="text-xs text-foreground-tertiary">
              {new Date(article.publishedAt).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="font-serif text-4xl md:text-5xl text-foreground mb-3 leading-tight"
          >
            {article.title}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="text-xl text-foreground-secondary mb-4"
          >
            {article.subtitle}
          </motion.p>

          {/* Author */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="text-sm text-foreground-tertiary mb-10"
          >
            Di {article.author}
          </motion.p>

          {/* Color divider */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="h-1 rounded-full mb-10 origin-left"
            style={{
              background: `linear-gradient(to right, ${article.coverColor}, ${article.coverColor}44)`,
            }}
          />

          {/* Sections */}
          <div>
            {article.sections.map((section, i) => (
              <SectionRenderer key={i} section={section} index={i} />
            ))}
          </div>

          {/* CTA Box */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-16 rounded-2xl border border-accent/20 p-8 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,107,53,0.06), rgba(255,107,53,0.02))",
            }}
          >
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-5">
              <Shield className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-serif text-2xl text-foreground mb-3">
              Verifica il tuo contratto gratuitamente
            </h3>
            <p className="text-foreground-secondary text-sm leading-relaxed max-w-[440px] mx-auto mb-6">
              Carica il tuo contratto di lavoro su controlla.me: 4 agenti AI lo analizzeranno
              in meno di 60 secondi. Le prime 3 analisi sono gratuite.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-accent to-amber-500 hover:scale-[1.03] transition-transform"
              style={{ boxShadow: "0 8px 24px rgba(255,107,53,0.25)" }}
            >
              Analizza gratis
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          {/* Tags */}
          <div className="mt-10 pt-8 border-t border-border-subtle">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary mb-3">
              Tag
            </p>
            <div className="flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-background-secondary px-3 py-1.5 text-xs text-foreground-tertiary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </article>

      <Footer />
    </div>
  );
}
