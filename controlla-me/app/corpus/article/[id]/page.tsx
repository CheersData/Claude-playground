"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ArticleReader from "@/components/corpus/ArticleReader";

export default function ArticlePage() {
  const params = useParams();
  const id = params.id as string;
  const [article, setArticle] = useState<Parameters<typeof ArticleReader>[0]["article"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/corpus/article?id=${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Articolo non trovato");
        return r.json();
      })
      .then((data) => { setArticle(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [id]);

  return (
    <div className="min-h-screen bg-background">
      <div className="noise-overlay" />
      <Navbar />

      <main className="relative z-10 pt-24 pb-16 px-4 md:px-8">
        <div className="max-w-[680px] mx-auto">
          <Link
            href="/corpus"
            className="inline-flex items-center gap-2 text-sm text-foreground-tertiary hover:text-foreground mb-10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Corpus
          </Link>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-foreground-tertiary animate-spin" />
            </div>
          )}

          {error && (
            <div className="text-center py-20">
              <p className="text-foreground-secondary">{error}</p>
            </div>
          )}

          {article && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ArticleReader article={article} />
            </motion.div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
