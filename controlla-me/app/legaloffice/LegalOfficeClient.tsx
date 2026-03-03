"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  Sparkles,
  Scale,
  MessageSquare,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import LegalWorkspaceShell from "@/components/workspace/LegalWorkspaceShell";
import PaywallBanner from "@/components/PaywallBanner";
import type { AgentPhase, AdvisorResult } from "@/lib/types";

type AppView = "landing" | "analyzing" | "results" | "paywall";

interface UsageInfo {
  authenticated: boolean;
  plan: "free" | "pro";
  analysesUsed: number;
  analysesLimit: number;
  canAnalyze: boolean;
}

const AGENT_PILLS = [
  { name: "Leo", role: "Catalogatore", color: "#4ECDC4" },
  { name: "Marta", role: "Analista rischi", color: "#FF6B6B" },
  { name: "Giulia", role: "Giurista", color: "#A78BFA" },
  { name: "Enzo", role: "Consulente", color: "#FFC832" },
];

export default function LegalOfficeClient() {
  const [view, setView] = useState<AppView>("landing");
  const [fileName, setFileName] = useState("");
  const [currentPhase, setCurrentPhase] = useState<AgentPhase | null>(null);
  const [completedPhases, setCompletedPhases] = useState<AgentPhase[]>([]);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [contextPrompt, setContextPrompt] = useState("");
  const [phaseResults, setPhaseResults] = useState<Record<string, unknown>>({});

  const lastFileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setView("landing");
    setFileName("");
    setCurrentPhase(null);
    setCompletedPhases([]);
    setResult(null);
    setError(null);
    setSessionId(null);
    setPhaseResults({});
  }, []);

  const startAnalysis = useCallback(
    async (file: File, resumeId?: string) => {
      setFileName(file.name);
      setView("analyzing");
      setCurrentPhase(null);
      setCompletedPhases([]);
      setError(null);
      setPhaseResults({});
      lastFileRef.current = file;

      const formData = new FormData();
      formData.append("file", file);
      if (resumeId) formData.append("sessionId", resumeId);
      if (contextPrompt) formData.append("context", contextPrompt);

      let response: Response;
      try {
        response = await fetch("/api/analyze", { method: "POST", body: formData });
      } catch {
        setError("Errore di connessione. Riprova.");
        setView("landing");
        return;
      }

      if (!response.ok || !response.body) {
        setError("Errore durante l'analisi. Riprova.");
        setView("landing");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processBuffer = () => {
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const block of events) {
          const lines = block.trim().split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "session") setSessionId(data.sessionId);
            else if (eventType === "progress") {
              if (data.status === "running") setCurrentPhase(data.phase);
              else if (data.status === "done") {
                setCompletedPhases((p) => [...p, data.phase]);
                if (data.data)
                  setPhaseResults((prev) => ({ ...prev, [data.phase]: data.data }));
              }
            } else if (eventType === "complete") {
              setResult(data.advice || data);
              setView("results");
            } else if (eventType === "error") {
              if (data.code === "LIMIT_REACHED") {
                fetch("/api/user/usage")
                  .then((r) => r.json())
                  .then(setUsage)
                  .catch(() => {});
                setView("paywall");
              } else {
                setError(data.error || "Errore durante l'analisi");
              }
            }
          } catch {
            /* ignore parse errors */
          }
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          processBuffer();
        }
      } catch {
        setError("Connessione interrotta. Riprova.");
        setView("landing");
      }
    },
    [contextPrompt]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) startAnalysis(file);
    },
    [startAnalysis]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) startAnalysis(file);
    },
    [startAnalysis]
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />

      {/* ═══════════ LANDING — Upload ═══════════ */}
      <AnimatePresence mode="wait">
        {view === "landing" && (
          <motion.div
            key="upload-landing"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center min-h-screen px-6 pt-20 pb-16"
          >
            <div className="w-full max-w-2xl">
              {/* Badge */}
              <div className="flex justify-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FF6B35]/10 border border-[#FF6B35]/20 text-[#FF6B35] text-sm font-medium">
                  <Scale className="w-3.5 h-3.5" />
                  Legal Intelligence Workspace
                </div>
              </div>

              {/* Heading */}
              <div className="text-center mb-10">
                <h1 className="font-serif text-4xl md:text-5xl text-white mb-4 leading-tight">
                  Analisi legale{" "}
                  <span className="text-[#FF6B35]">professionale</span>
                </h1>
                <p className="text-white/50 text-lg max-w-lg mx-auto">
                  4 agenti AI specializzati analizzano il tuo contratto in
                  parallelo — rischi, normativa, consigli pratici.
                </p>
              </div>

              {/* Agent pills */}
              <div className="flex items-center justify-center gap-3 flex-wrap mb-10">
                {AGENT_PILLS.map((a) => (
                  <div
                    key={a.name}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
                    style={{
                      borderColor: `${a.color}30`,
                      backgroundColor: `${a.color}10`,
                      color: a.color,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: a.color }}
                    />
                    {a.name} · {a.role}
                  </div>
                ))}
              </div>

              {/* Drop Zone */}
              <div
                className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
                  dragOver
                    ? "border-[#FF6B35]/80 bg-[#FF6B35]/5 scale-[1.01]"
                    : "border-white/10 hover:border-white/25 hover:bg-white/[0.02]"
                }`}
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
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileChange}
                />
                <div
                  className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-all ${
                    dragOver ? "bg-[#FF6B35]/20" : "bg-white/5"
                  }`}
                >
                  {dragOver ? (
                    <FileText className="w-8 h-8 text-[#FF6B35]" />
                  ) : (
                    <Upload className="w-8 h-8 text-white/40" />
                  )}
                </div>

                <p className="text-white/80 text-lg font-medium mb-1">
                  {dragOver
                    ? "Rilascia per analizzare"
                    : "Trascina il contratto qui"}
                </p>
                <p className="text-white/40 text-sm mb-7">
                  oppure clicca per selezionare — PDF, DOCX, TXT · max 20MB
                </p>

                <div className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#FF6B35] text-white text-sm font-medium hover:bg-[#FF6B35]/90 transition-colors">
                  <FileText className="w-4 h-4" />
                  Seleziona documento
                </div>
              </div>

              {/* Context prompt */}
              <div className="mt-4 relative">
                <MessageSquare className="absolute left-3.5 top-3 w-4 h-4 text-white/25" />
                <textarea
                  value={contextPrompt}
                  onChange={(e) => setContextPrompt(e.target.value)}
                  placeholder="Contesto opzionale — es. &quot;Sono il conduttore&quot; o &quot;Cosa rischio se recedo anticipatamente?&quot;"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white/70 placeholder-white/25 resize-none focus:outline-none focus:border-white/20 transition-colors"
                  rows={2}
                  maxLength={500}
                />
              </div>

              {/* Error */}
              {error && (
                <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              {/* Trust signals */}
              <div className="flex items-center justify-center gap-6 mt-8">
                {[
                  { icon: <Sparkles className="w-3.5 h-3.5" />, text: "4 agenti specializzati" },
                  { icon: <Scale className="w-3.5 h-3.5" />, text: "Punto di vista parte debole" },
                  { icon: <FileText className="w-3.5 h-3.5" />, text: "Corpus legislativo IT+EU" },
                ].map((item) => (
                  <div
                    key={item.text}
                    className="flex items-center gap-1.5 text-white/30 text-xs"
                  >
                    {item.icon}
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ WORKSPACE (analyzing + results) ═══════════ */}
      {(view === "analyzing" || view === "results") && (
        <LegalWorkspaceShell
          fileName={fileName}
          currentPhase={currentPhase}
          completedPhases={completedPhases}
          phaseResults={phaseResults}
          result={result}
          sessionId={sessionId}
          onBack={reset}
          documentType={
            (phaseResults.classifier as { documentType?: string } | null)
              ?.documentType
          }
        />
      )}

      {/* ═══════════ PAYWALL ═══════════ */}
      {view === "paywall" && usage && (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 pt-28 pb-16 relative z-10">
          <PaywallBanner
            analysesUsed={usage.analysesUsed}
            analysesLimit={usage.analysesLimit}
            authenticated={usage.authenticated}
          />
        </div>
      )}
    </div>
  );
}
