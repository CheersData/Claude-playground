"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Loader2 } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LegalBreadcrumb from "@/components/LegalBreadcrumb";

interface ArticleDetail {
  id: string;
  source_id: string;
  source_name: string;
  article_number: string;
  article_title: string | null;
  article_text: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  url: string | null;
}

export default function ArticlePage() {
  const params = useParams();
  const id = params.id as string;
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/corpus/article?id=${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Articolo non trovato");
        return r.json();
      })
      .then((data) => {
        setArticle(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  return (
    <div className="min-h-screen bg-background">
      <div className="noise-overlay" />
      <Navbar />

      <main className="relative z-10 pt-24 pb-16 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Back link */}
          <Link
            href="/corpus"
            className="inline-flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Torna al corpus
          </Link>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-[#A78BFA] animate-spin" />
            </div>
          )}

          {error && (
            <div className="text-center py-20">
              <BookOpen className="w-16 h-16 text-foreground-tertiary mx-auto mb-4 opacity-30" />
              <h2 className="text-xl font-semibold mb-2">Articolo non trovato</h2>
              <p className="text-foreground-secondary">{error}</p>
            </div>
          )}

          {article && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="bg-white border border-border rounded-2xl p-6 md:p-8">
                <div className="mb-6">
                  <LegalBreadcrumb
                    hierarchy={article.hierarchy}
                    sourceName={article.source_name}
                  />
                  <h1 className="text-2xl font-serif font-bold mt-3">
                    Articolo {article.article_number}
                  </h1>
                  {article.article_title && (
                    <p className="text-lg text-foreground-secondary mt-1">
                      {article.article_title}
                    </p>
                  )}
                </div>

                {article.keywords && article.keywords.length > 0 && (
                  <div className="mb-6 flex flex-wrap gap-2">
                    {article.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="px-2.5 py-1 text-xs rounded-lg bg-[#A78BFA]/8 text-[#A78BFA] border border-[#A78BFA]/15"
                      >
                        {kw.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}

                <div className="bg-background-secondary/50 rounded-xl border border-border/50 p-5 md:p-6">
                  <p className="text-[11px] font-bold tracking-[2px] uppercase text-foreground-tertiary mb-3">
                    Testo completo
                  </p>
                  <div className="space-y-3">
                    {article.article_text.split("\n").map((paragraph, i) =>
                      paragraph.trim() ? (
                        <p
                          key={i}
                          className="text-[15px] leading-[1.8] text-foreground-secondary"
                        >
                          {paragraph}
                        </p>
                      ) : null
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-foreground-tertiary">
                    Fonte: {article.source_name} — Art. {article.article_number}
                  </span>
                  {article.url && (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#A78BFA] hover:underline"
                    >
                      Fonte ufficiale
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
