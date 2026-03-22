"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Music,
  Headphones,
  BarChart3,
  Mic2,
  Sparkles,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileAudio,
  TrendingUp,
  Sliders,
  Star,
  AlertCircle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/* ══════════════════════════════════════════════════════
   Music Agent Colors (matching design system identity)
   ══════════════════════════════════════════════════════ */
const MUSIC_ACCENT = "#FF6B35"; // brand accent
const MUSIC_TEAL = "#4ECDC4"; // audio analyst
const MUSIC_VIOLET = "#A78BFA"; // trend scout
const MUSIC_CORAL = "#FF6B6B"; // arrangement director
const MUSIC_GOLD = "#FFC832"; // quality reviewer

/* ══════════════════════════════════════════════════════
   Pipeline Steps
   ══════════════════════════════════════════════════════ */
const PIPELINE_STEPS = [
  {
    icon: Upload,
    title: "Carica il tuo demo",
    description: "WAV, MP3, FLAC fino a 50MB. Il tuo brano resta tuo al 100%.",
    color: MUSIC_TEAL,
  },
  {
    icon: Sliders,
    title: "Analisi Audio DNA",
    description:
      "4 agenti analizzano in parallelo: struttura, melodia, voce e arrangiamento.",
    color: MUSIC_VIOLET,
  },
  {
    icon: TrendingUp,
    title: "Diagnosi di mercato",
    description:
      "Confronto con i trend attuali, gap analysis e reference track suggerite.",
    color: MUSIC_CORAL,
  },
  {
    icon: Star,
    title: "Piano di riarrangiamento",
    description:
      "Ricevi un piano dettagliato e azionabile per trasformare il demo in hit.",
    color: MUSIC_GOLD,
  },
];

/* ══════════════════════════════════════════════════════
   Music Agents
   ══════════════════════════════════════════════════════ */
const AGENTS = [
  {
    name: "Audio Analyst",
    role: "Stem Separation & Audio DNA",
    description:
      "Separa voce, batteria, basso e armonia. Analizza BPM, key, struttura e sezioni del brano.",
    color: MUSIC_TEAL,
    icon: Headphones,
  },
  {
    name: "Trend Scout",
    role: "Analisi Mercato & Tendenze",
    description:
      "Confronta il tuo brano con le chart attuali. Individua trend, gap e opportunita commerciali.",
    color: MUSIC_VIOLET,
    icon: TrendingUp,
  },
  {
    name: "Arrangement Director",
    role: "Direzione Artistica AI",
    description:
      "Crea un piano di riarrangiamento dettagliato: cosa cambiare, cosa tenere, reference track.",
    color: MUSIC_CORAL,
    icon: Sliders,
  },
  {
    name: "Quality Reviewer",
    role: "Review & Feedback Iterativo",
    description:
      "Valuta ogni nuova versione del brano. Feedback continuo fino al risultato ottimale.",
    color: MUSIC_GOLD,
    icon: Star,
  },
];

/* ══════════════════════════════════════════════════════
   Upload State Types
   ══════════════════════════════════════════════════════ */
type UploadState = "idle" | "uploading" | "success" | "error";

/* ══════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════ */
export default function MusicPageClient() {
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setFileName(file.name);
    setUploadState("uploading");
    setUploadMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/music/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadState("error");
        setUploadMessage(data.error || "Errore durante l'upload");
        return;
      }

      setUploadState("success");
      setUploadMessage(
        `"${file.name}" caricato con successo. L'analisi partira a breve.`
      );
    } catch {
      setUploadState("error");
      setUploadMessage("Errore di connessione. Riprova.");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleUpload(f);
    },
    [handleUpload]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleUpload(f);
    },
    [handleUpload]
  );

  const resetUpload = useCallback(() => {
    setUploadState("idle");
    setUploadMessage("");
    setFileName("");
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden bg-[var(--background)]">
      {/* Noise texture overlay */}
      <div className="noise-overlay" />

      <Navbar />

      {/* Floating orbs */}
      <div
        className="floating-orb"
        style={{
          width: 400,
          height: 400,
          left: "5%",
          top: "15%",
          opacity: 0.3,
        }}
      />
      <div
        className="floating-orb"
        style={{
          width: 300,
          height: 300,
          left: "80%",
          top: "5%",
          animationDelay: "2s",
          animationDuration: "8s",
          opacity: 0.2,
        }}
      />
      <div
        className="floating-orb"
        style={{
          width: 350,
          height: 350,
          left: "65%",
          top: "65%",
          animationDelay: "4s",
          animationDuration: "10s",
          opacity: 0.25,
        }}
      />

      {/* ═══════════ HERO SECTION ═══════════ */}
      <section className="relative min-h-[90vh] flex items-center bg-[var(--surface)] overflow-hidden">
        <div className="w-full max-w-[var(--max-width-wide)] mx-auto px-6 md:px-12 pt-24 pb-12">
          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16">
            {/* LEFT — Text */}
            <div className="flex-1 w-full md:w-1/2 text-left">
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--accent)]/25 mb-6 text-sm text-[var(--foreground)] font-medium"
              >
                <Music className="w-4 h-4 text-[var(--accent)]" />
                Il tuo A&R personale, powered by AI
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6 }}
                className="font-serif font-black text-[var(--fluid-hero)] leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-[var(--foreground)] mb-4"
              >
                Il tuo demo,
                <br />
                <span
                  className="italic bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(to bottom right, var(--accent), #E85A24, #D4511E)",
                  }}
                >
                  la prossima hit.
                </span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-[var(--fluid-body)] text-[var(--foreground-secondary)] max-w-[480px] mb-8 leading-[var(--leading-relaxed)]"
              >
                Carica il tuo brano. 6 agenti AI lo analizzano, lo confrontano
                con i trend di mercato e ti danno un piano di riarrangiamento
                dettagliato.
                <br />
                <span className="text-[var(--foreground-tertiary)] text-sm">
                  Tu mantieni il 100% della proprieta intellettuale. Sempre.
                </span>
              </motion.p>

              {/* CTA scroll */}
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="px-8 py-4 rounded-[var(--radius-xl)] text-base font-bold text-white hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-2"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, var(--accent), var(--accent-cta-end))",
                  boxShadow: "0 12px 40px rgba(255, 107, 53, 0.3)",
                }}
                onClick={() => {
                  document
                    .getElementById("upload-music")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <Mic2 className="w-5 h-5" />
                Analizza il tuo brano
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>

            {/* RIGHT — Waveform Visualization */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="flex-1 w-full md:w-1/2 flex items-center justify-center"
            >
              <div className="relative w-full max-w-[480px] aspect-square">
                {/* Circular waveform animation */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg viewBox="0 0 200 200" className="w-full h-full">
                    {/* Outer ring */}
                    <motion.circle
                      cx="100"
                      cy="100"
                      r="90"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="0.5"
                      strokeDasharray="4 8"
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 30,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      style={{ transformOrigin: "100px 100px" }}
                    />

                    {/* Waveform bars in circle */}
                    {Array.from({ length: 48 }).map((_, i) => {
                      const angle = (i / 48) * 360;
                      const barHeight = 8 + Math.sin(i * 0.7) * 12;
                      const innerR = 55;
                      const rad = (angle * Math.PI) / 180;
                      const x1 = 100 + innerR * Math.cos(rad);
                      const y1 = 100 + innerR * Math.sin(rad);
                      const x2 =
                        100 + (innerR + barHeight) * Math.cos(rad);
                      const y2 =
                        100 + (innerR + barHeight) * Math.sin(rad);

                      return (
                        <motion.line
                          key={i}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="var(--accent)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          initial={{ opacity: 0.3 }}
                          animate={{
                            opacity: [0.3, 0.8, 0.3],
                            strokeWidth: [2, 3, 2],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            delay: i * 0.05,
                            ease: "easeInOut",
                          }}
                        />
                      );
                    })}

                    {/* Center icon area */}
                    <circle
                      cx="100"
                      cy="100"
                      r="35"
                      fill="var(--surface)"
                      stroke="var(--accent)"
                      strokeWidth="1"
                      opacity="0.8"
                    />
                  </svg>

                  {/* Center icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="w-16 h-16 rounded-full flex items-center justify-center"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--accent), #E85A24)",
                        boxShadow: "0 8px 32px rgba(255, 107, 53, 0.3)",
                      }}
                    >
                      <Headphones className="w-8 h-8 text-white" />
                    </motion.div>
                  </div>
                </div>

                {/* Agent indicators around circle */}
                {AGENTS.map((agent, i) => {
                  const positions = [
                    { top: "2%", left: "50%", transform: "translateX(-50%)" },
                    {
                      top: "50%",
                      right: "0%",
                      transform: "translateY(-50%)",
                    },
                    {
                      bottom: "2%",
                      left: "50%",
                      transform: "translateX(-50%)",
                    },
                    {
                      top: "50%",
                      left: "0%",
                      transform: "translateY(-50%)",
                    },
                  ];
                  return (
                    <motion.div
                      key={agent.name}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6 + i * 0.15, duration: 0.5 }}
                      className="absolute hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
                      style={{
                        ...positions[i],
                        color: agent.color,
                        borderColor: `${agent.color}30`,
                        background: `${agent.color}10`,
                      }}
                    >
                      <agent.icon className="w-3.5 h-3.5" />
                      {agent.name}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="section-divider" />

      {/* ═══════════ COME FUNZIONA ═══════════ */}
      <section className="relative z-10 py-20 md:py-28 px-6">
        <div className="max-w-[var(--max-width-content)] mx-auto">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            className="text-center mb-16"
          >
            <span className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--accent)] mb-3 block">
              Come funziona
            </span>
            <h2 className="font-serif text-[var(--fluid-h2)] text-[var(--foreground)] leading-[var(--leading-tight)] mb-4">
              Dal demo alla hit,{" "}
              <span className="italic text-[var(--accent)]">
                in 4 step
              </span>
            </h2>
            <p className="text-[var(--foreground-secondary)] text-[var(--fluid-body)] max-w-[560px] mx-auto leading-[var(--leading-relaxed)]">
              Carica il tuo brano e lascia che i nostri agenti facciano il
              lavoro pesante. Tu ti concentri sulla musica.
            </p>
          </motion.div>

          {/* Pipeline steps */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {PIPELINE_STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: i * 0.1 }}
                className="relative group"
              >
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-6 hover:shadow-[var(--shadow-md)] hover:border-[var(--border)]/80 transition-all h-full">
                  {/* Step number */}
                  <span
                    className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase mb-4 block"
                    style={{ color: step.color }}
                  >
                    Step {i + 1}
                  </span>

                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-[var(--radius-lg)] flex items-center justify-center mb-4"
                    style={{ background: `${step.color}15` }}
                  >
                    <step.icon
                      className="w-6 h-6"
                      style={{ color: step.color }}
                    />
                  </div>

                  <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-[var(--foreground-secondary)] leading-[var(--leading-relaxed)]">
                    {step.description}
                  </p>
                </div>

                {/* Arrow connector (not on last) */}
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                    <ArrowRight className="w-5 h-5 text-[var(--foreground-tertiary)]" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="section-divider" />

      {/* ═══════════ TEAM AGENTI ═══════════ */}
      <section className="relative z-10 py-20 md:py-28 px-6 bg-[var(--background-secondary)]">
        <div className="max-w-[var(--max-width-content)] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            className="text-center mb-16"
          >
            <span className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--accent)] mb-3 block">
              Il Team
            </span>
            <h2 className="font-serif text-[var(--fluid-h2)] text-[var(--foreground)] leading-[var(--leading-tight)] mb-4">
              6 agenti AI,{" "}
              <span className="italic text-[var(--accent)]">
                un solo obiettivo
              </span>
            </h2>
            <p className="text-[var(--foreground-secondary)] text-[var(--fluid-body)] max-w-[560px] mx-auto">
              Ogni agente e specializzato in un aspetto diverso della
              produzione musicale.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {AGENTS.map((agent, i) => (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-6 hover:shadow-[var(--shadow-md)] transition-all group"
              >
                <div className="flex items-start gap-4">
                  {/* Agent avatar */}
                  <div
                    className="w-14 h-14 rounded-[var(--radius-xl)] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
                    style={{ background: `${agent.color}15` }}
                  >
                    <agent.icon
                      className="w-7 h-7"
                      style={{ color: agent.color }}
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-bold text-[var(--foreground)]">
                        {agent.name}
                      </h3>
                      <span
                        className="text-[10px] font-bold tracking-[2px] uppercase px-3 py-1 rounded-full"
                        style={{
                          color: agent.color,
                          background: `${agent.color}15`,
                          border: `1px solid ${agent.color}25`,
                        }}
                      >
                        {agent.role.split(" ")[0]}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--foreground-secondary)] leading-[var(--leading-relaxed)]">
                      {agent.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="section-divider" />

      {/* ═══════════ UPLOAD SECTION ═══════════ */}
      <section
        id="upload-music"
        className="relative z-10 py-20 md:py-28 px-6"
      >
        <div className="max-w-[700px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            className="text-center mb-10"
          >
            <span className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--accent)] mb-3 block">
              Inizia ora
            </span>
            <h2 className="font-serif text-[var(--fluid-h2)] text-[var(--foreground)] leading-[var(--leading-tight)] mb-4">
              Carica il tuo{" "}
              <span className="italic text-[var(--accent)]">demo</span>
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
          >
            {/* Subtle gradient bg */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at 20% 20%, ${MUSIC_ACCENT}08, transparent 60%)`,
              }}
            />
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px]"
              style={{
                background: `linear-gradient(to bottom, ${MUSIC_ACCENT}80, ${MUSIC_ACCENT}20, transparent)`,
              }}
            />
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{
                background: `linear-gradient(90deg, transparent, ${MUSIC_ACCENT}50, transparent)`,
              }}
            />

            <div className="relative p-8 md:p-10">
              {/* Upload state feedback */}
              <AnimatePresence mode="wait">
                {uploadState === "success" && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mb-6 p-4 rounded-[var(--radius-lg)] border border-green-200 bg-green-50 flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">
                        {uploadMessage}
                      </p>
                      <button
                        onClick={resetUpload}
                        className="text-xs text-green-600 hover:underline mt-1"
                      >
                        Carica un altro brano
                      </button>
                    </div>
                  </motion.div>
                )}

                {uploadState === "error" && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mb-6 p-4 rounded-[var(--radius-lg)] border border-red-200 bg-red-50 flex items-center gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">
                        {uploadMessage}
                      </p>
                      <button
                        onClick={resetUpload}
                        className="text-xs text-red-600 hover:underline mt-1"
                      >
                        Riprova
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Upload zone */}
              {uploadState !== "success" && (
                <div
                  className={`rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
                    uploadState === "uploading"
                      ? "border-[var(--accent)]/50 bg-[var(--accent)]/5 pointer-events-none"
                      : dragOver
                        ? "border-[var(--accent)]/80 bg-[var(--accent)]/5 scale-[1.01]"
                        : "border-[var(--accent)]/30 bg-[var(--surface)] shadow-sm hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/[0.03]"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() =>
                    uploadState !== "uploading" &&
                    fileInputRef.current?.click()
                  }
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.wav,.flac,.ogg,.m4a,.aiff"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="flex flex-col items-center gap-4 px-8 py-10">
                    {uploadState === "uploading" ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          className="w-14 h-14 rounded-2xl flex items-center justify-center"
                          style={{ background: `${MUSIC_ACCENT}15` }}
                        >
                          <FileAudio
                            className="w-6 h-6"
                            style={{ color: MUSIC_ACCENT }}
                          />
                        </motion.div>
                        <div className="text-center">
                          <p className="text-base font-semibold mb-1">
                            Caricamento in corso...
                          </p>
                          <p className="text-sm text-[var(--foreground-tertiary)]">
                            {fileName}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center"
                          style={{ background: `${MUSIC_ACCENT}15` }}
                        >
                          {dragOver ? (
                            <FileAudio
                              className="w-6 h-6"
                              style={{ color: MUSIC_ACCENT }}
                            />
                          ) : (
                            <Upload
                              className="w-6 h-6"
                              style={{ color: MUSIC_ACCENT }}
                            />
                          )}
                        </div>
                        <div className="text-center">
                          <p className="text-base font-semibold mb-1">
                            {dragOver
                              ? "Rilascia per analizzare"
                              : "Trascina qui il tuo brano"}
                          </p>
                          <p className="text-sm text-[var(--foreground-tertiary)]">
                            MP3, WAV, FLAC, OGG, M4A, AIFF — max 50MB
                          </p>
                        </div>
                        <button
                          className="mt-1 px-10 py-4 rounded-full text-base font-bold text-white hover:-translate-y-0.5 transition-all"
                          style={{
                            background: `linear-gradient(135deg, var(--accent), var(--accent-cta-end))`,
                            boxShadow: `0 12px 40px rgba(255, 107, 53, 0.3)`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                        >
                          Scegli file audio
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Trust signals */}
              <div className="flex gap-6 flex-wrap justify-center mt-6 text-[var(--foreground-tertiary)] text-xs">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3" /> Proprieta intellettuale
                  100% tua
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Analisi in pochi minuti
                </span>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> 1 analisi gratuita al
                  mese
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Divider */}
      <div className="section-divider" />

      {/* ═══════════ PRICING PREVIEW ═══════════ */}
      <section className="relative z-10 py-20 md:py-28 px-6 bg-[var(--background-secondary)]">
        <div className="max-w-[var(--max-width-content)] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            className="text-center mb-14"
          >
            <span className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--accent)] mb-3 block">
              Prezzi
            </span>
            <h2 className="font-serif text-[var(--fluid-h2)] text-[var(--foreground)] leading-[var(--leading-tight)] mb-4">
              Inizia{" "}
              <span className="italic text-[var(--accent)]">gratis</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[900px] mx-auto">
            {[
              {
                name: "Free",
                price: "$0",
                period: "/mese",
                features: [
                  "1 analisi demo al mese",
                  "Report base",
                  "Commercial Viability Score",
                ],
                cta: "Inizia gratis",
                highlighted: false,
              },
              {
                name: "Artist",
                price: "$9.99",
                period: "/mese",
                features: [
                  "5 analisi al mese",
                  "Piano riarrangiamento completo",
                  "Review iterative illimitate",
                  "Reference track suggerite",
                ],
                cta: "Scegli Artist",
                highlighted: true,
              },
              {
                name: "Pro",
                price: "$29.99",
                period: "/mese",
                features: [
                  "Analisi illimitate",
                  "Release strategy completa",
                  "Career advisor AI",
                  "Supporto prioritario",
                ],
                cta: "Scegli Pro",
                highlighted: false,
              },
            ].map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: i * 0.1 }}
                className={`rounded-[var(--radius-xl)] border p-6 transition-all ${
                  plan.highlighted
                    ? "border-[var(--accent)]/50 bg-[var(--surface)] shadow-[var(--shadow-lg)] scale-[1.02]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:shadow-[var(--shadow-md)]"
                }`}
              >
                {plan.highlighted && (
                  <span className="inline-block text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--accent)] mb-2">
                    Piu popolare
                  </span>
                )}
                <h3 className="text-xl font-bold text-[var(--foreground)] mb-1">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-black text-[var(--foreground)]">
                    {plan.price}
                  </span>
                  <span className="text-sm text-[var(--foreground-tertiary)]">
                    {plan.period}
                  </span>
                </div>
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-[var(--foreground-secondary)]"
                    >
                      <CheckCircle2
                        className="w-4 h-4 shrink-0"
                        style={{
                          color: plan.highlighted
                            ? MUSIC_ACCENT
                            : "var(--foreground-tertiary)",
                        }}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3 rounded-[var(--radius-xl)] text-sm font-bold transition-all ${
                    plan.highlighted
                      ? "text-white hover:scale-[1.02]"
                      : "text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                  }`}
                  style={
                    plan.highlighted
                      ? {
                          backgroundImage:
                            "linear-gradient(135deg, var(--accent), var(--accent-cta-end))",
                          boxShadow:
                            "0 8px 24px rgba(255, 107, 53, 0.25)",
                        }
                      : undefined
                  }
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="section-divider" />

      {/* ═══════════ CTA FINALE ═══════════ */}
      <section className="relative z-10 py-20 md:py-28 px-6">
        <div className="max-w-[600px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
          >
            <h2 className="font-serif text-[var(--fluid-h2)] text-[var(--foreground)] leading-[var(--leading-tight)] mb-4">
              Il tuo brano merita
              <br />
              <span className="italic text-[var(--accent)]">
                di essere ascoltato.
              </span>
            </h2>
            <p className="text-[var(--foreground-secondary)] text-[var(--fluid-body)] mb-8 leading-[var(--leading-relaxed)]">
              Non lasciare che un buon demo resti nel cassetto. Lascia che
              l&apos;AI ti mostri come tirarne fuori il massimo.
            </p>
            <button
              className="px-10 py-4 rounded-[var(--radius-xl)] text-base font-bold text-white hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-2 mx-auto"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, var(--accent), var(--accent-cta-end))",
                boxShadow: "0 12px 40px rgba(255, 107, 53, 0.3)",
              }}
              onClick={() => {
                document
                  .getElementById("upload-music")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Mic2 className="w-5 h-5" />
              Analizza il tuo brano
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}
