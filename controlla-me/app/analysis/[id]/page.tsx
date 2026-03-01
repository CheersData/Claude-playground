"use client";

import { use, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import Navbar from "@/components/Navbar";
import ResultsView from "@/components/ResultsView";
import type { Analysis } from "@/lib/types";

export default function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAnalysis() {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error: queryError } = await supabase
          .from("analyses")
          .select(
            "id, user_id, file_name, document_type, status, classification, analysis, investigation, advice, fairness_score, summary, created_at, completed_at"
          )
          .eq("id", id)
          .single();

        if (queryError || !data) {
          setError("Analisi non trovata o accesso non autorizzato.");
          return;
        }

        setAnalysis(data as Analysis);
      } catch {
        setError("Errore nel caricamento dell'analisi.");
      } finally {
        setLoading(false);
      }
    }

    loadAnalysis();
  }, [id]);

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-[720px] mx-auto px-6 pt-24 pb-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Torna alla dashboard
          </Link>
        </motion.div>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-32">
          <Loader2 className="w-8 h-8 text-foreground-tertiary animate-spin" />
        </div>
      )}

      {error && (
        <div className="max-w-[720px] mx-auto px-6 py-16 text-center">
          <AlertCircle className="w-10 h-10 text-foreground-tertiary mx-auto mb-4" />
          <p className="text-foreground-secondary mb-6">{error}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold text-white bg-gradient-to-br from-accent to-[#E8451A]"
          >
            Torna alla dashboard
          </Link>
        </div>
      )}

      {!loading && !error && analysis?.advice && (
        <ResultsView
          result={analysis.advice}
          fileName={analysis.file_name}
          analysisId={id}
          onReset={() => (window.location.href = "/")}
        />
      )}

      {!loading && !error && analysis && !analysis.advice && (
        <div className="max-w-[720px] mx-auto px-6 py-16 text-center">
          <p className="text-foreground-secondary">
            {analysis.status === "processing"
              ? "L'analisi è ancora in corso. Ricarica tra qualche minuto."
              : "L'analisi non ha prodotto risultati."}
          </p>
        </div>
      )}
    </div>
  );
}
