"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Zap, Gift, Upload, FileText } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import MissionSection from "@/components/MissionSection";
import TeamSection from "@/components/TeamSection";
import UseCasesSection from "@/components/UseCasesSection";
import VideoShowcase from "@/components/VideoShowcase";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";
import AnalysisProgress from "@/components/AnalysisProgress";
import ResultsView from "@/components/ResultsView";
import PaywallBanner from "@/components/PaywallBanner";
import { AgentAvatar, agents } from "@/components/TeamSection";
import type { AgentPhase, AdvisorResult } from "@/lib/types";

type AppView = "landing" | "analyzing" | "results" | "paywall";

interface UsageInfo {
  authenticated: boolean;
  plan: "free" | "pro";
  analysesUsed: number;
  analysesLimit: number;
  canAnalyze: boolean;
}

const leo = agents[0];

export default function Home() {
  const [view, setView] = useState<AppView>("landing");
  const [fileName, setFileName] = useState("");
  const [currentPhase, setCurrentPhase] = useState<AgentPhase | null>(null);
  const [completedPhases, setCompletedPhases] = useState<AgentPhase[]>([]);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phaseEstimates, setPhaseEstimates] = useState<Record<string, number> | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  const lastFileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load session from URL
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get("session");
    if (!sid) return;
    fetch(`/api/session/${sid}`)
      .then((r) => (r.ok ? r.json() : null))
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

  const scrollToUpload = useCallback(() => {
    const el = document.getElementById("upload-section");
    el?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const reset = useCallback(() => {
    setView("landing");
    setFileName("");
    setCurrentPhase(null);
    setCompletedPhases([]);
    setResult(null);
    setError(null);
    setSessionId(null);
    setPhaseEstimates(null);
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
        if (resumeId) formData.append("sessionId", resumeId);

        const response = await fetch("/api/analyze", { method: "POST", body: formData });
        if (!response.ok) throw new Error("Errore nella richiesta di analisi");

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
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === "timing") {
                  setPhaseEstimates(data);
                } else if (eventType === "progress") {
                  const phase = data.phase as AgentPhase;
                  if (data.status === "running") setCurrentPhase(phase);
                  else if (data.status === "done") setCompletedPhases((p) => (p.includes(phase) ? p : [...p, phase]));
                } else if (eventType === "complete") {
                  setResult(data.advice || data);
                  setView("results");
                } else if (eventType === "session") setSessionId(data.sessionId);
                else if (eventType === "error") {
                  if (data.code === "LIMIT_REACHED") {
                    fetch("/api/user/usage")
                      .then((r) => r.json())
                      .then(setUsage)
                      .catch(() => {});
                    setView("paywall");
                  } else {
                    setError(data.message || data.error || "Errore sconosciuto");
                  }
                }
              } catch {
                /* skip */
              }
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore durante l'analisi");
      }
    },
    []
  );

  const handleFileSelected = useCallback((file: File) => startAnalysis(file), [startAnalysis]);
  const handleRetry = useCallback(() => {
    const f = lastFileRef.current;
    if (f) startAnalysis(f, sessionId || undefined);
    else reset();
  }, [startAnalysis, sessionId, reset]);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelected(f);
    },
    [handleFileSelected]
  );
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFileSelected(f);
    },
    [handleFileSelected]
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Noise texture overlay */}
      <div className="noise-overlay" />

      <Navbar />

      {/* Floating orbs */}
      <div className="floating-orb" style={{ width: 300, height: 300, left: "5%", top: "10%" }} />
      <div className="floating-orb" style={{ width: 200, height: 200, left: "75%", top: "5%", animationDelay: "2s", animationDuration: "8s" }} />
      <div className="floating-orb" style={{ width: 250, height: 250, left: "60%", top: "60%", animationDelay: "4s", animationDuration: "10s" }} />
      <div className="floating-orb" style={{ width: 180, height: 180, left: "10%", top: "70%", animationDelay: "1s", animationDuration: "7s" }} />

      {/* ═══════════ LANDING ═══════════ */}
      {view === "landing" && (
        <>
          {/* 1. HERO — cinematic with typewriter + floating legal terms */}
          <HeroSection onScrollToUpload={scrollToUpload} />

          {/* Divider */}
          <div className="section-divider" />

          {/* 2. MISSIONE — come funziona in 4 step */}
          <div id="mission">
            <MissionSection />
          </div>

          {/* 3. VIDEO SHOWCASE — placeholder per Sora content */}
          <VideoShowcase
            title="Guarda come funziona"
            subtitle="Carica un documento e guarda i 4 agenti al lavoro."
            placeholderText="Video demo in arrivo — generato con Sora AI"
          />

          {/* Divider */}
          <div className="section-divider" />

          {/* 4. IL TEAM AI — interactive agent cards */}
          <div id="team" className="flex flex-col items-center px-6 py-20 relative z-10">
            <TeamSection />
          </div>

          {/* Divider */}
          <div className="section-divider" />

          {/* 5. CASI D'USO — tabbed examples */}
          <div id="use-cases">
            <UseCasesSection />
          </div>

          {/* Divider */}
          <div className="section-divider" />

          {/* 6. TESTIMONIANZE — scrolling cards */}
          <TestimonialsSection />

          {/* Divider */}
          <div className="section-divider" />

          {/* 7. UPLOAD SECTION — Leo's zone */}
          <div id="upload-section" className="relative z-10 px-6 pb-16">
            <div className="max-w-[700px] mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6 }}
                className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.03]"
              >
                {/* Background effects */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at 20% 20%, ${leo.color}08, transparent 60%)` }}
                />
                <div
                  className="absolute left-0 top-0 bottom-0 w-[3px]"
                  style={{ background: `linear-gradient(to bottom, ${leo.color}80, ${leo.color}20, transparent)` }}
                />
                <div
                  className="absolute top-0 left-0 right-0 h-[2px]"
                  style={{ background: `linear-gradient(90deg, transparent, ${leo.color}50, transparent)` }}
                />

                <div className="relative p-8 md:p-10">
                  {/* Leo's intro */}
                  <div className="flex items-start gap-5 mb-6">
                    <div className="shrink-0">
                      <AgentAvatar variant="catalogatore" color={leo.color} size="xl" />
                    </div>
                    <div className="flex-1 pt-2">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold">{leo.name}</h3>
                        <span
                          className="text-[10px] font-bold tracking-[2px] uppercase px-3 py-1 rounded-full"
                          style={{ color: leo.color, background: `${leo.color}15`, border: `1px solid ${leo.color}25` }}
                        >
                          {leo.role}
                        </span>
                      </div>
                      <div className="relative bg-white/[0.05] border border-white/[0.08] rounded-2xl rounded-tl-sm p-4">
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

                  {/* Upload zone */}
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
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${leo.color}15` }}>
                        {dragOver ? (
                          <FileText className="w-6 h-6" style={{ color: leo.color }} />
                        ) : (
                          <Upload className="w-6 h-6" style={{ color: leo.color }} />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-base font-semibold mb-1">Trascina qui il tuo documento</p>
                        <p className="text-sm text-white/35">PDF, immagine, Word o testo — max 20MB</p>
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

          {/* Divider */}
          <div className="section-divider" />

          {/* 8. CTA FINALE */}
          <CTASection onScrollToUpload={scrollToUpload} />

          {/* 9. FOOTER */}
          <Footer />
        </>
      )}

      {/* ═══════════ ANALYZING ═══════════ */}
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
            phaseEstimates={phaseEstimates}
          />
        </div>
      )}

      {/* ═══════════ PAYWALL ═══════════ */}
      {view === "paywall" && usage && (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 pt-28 pb-16 relative z-10">
          <PaywallBanner analysesUsed={usage.analysesUsed} analysesLimit={usage.analysesLimit} authenticated={usage.authenticated} />
        </div>
      )}

      {/* ═══════════ RESULTS ═══════════ */}
      {view === "results" && result && (
        <div className="relative z-10">
          <ResultsView result={result} fileName={fileName} onReset={reset} />
        </div>
      )}
    </div>
  );
}
