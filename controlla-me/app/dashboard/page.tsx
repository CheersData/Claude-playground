"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FileText, Clock, ArrowRight, Plus } from "lucide-react";
import Navbar from "@/components/Navbar";

// Placeholder data for demo — in production, this comes from Supabase
const MOCK_ANALYSES = [
  {
    id: "1",
    file_name: "contratto_locazione_milano.pdf",
    document_type: "Contratto di Locazione",
    status: "completed",
    fairness_score: 6.2,
    created_at: "2026-02-18T10:30:00Z",
  },
  {
    id: "2",
    file_name: "polizza_auto_2026.pdf",
    document_type: "Polizza Assicurativa",
    status: "completed",
    fairness_score: 7.8,
    created_at: "2026-02-15T14:20:00Z",
  },
  {
    id: "3",
    file_name: "nda_startup.docx",
    document_type: "NDA",
    status: "completed",
    fairness_score: 4.5,
    created_at: "2026-02-10T09:15:00Z",
  },
];

function ScoreDot({ score }: { score: number }) {
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

export default function Dashboard() {
  const [analyses] = useState(MOCK_ANALYSES);

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
            <p className="text-sm text-white/40">
              {analyses.length} analisi effettuate
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

        <div className="flex flex-col gap-3">
          {analyses.map((analysis, i) => (
            <motion.div
              key={analysis.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Link
                href={`/analysis/${analysis.id}`}
                className="group flex items-center gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-accent" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {analysis.file_name}
                  </p>
                  <p className="text-xs text-white/40 flex items-center gap-2 mt-1">
                    <span>{analysis.document_type}</span>
                    <span className="text-white/20">&#x2022;</span>
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(analysis.created_at).toLocaleDateString("it-IT")}
                    </span>
                  </p>
                </div>

                <ScoreDot score={analysis.fairness_score} />

                <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
              </Link>
            </motion.div>
          ))}
        </div>

        {analyses.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <FileText className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/40 mb-6">
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
    </div>
  );
}
