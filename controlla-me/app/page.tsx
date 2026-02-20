"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, Lock, Zap, Gift, Upload, FileText } from "lucide-react";
import Navbar from "@/components/Navbar";
import AnalysisProgress from "@/components/AnalysisProgress";
import ResultsView from "@/components/ResultsView";
import TeamSection, { AgentAvatar, agents } from "@/components/TeamSection";
import type { AgentPhase, AdvisorResult } from "@/lib/types";

type AppView = "landing" | "analyzing" | "results";

const leo = agents[0]; // Leo il Catalogatore

export default function Home() {
  const [view, setView] = useState<AppView>("landing");
  const [fileName, setFileName] = useState("");
  const [currentPhase, setCurrentPhase] = useState<AgentPhase | null>(null);
  const [completedPhases, setCompletedPhases] = useState<AgentPhase[]>([]);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const lastFileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    (file: File) => {
      startAnalysis(file);
    },
    [startAnalysis]
  );

  const handleRetry = useCallback(() => {
    const file = lastFileRef.current;
    if (file) {
      startAnalysis(file, sessionId || undefined);
    } else {
      reset();
    }
  }, [startAnalysis, sessionId, reset]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelected(file);
    },
    [handleFileSelected]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelected(file);
    },
    [handleFileSelected]
  );

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
        <>
          {/* HERO: Studio presentation */}
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

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg leading-relaxed text-white/50 max-w-[540px] mb-4"
            >
              Quattro consulenti AI analizzano il tuo documento in profondità.
              <br />
              Norme, sentenze, clausole rischiose — tutto in 30 secondi.
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="font-serif italic text-white/25 text-base mb-12"
            >
              La legge non ammette ignoranza. Noi non ammettiamo arroganza.
            </motion.p>

            {/* Scroll hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col items-center gap-2 text-white/20"
            >
              <span className="text-xs tracking-[2px] uppercase">Scopri il team</span>
              <motion.div
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.div>
            </motion.div>
          </div>

          {/* TEAM SHOWCASE */}
          <div className="flex flex-col items-center px-6 pb-24 text-center relative z-10">
            <TeamSection />
          </div>

          {/* LEO'S UPLOAD SECTION */}
          <div className="relative z-10 px-6 pb-32">
            <div className="max-w-[700px] mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6 }}
                className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-10"
              >
                {/* Teal gradient accent */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse at 20% 20%, ${leo.color}08, transparent 60%)`,
                  }}
                />
                <div
                  className="absolute left-0 top-0 bottom-0 w-[3px]"
                  style={{
                    background: `linear-gradient(to bottom, ${leo.color}80, ${leo.color}20, transparent)`,
                  }}
                />

                <div className="relative">
                  {/* Leo's intro */}
                  <div className="flex items-start gap-5 mb-6">
                    <div className="shrink-0">
                      <AgentAvatar
                        variant="catalogatore"
                        color={leo.color}
                        size="xl"
                      />
                    </div>
                    <div className="flex-1 pt-2">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold">{leo.name}</h3>
                        <span
                          className="text-[10px] font-bold tracking-[2px] uppercase px-3 py-1 rounded-full"
                          style={{
                            color: leo.color,
                            background: `${leo.color}15`,
                            border: `1px solid ${leo.color}25`,
                          }}
                        >
                          {leo.role}
                        </span>
                      </div>

                      {/* Speech bubble */}
                      <div className="relative bg-white/[0.05] border border-white/[0.08] rounded-2xl rounded-tl-sm p-4 mb-2">
                        <p className="text-base text-white/70 leading-relaxed">
                          Piacere, sono <strong style={{ color: leo.color }}>Leo</strong>.
                          Passami il documento e ci pensiamo noi quattro.
                          <br />
                          <span className="text-white/40 text-sm">
                            Lo leggo, lo catalogo, e passo tutto ai colleghi.
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Upload zone - integrated with Leo */}
                  <div
                    className={`rounded-2xl border-2 border-dashed transition-all cursor-pointer mt-2
                      ${
                        dragOver
                          ? "border-[#4ECDC4]/80 bg-[#4ECDC4]/5 scale-[1.01]"
                          : "border-[#4ECDC4]/30 bg-white/[0.02] hover:border-[#4ECDC4]/60 hover:bg-[#4ECDC4]/[0.03]"
                      }
                    `}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    <div className="flex flex-col items-center gap-4 px-8 py-10">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: `${leo.color}15` }}
                      >
                        {dragOver ? (
                          <FileText className="w-6 h-6" style={{ color: leo.color }} />
                        ) : (
                          <Upload className="w-6 h-6" style={{ color: leo.color }} />
                        )}
                      </div>

                      <div className="text-center">
                        <p className="text-base font-semibold mb-1">
                          Trascina qui il tuo documento
                        </p>
                        <p className="text-sm text-white/35">
                          PDF, immagine, Word o testo — max 20MB
                        </p>
                      </div>

                      <button
                        className="mt-1 px-10 py-4 rounded-full text-base font-bold text-white hover:-translate-y-0.5 transition-all"
                        style={{
                          background: `linear-gradient(135deg, ${leo.color}, ${leo.color}CC)`,
                          boxShadow: `0 12px 40px ${leo.color}30`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                      >
                        Scegli file
                      </button>
                    </div>
                  </div>

                  {/* Trust signals */}
                  <div className="flex gap-6 flex-wrap justify-center mt-6 text-white/30 text-xs">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> I documenti non vengono salvati
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3 h-3" /> Risultati in 30 secondi
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Gift className="w-3 h-3" /> 3 analisi gratuite al mese
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </>
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
