"use client";

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ResultsView from "@/components/ResultsView";
import type { Analysis } from "@/lib/types";

interface AnalysisPageClientProps {
  analysis: Analysis;
}

export default function AnalysisPageClient({
  analysis,
}: AnalysisPageClientProps) {
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

      {analysis.advice ? (
        <ResultsView
          result={analysis.advice}
          fileName={analysis.file_name}
          analysisId={analysis.id}
          onReset={() => (window.location.href = "/")}
        />
      ) : (
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
