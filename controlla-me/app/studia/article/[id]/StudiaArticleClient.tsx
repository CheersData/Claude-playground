"use client";

/**
 * StudiaArticleClient — Dettaglio voce medica studia.me
 *
 * Carica un articolo medico per UUID, mostra testo completo con metadata.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import StudiaNavbar from "@/components/studia/StudiaNavbar";

const ACCENT = "#0EA5E9";

interface MedicalArticle {
  id: string;
  law_source: string;
  article_reference: string;
  article_title: string | null;
  article_text: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  related_institutes: string[];
  source_url: string | null;
  is_in_force: boolean;
}

export default function StudiaArticleClient() {
  const params = useParams();
  const id = params?.id as string;

  const [article, setArticle] = useState<MedicalArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/studia/hierarchy?articleId=${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Voce non trovata");
        return r.json();
      })
      .then((data) => setArticle(data.article))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <StudiaNavbar />

      <main className="max-w-4xl mx-auto px-4 pt-24 pb-16">
        <Link
          href="/studia"
          className="flex items-center gap-2 text-sky-400 hover:text-sky-300 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Torna al Corpus Medico
        </Link>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 mb-2">{error}</p>
            <Link href="/studia" className="text-sky-400 hover:text-sky-300">
              Torna al corpus
            </Link>
          </div>
        ) : article ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 rounded-xl border border-white/10 p-6 md:p-8"
          >
            {/* Source badge */}
            <div
              className="text-sm font-medium mb-3 px-3 py-1 rounded-full inline-block"
              style={{
                backgroundColor: ACCENT + "15",
                color: ACCENT,
              }}
            >
              {article.law_source}
            </div>

            {/* Hierarchy breadcrumb */}
            {article.hierarchy && Object.keys(article.hierarchy).length > 0 && (
              <div className="text-white/40 text-sm mb-2">
                {Object.values(article.hierarchy).join(" › ")}
              </div>
            )}

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-serif mb-1">
              {article.article_reference}
            </h1>
            {article.article_title && (
              <h2 className="text-lg text-white/60 mb-6">
                {article.article_title}
              </h2>
            )}

            {/* Keywords */}
            {article.keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {article.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="px-2 py-1 bg-sky-500/10 text-sky-300 text-xs rounded-full"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}

            {/* Topics */}
            {article.related_institutes.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {article.related_institutes.map((inst) => (
                  <span
                    key={inst}
                    className="px-2 py-1 bg-emerald-500/10 text-emerald-300 text-xs rounded-full"
                  >
                    {inst.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-white/10 my-6" />

            {/* Article text */}
            <div className="text-white/80 leading-relaxed text-[15px] whitespace-pre-wrap">
              {article.article_text}
            </div>

            {/* Source link */}
            {article.source_url && (
              <div className="mt-8 pt-4 border-t border-white/10">
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sky-400 hover:text-sky-300 text-sm transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Consulta fonte originale
                </a>
              </div>
            )}
          </motion.div>
        ) : null}
      </main>
    </div>
  );
}
