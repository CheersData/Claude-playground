"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FileText, Clock, ArrowRight, Plus, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { createBrowserClient } from "@supabase/ssr";

interface AnalysisRow {
  id: string;
  file_name: string;
  document_type: string | null;
  status: string;
  fairness_score: number | null;
  created_at: string;
}

function ScoreDot({ score }: { score: number | null }) {
  if (score === null) return null;
  const color = score >= 7 ? "#2ECC40" : score >= 5 ? "#FF851B" : "#FF4136";
  return (
    <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color }}>
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {score}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    completed: { label: "Completata", color: "#2ECC40" },
    processing: { label: "In corso...", color: "#FF851B" },
    error: { label: "Errore", color: "#FF4136" },
    pending: { label: "In attesa", color: "#999" },
  };
  const { label, color } = config[status] ?? config.pending;
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color, backgroundColor: `${color}15` }}>
      {label}
    </span>
  );
}

export default function Dashboard() {
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalyses() {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data, error } = await supabase
          .from("analyses")
          .select("id, file_name, document_type, status, fairness_score, created_at")
          .order("created_at", { ascending: false })
          .limit(50);

        if (!error && data) {
          setAnalyses(data as AnalysisRow[]);
        }
      } catch {
        // Fail silently — empty state is fine
      } finally {
        setLoading(false);
      }
    }

    loadAnalyses();
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-[720px] mx-auto px-6 pt-28 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center mb-8"
        >
          <div>
            <h1 className="font-serif text-3xl mb-1">I tuoi documenti</h1>
            <p className="text-sm text-foreground-secondary">
              {loading ? "Caricamento..." : `${analyses.length} analisi effettuate`}
            </p>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white bg-gradient-to-br from-accent to-[#E8451A] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(255,107,53,0.35)] transition-all"
          >
            <Plus className="w-4 h-4" />
            Nuova analisi
          </Link>
        </motion.div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-foreground-tertiary animate-spin" />
          </div>
        )}

        {!loading && analyses.length > 0 && (
          <div className="flex flex-col gap-3">
            {analyses.map((analysis, i) => (
              <motion.div
                key={analysis.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/analysis/${analysis.id}`}
                  className="group flex items-center gap-4 p-5 rounded-2xl bg-white shadow-sm border border-border hover:bg-surface-hover hover:border-border transition-all"
                >
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-accent" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {analysis.file_name}
                    </p>
                    <p className="text-xs text-foreground-tertiary flex items-center gap-2 mt-1">
                      <span>{analysis.document_type ?? "Documento"}</span>
                      <span className="text-foreground-tertiary">&#x2022;</span>
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(analysis.created_at).toLocaleDateString("it-IT")}
                      </span>
                      {analysis.status !== "completed" && (
                        <>
                          <span className="text-foreground-tertiary">&#x2022;</span>
                          <StatusBadge status={analysis.status} />
                        </>
                      )}
                    </p>
                  </div>

                  <ScoreDot score={analysis.fairness_score} />

                  <ArrowRight className="w-4 h-4 text-foreground-tertiary group-hover:text-foreground-secondary transition-colors" />
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && analyses.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <FileText className="w-12 h-12 text-foreground-tertiary mx-auto mb-4" />
            <p className="text-foreground-secondary mb-6">
              Non hai ancora analizzato nessun documento
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold text-white bg-gradient-to-br from-accent to-[#E8451A]"
            >
              <Plus className="w-4 h-4" />
              Inizia ora
            </Link>
          </motion.div>
        )}
      </div>

      <Footer />
    </div>
  );
}
