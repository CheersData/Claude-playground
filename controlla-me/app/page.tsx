"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, Lock, Zap, Gift } from "lucide-react";
import Navbar from "@/components/Navbar";
import UploadZone from "@/components/UploadZone";
import AnalysisProgress from "@/components/AnalysisProgress";
import ResultsView from "@/components/ResultsView";
import TeamSection from "@/components/TeamSection";
import type { AgentPhase, AdvisorResult } from "@/lib/types";

type AppView = "landing" | "analyzing" | "results";

export default function Home() {
  const [view, setView] = useState<AppView>("landing");
  const [fileName, setFileName] = useState("");
  const [currentPhase, setCurrentPhase] = useState<AgentPhase | null>(null);
  const [completedPhases, setCompletedPhases] = useState<AgentPhase[]>([]);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Keep a ref to the last uploaded file so we can retry
  const lastFileRef = useRef<File | null>(null);

  // Dev shortcut: ?session=ID loads cached results directly
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get("session");
    if (!sid) return;
    fetch(`/api/session/${sid}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.advice) {
          setResult(data.advice);
          setFileName(data.documentTextPreview?.slice(0, 30) + "..." || "cached");
          setSessionId(data.sessionId);
          setView("results");
        }
      })
      .catch(() => {});
  }, []);

  const reset = useCallback(() => {
    setView("landing");
    setFileName("");
    setCurrentPhase(null);
    setCompletedPhases([]);
    setResult(null);
    setError(null);
    setSessionId(null);
    lastFileRef.current = null;
  }, []);

  const startAnalysis = useCallback(
    async (file: File, resumeId?: string) => {
      setFileName(file.name);
      setView("analyzing");
      setCurrentPhase(null);
      setCompletedPhases([]);
      setError(null);
      lastFileRef.current = file;

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (resumeId) {
          formData.append("sessionId", resumeId);
        }

        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Errore nella richiesta di analisi");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Stream non disponibile");

        const decoder = new TextDecoder();
        let buffer = "";

        let eventType = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);

                if (eventType === "progress") {
                  const phase = data.phase as AgentPhase;
                  if (data.status === "running") {
                    setCurrentPhase(phase);
                  } else if (data.status === "done") {
                    setCompletedPhases((prev) =>
                      prev.includes(phase) ? prev : [...prev, phase]
                    );
                  }
                } else if (eventType === "complete") {
                  const advice = data.advice || data;
                  setResult(advice);
                  setView("results");
                } else if (eventType === "session") {
                  setSessionId(data.sessionId);
                } else if (eventType === "error") {
                  setError(
                    data.message || data.error || "Errore sconosciuto"
                  );
                }
              } catch {
                // Ignore JSON parse errors for incomplete chunks
              }
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Errore durante l'analisi"
        );
      }
    },
    []
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      startAnalysis(file);
    },
    [startAnalysis]
  );

  /** Retry using the cached sessionId so completed phases are skipped */
  const handleRetry = useCallback(() => {
    const file = lastFileRef.current;
    if (file) {
      startAnalysis(file, sessionId || undefined);
    } else {
      reset();
    }
  }, [startAnalysis, sessionId, reset]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Navbar />

      {/* Floating orbs */}
      <div
        className="floating-orb"
        style={{ width: 300, height: 300, left: "5%", top: "10%" }}
      />
      <div
        className="floating-orb"
        style={{
          width: 200,
          height: 200,
          left: "75%",
          top: "5%",
          animationDelay: "2s",
          animationDuration: "8s",
        }}
      />
      <div
        className="floating-orb"
        style={{
          width: 250,
          height: 250,
          left: "60%",
          top: "60%",
          animationDelay: "4s",
          animationDuration: "10s",
        }}
      />
      <div
        className="floating-orb"
        style={{
          width: 180,
          height: 180,
          left: "10%",
          top: "70%",
          animationDelay: "1s",
          animationDuration: "7s",
        }}
      />

      {/* ──────────── LANDING ──────────── */}
      {view === "landing" && (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 pt-28 pb-16 text-center relative z-10">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/[0.08] border border-accent/20 mb-8 text-sm text-white/70 font-medium"
          >
            <Shield className="w-4 h-4 text-accent" />
            Il tuo studio legale AI, pronto a lavorare per te
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-[clamp(42px,7vw,80px)] leading-[1.05] max-w-[800px] mb-6"
          >
            Non firmare nulla
            <br />
            <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
              che non capisci.
            </span>
          </motion.h1>

          {/* Subtitle + Motto */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg leading-relaxed text-white/50 max-w-[520px] mb-4"
          >
            Carica un contratto, una bolletta, un documento legale.
            <br />
            L&apos;AI lo analizza, trova norme e sentenze, e ti dice cosa fare.
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="font-serif italic text-white/25 text-base mb-12"
          >
            La legge non ammette ignoranza. Noi non ammettiamo arroganza.
          </motion.p>

          {/* Upload zone */}
          <UploadZone onFileSelected={handleFileSelected} />

          {/* Trust signals */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex gap-8 flex-wrap justify-center mt-10 text-white/30 text-sm"
          >
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> I tuoi documenti non vengono
              salvati
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Risultati in 30 secondi
            </span>
            <span className="flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5" /> 3 analisi gratuite al mese
            </span>
          </motion.div>

          {/* Team section */}
          <TeamSection />
        </div>
      )}

      {/* ──────────── ANALYZING ──────────── */}
      {view === "analyzing" && (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 pt-28 pb-16 relative z-10">
          <AnalysisProgress
            fileName={fileName}
            currentPhase={currentPhase}
            completedPhases={completedPhases}
            error={error || undefined}
            onReset={reset}
            onRetry={handleRetry}
            sessionId={sessionId}
          />
        </div>
      )}

      {/* ──────────── RESULTS ──────────── */}
      {view === "results" && result && (
        <div className="relative z-10">
          <ResultsView
            result={result}
            fileName={fileName}
            onReset={reset}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="text-center py-10 border-t border-white/[0.04] text-white/20 text-sm relative z-10">
        <span className="font-serif italic">controlla.me</span> — Non
        sostituisce un avvocato. Ti aiuta a capire cosa stai firmando.
      </footer>
    </div>
  );
}
