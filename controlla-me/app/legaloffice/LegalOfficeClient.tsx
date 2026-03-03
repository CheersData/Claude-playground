"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Scale, MessageSquare, BookOpen, Globe } from "lucide-react";

import Navbar from "@/components/Navbar";
import LegalWorkspaceShell, { type TierName } from "@/components/workspace/LegalWorkspaceShell";
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

// ── Tier options ───────────────────────────────────────────────────────────────

const TIER_OPTIONS: Array<{
  id: TierName;
  label: string;
  desc: string;
  cost: string;
  models: string;
  activeClass: string;
  dotColor: string;
}> = [
  {
    id: "intern",
    label: "Intern",
    desc: "Modelli gratuiti",
    cost: "~gratis",
    models: "Cerebras · Groq · Mistral",
    activeClass: "border-gray-400 bg-gray-50 ring-1 ring-gray-300",
    dotColor: "#9ca3af",
  },
  {
    id: "associate",
    label: "Associate",
    desc: "Qualità intermedia",
    cost: "~€ 0.01",
    models: "Gemini Pro · Mistral Large",
    activeClass: "border-blue-400 bg-blue-50 ring-1 ring-blue-300",
    dotColor: "#3b82f6",
  },
  {
    id: "partner",
    label: "Partner",
    desc: "Massima qualità",
    cost: "~€ 0.05",
    models: "Claude Sonnet · GPT-5",
    activeClass: "border-violet-400 bg-violet-50 ring-1 ring-violet-300",
    dotColor: "#7c3aed",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function LegalOfficeClient() {
  const [view, setView]                   = useState<AppView>("landing");
  const [fileName, setFileName]           = useState("");
  const [currentPhase, setCurrentPhase]   = useState<AgentPhase | null>(null);
  const [completedPhases, setCompletedPhases] = useState<AgentPhase[]>([]);
  const [result, setResult]               = useState<AdvisorResult | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [sessionId, setSessionId]         = useState<string | null>(null);
  const [dragOver, setDragOver]           = useState(false);
  const [usage, setUsage]                 = useState<UsageInfo | null>(null);
  const [contextPrompt, setContextPrompt] = useState("");
  const [phaseResults, setPhaseResults]   = useState<Record<string, unknown>>({});
  const [tier, setTier]                   = useState<TierName>("partner");

  const lastFileRef  = useRef<File | null>(null);
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
      formData.append("tier", tier);
      if (resumeId)      formData.append("sessionId", resumeId);
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

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      const processBuffer = () => {
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const block of events) {
          const lines = block.trim().split("\n");
          let eventType = "message";
          let dataStr   = "";
          for (const line of lines) {
            if (line.startsWith("event:"))      eventType = line.slice(6).trim();
            else if (line.startsWith("data:"))  dataStr   = line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "session") {
              setSessionId(data.sessionId);
            } else if (eventType === "progress") {
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
                fetch("/api/user/usage").then((r) => r.json()).then(setUsage).catch(() => {});
                setView("paywall");
              } else {
                setError(data.error || "Errore durante l'analisi");
              }
            }
          } catch { /* ignore parse errors */ }
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
    [contextPrompt, tier]
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
    <div className="min-h-screen bg-[#F8F9FA]">
      <Navbar />

      {/* ═══════════ LANDING ═══════════ */}
      <AnimatePresence mode="wait">
        {view === "landing" && (
          <motion.div
            key="upload-landing"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center justify-center min-h-screen px-6 pt-20 pb-16"
          >
            <div className="w-full max-w-xl">

              {/* Badge */}
              <div className="flex justify-center mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-gray-200 text-gray-500 text-xs font-semibold tracking-wide shadow-sm">
                  <Scale className="w-3.5 h-3.5 text-[#FF6B35]" />
                  Legal Intelligence Workspace
                </div>
              </div>

              {/* Heading */}
              <div className="text-center mb-8">
                <h1 className="font-serif text-3xl md:text-4xl text-gray-900 mb-3 leading-tight">
                  Analisi legale{" "}
                  <span className="text-[#FF6B35]">professionale</span>
                </h1>
                <p className="text-gray-500 text-base max-w-md mx-auto leading-relaxed">
                  Pipeline a 4 agenti AI — classificazione, analisi rischi,
                  ricerca normativa e consulenza — su corpus legislativo IT+EU.
                </p>
              </div>

              {/* ── Tier selector ── */}
              <div className="mb-6">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-300 mb-2.5 text-center">
                  Livello analisi
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TIER_OPTIONS.map((opt) => {
                    const active = tier === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setTier(opt.id)}
                        className={`p-3 rounded-xl border-2 text-left transition-all duration-150 bg-white ${
                          active ? opt.activeClass : "border-gray-150 hover:border-gray-300"
                        }`}
                        style={{ borderColor: active ? undefined : "#edf0f3" }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: active ? opt.dotColor : "#d1d5db" }}
                          />
                          <span className={`text-xs font-bold ${active ? "text-gray-800" : "text-gray-500"}`}>
                            {opt.label}
                          </span>
                        </div>
                        <p className={`text-[10px] leading-tight ${active ? "text-gray-500" : "text-gray-400"}`}>
                          {opt.desc}
                        </p>
                        <p className={`text-[10px] font-semibold mt-1.5 ${active ? "text-gray-700" : "text-gray-300"}`}>
                          {opt.cost}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Drop Zone ── */}
              <div
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
                  dragOver
                    ? "border-[#FF6B35] bg-[#FF6B35]/5 scale-[1.01]"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
                <div className={`w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center transition-all ${
                  dragOver ? "bg-[#FF6B35]/15" : "bg-gray-100"
                }`}>
                  {dragOver
                    ? <FileText className="w-6 h-6 text-[#FF6B35]" />
                    : <Upload className="w-6 h-6 text-gray-400" />
                  }
                </div>

                <p className="text-gray-700 text-sm font-semibold mb-1">
                  {dragOver ? "Rilascia per avviare l'analisi" : "Trascina il documento qui"}
                </p>
                <p className="text-gray-400 text-xs mb-5">
                  oppure clicca per sfogliare — PDF · DOCX · TXT · max 20 MB
                </p>

                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#FF6B35] text-white text-sm font-semibold hover:bg-[#E8451A] transition-colors shadow-sm">
                  <FileText className="w-4 h-4" />
                  Seleziona documento
                </div>
              </div>

              {/* ── Context ── */}
              <div className="mt-3 relative">
                <MessageSquare className="absolute left-3.5 top-3 w-3.5 h-3.5 text-gray-300" />
                <textarea
                  value={contextPrompt}
                  onChange={(e) => setContextPrompt(e.target.value)}
                  placeholder='Contesto opzionale — es. "Sono il conduttore" o "Cosa rischio se recedo anticipatamente?"'
                  className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:border-gray-400 transition-colors"
                  rows={2}
                  maxLength={500}
                />
              </div>

              {/* Error */}
              {error && (
                <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm text-center">
                  {error}
                </div>
              )}

              {/* Trust signals */}
              <div className="flex items-center justify-center gap-5 mt-6">
                {[
                  { icon: <Globe className="w-3.5 h-3.5" />,    text: "6.100+ articoli legislativi" },
                  { icon: <Scale className="w-3.5 h-3.5" />,    text: "Parte debole tutelata" },
                  { icon: <BookOpen className="w-3.5 h-3.5" />, text: "Corpus IT + EU" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                    {item.icon}
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ WORKSPACE ═══════════ */}
      {(view === "analyzing" || view === "results") && (
        <LegalWorkspaceShell
          fileName={fileName}
          currentPhase={currentPhase}
          completedPhases={completedPhases}
          phaseResults={phaseResults}
          result={result}
          sessionId={sessionId}
          onBack={reset}
          tier={tier}
          documentType={
            (phaseResults.classifier as { documentType?: string } | null)?.documentType
          }
        />
      )}

      {/* ═══════════ PAYWALL ═══════════ */}
      {view === "paywall" && usage && (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 pt-28 pb-16">
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
