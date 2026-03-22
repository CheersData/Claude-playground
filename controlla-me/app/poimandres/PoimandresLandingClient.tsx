"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Scale,
  Shield,
  Brain,
  FileSearch,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { articles } from "@/app/blog/articles";

// ─── Poimandres Navbar ───

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
            className="text-sm text-foreground-secondary hover:text-foreground transition-colors"
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

        {/* Mobile CTA */}
        <div className="flex md:hidden items-center gap-3">
          <Link
            href="/blog"
            className="text-sm text-foreground-secondary"
          >
            Blog
          </Link>
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

// ─── Feature Card ───

function FeatureCard({
  icon: Icon,
  title,
  description,
  delay,
}: {
  icon: typeof Scale;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-border-subtle bg-surface p-6 hover:border-accent/20 transition-colors duration-300"
    >
      <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-accent" />
      </div>
      <h3 className="font-serif text-lg text-foreground mb-2">{title}</h3>
      <p className="text-sm text-foreground-secondary leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}

// ─── Article Preview ───

function ArticlePreview({
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
        delay: 0.3 + index * 0.1,
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link
        href={`/blog/${article.slug}`}
        className="group block rounded-2xl border border-border-subtle bg-surface hover:border-accent/30 transition-all duration-300 overflow-hidden"
      >
        <div
          className="h-1.5 w-full"
          style={{
            background: `linear-gradient(to right, ${article.coverColor}, ${article.coverColor}88)`,
          }}
        />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              {article.category}
            </span>
            <span className="text-foreground-tertiary text-xs">|</span>
            <span className="text-xs text-foreground-tertiary">
              {article.readingTime}
            </span>
          </div>
          <h3 className="font-serif text-xl text-foreground mb-2 group-hover:text-accent transition-colors">
            {article.title}
          </h3>
          <p className="text-sm text-foreground-secondary leading-relaxed line-clamp-2">
            {article.description}
          </p>
          <div className="flex items-center gap-1 mt-4 text-sm font-medium text-accent group-hover:gap-2 transition-all">
            Leggi l&apos;articolo
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Footer ───

function PoimandresFooter() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="max-w-[1000px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
          {/* Brand */}
          <div>
            <Link href="/" className="inline-flex items-baseline gap-0.5 mb-4">
              <span className="font-serif text-2xl text-foreground italic">
                poimandres
              </span>
              <span className="font-serif text-2xl text-accent">.work</span>
            </Link>
            <p className="text-sm text-foreground-tertiary leading-relaxed">
              Analisi legale AI e legal tech.
              <br />
              Guide, strumenti e approfondimenti.
            </p>
          </div>

          {/* Contenuti */}
          <div>
            <h4 className="text-xs font-bold tracking-[2px] uppercase text-foreground-secondary mb-4">
              Contenuti
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/blog"
                  className="text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors"
                >
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Prodotto */}
          <div>
            <h4 className="text-xs font-bold tracking-[2px] uppercase text-foreground-secondary mb-4">
              Prodotto
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="https://controlla.me"
                  className="text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors inline-flex items-center gap-1"
                >
                  controlla.me
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </li>
              <li>
                <Link
                  href="https://controlla.me/pricing"
                  className="text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors inline-flex items-center gap-1"
                >
                  Prezzi
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </li>
              <li>
                <Link
                  href="https://controlla.me/corpus"
                  className="text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors inline-flex items-center gap-1"
                >
                  Corpus legislativo
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border-subtle flex flex-col md:flex-row items-center justify-between gap-4">
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
      </div>
    </footer>
  );
}

// ─── Main Landing Page ───

export default function PoimandresLandingClient() {
  const latestArticles = articles.slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <PoimandresNavbar />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-[800px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-accent" />
              </div>
            </div>

            <h1
              className="font-serif text-foreground mb-6 leading-tight"
              style={{ fontSize: "clamp(2.5rem, 5vw + 1rem, 4rem)" }}
            >
              Capire il diritto,{" "}
              <span className="italic text-accent">senza legalese</span>
            </h1>

            <p className="text-lg text-foreground-secondary leading-relaxed max-w-[600px] mx-auto mb-10">
              Guide pratiche, approfondimenti e strumenti AI per analizzare
              contratti, conoscere i tuoi diritti e navigare il mondo legale
              italiano con consapevolezza.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-accent to-amber-500 hover:scale-[1.03] transition-transform"
                style={{ boxShadow: "0 8px 24px rgba(255,107,53,0.25)" }}
              >
                <BookOpen className="w-4 h-4" />
                Leggi il blog
              </Link>
              <Link
                href="https://controlla.me"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-medium text-foreground border border-border-subtle hover:border-accent/30 transition-colors"
              >
                Analizza un contratto
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-20">
        <div className="max-w-[1000px] mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="font-serif text-3xl text-foreground mb-3">
              Di cosa parliamo
            </h2>
            <p className="text-foreground-secondary max-w-[500px] mx-auto">
              Contenuti verificati, scritti per essere comprensibili. Niente
              legalese, solo cose utili.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={Scale}
              title="Diritto dei contratti"
              description="Clausole illegali, rischi nascosti, come leggere un contratto prima di firmare."
              delay={0.3}
            />
            <FeatureCard
              icon={Shield}
              title="Tutela consumatori"
              description="Diritto di recesso, garanzie, pratiche commerciali scorrette: i tuoi diritti spiegati."
              delay={0.4}
            />
            <FeatureCard
              icon={FileSearch}
              title="Diritto del lavoro"
              description="Contratti di lavoro, licenziamenti, CCNL, straordinari: cosa dice la legge."
              delay={0.5}
            />
            <FeatureCard
              icon={Brain}
              title="AI e Legal Tech"
              description="Come l'intelligenza artificiale sta cambiando l'analisi legale e l'accesso alla giustizia."
              delay={0.6}
            />
          </div>
        </div>
      </section>

      {/* Latest Articles */}
      {latestArticles.length > 0 && (
        <section className="px-6 pb-24">
          <div className="max-w-[900px] mx-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.5 }}
              className="flex items-center justify-between mb-10"
            >
              <h2 className="font-serif text-3xl text-foreground">
                Ultimi articoli
              </h2>
              <Link
                href="/blog"
                className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-accent hover:gap-2 transition-all"
              >
                Tutti gli articoli
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>

            <div className="flex flex-col gap-6">
              {latestArticles.map((article, i) => (
                <ArticlePreview key={article.slug} article={article} index={i} />
              ))}
            </div>

            <div className="sm:hidden mt-8 text-center">
              <Link
                href="/blog"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent"
              >
                Tutti gli articoli
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="px-6 pb-24">
        <div className="max-w-[800px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="rounded-2xl border border-accent/20 p-10 md:p-14 text-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,107,53,0.06), rgba(255,107,53,0.02))",
            }}
          >
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
              <Shield className="w-7 h-7 text-accent" />
            </div>
            <h2 className="font-serif text-3xl text-foreground mb-4">
              Hai un contratto da controllare?
            </h2>
            <p className="text-foreground-secondary leading-relaxed max-w-[500px] mx-auto mb-8">
              Caricalo su controlla.me: 4 agenti AI specializzati lo
              analizzeranno in meno di 60 secondi. Clausole rischiose, norme
              applicabili, azioni consigliate. Le prime 3 analisi sono
              gratuite.
            </p>
            <Link
              href="https://controlla.me"
              className="inline-flex items-center gap-2 px-10 py-4 rounded-full text-sm font-bold text-white bg-gradient-to-r from-accent to-amber-500 hover:scale-[1.03] transition-transform"
              style={{ boxShadow: "0 8px 24px rgba(255,107,53,0.25)" }}
            >
              Vai a controlla.me
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      <PoimandresFooter />
    </div>
  );
}
