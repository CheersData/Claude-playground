"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  Upload,
  FileText,
  Lock,
  Globe,
  Sparkles,
  ArrowRight,
  MessageCircle,
  ArrowDown,
  BookOpen,
} from "lucide-react";
import CorpusChat from "@/components/CorpusChat";

/* ══════════════════════════════════════════════════════
   Animated text — words appear, get circled in red,
   struck through, then fade out
   ══════════════════════════════════════════════════════ */

const STRIKE_WORDS = [
  "clausola vessatoria",
  "penale eccessiva",
  "recesso impossibile",
  "garanzia esclusa",
  "termine decadenziale",
  "rinnovo tacito",
];

function TextStrikeAnimation() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"enter" | "circle" | "strike" | "exit">("enter");

  useEffect(() => {
    const timings = { enter: 800, circle: 1000, strike: 1000, exit: 600 };
    const timer = setTimeout(() => {
      if (phase === "enter") setPhase("circle");
      else if (phase === "circle") setPhase("strike");
      else if (phase === "strike") setPhase("exit");
      else {
        setIndex((i) => (i + 1) % STRIKE_WORDS.length);
        setPhase("enter");
      }
    }, timings[phase]);
    return () => clearTimeout(timer);
  }, [phase, index]);

  return (
    <span className="relative inline-block min-w-[200px] text-center">
      <AnimatePresence mode="wait">
        <motion.span
          key={`${index}-${phase}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: phase === "exit" ? 0 : 1,
            y: 0,
          }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="relative inline-block"
        >
          <span
            className="relative transition-all duration-500"
            style={
              phase === "strike"
                ? {
                    textDecoration: "line-through",
                    textDecorationColor: "var(--strike-red)",
                    textDecorationThickness: "3px",
                    color: "color-mix(in srgb, var(--strike-red) 70%, transparent)",
                  }
                : undefined
            }
          >
            {STRIKE_WORDS[index]}
          </span>

          {/* Red circle SVG overlay */}
          {(phase === "circle" || phase === "strike") && (
            <motion.svg
              className="absolute -inset-x-3 -inset-y-2 pointer-events-none"
              viewBox="0 0 200 50"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <motion.ellipse
                cx="100"
                cy="25"
                rx="95"
                ry="20"
                fill="none"
                stroke="var(--strike-red)"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: 0,
                }}
              />
            </motion.svg>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ══════════════════════════════════════════════════════
   Section 1 — "Ti verifico il documento"
   ══════════════════════════════════════════════════════ */

function HeroVerifica({
  onFileSelected,
  contextPrompt,
  onContextChange,
}: {
  onFileSelected: (file: File) => void;
  contextPrompt: string;
  onContextChange: (value: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) onFileSelected(f);
    },
    [onFileSelected]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onFileSelected(f);
    },
    [onFileSelected]
  );

  return (
    <section className="relative min-h-[100vh] flex items-center bg-[var(--surface)] overflow-hidden">
      <div className="w-full max-w-[var(--max-width-wide)] mx-auto px-6 md:px-12 pt-24 pb-12">
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">

          {/* LEFT — Text & CTA on clean white */}
          <div className="flex-1 w-full md:w-1/2 text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--accent)]/25 mb-6 text-sm text-[var(--foreground)] font-medium"
            >
              <Sparkles className="w-4 h-4 text-[var(--accent)]" />
              4 agenti AI al tuo servizio
            </motion.div>

            {/* Headline — poche parole, MOLTO BOLD */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="font-serif font-black text-[var(--fluid-hero)] leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-[var(--foreground)] mb-4"
            >
              Ti verifico
              <br />
              <span
                className="italic bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(to bottom right, var(--accent), var(--gradient-warm-mid), var(--gradient-warm-end))" }}
              >
                il documento.
              </span>
            </motion.h1>

            {/* Animated strike words */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-lg text-[var(--foreground-secondary)] mb-6 h-10 flex items-center"
            >
              <span className="mr-2">Troviamo</span>
              <TextStrikeAnimation />
            </motion.div>

            {/* Sub — una riga sola */}
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-[var(--fluid-body)] text-[var(--foreground-secondary)] max-w-[460px] mb-8 leading-[var(--leading-relaxed)]"
            >
              Carica un contratto, una bolletta, qualsiasi documento.
              <br className="hidden md:block" />
              I nostri agenti lo analizzano e ti spiegano tutto.
            </motion.p>

            {/* Context prompt */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="w-full max-w-[var(--max-width-narrow)] mb-4"
            >
              <textarea
                value={contextPrompt}
                onChange={(e) => onContextChange(e.target.value)}
                placeholder="Descrivi il contesto: che tipo di documento e'? Hai dubbi specifici? (opzionale)"
                aria-label="Descrivi il contesto del documento"
                className="w-full px-4 py-3 rounded-[var(--radius-xl)] bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-tertiary)] resize-none focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/20 focus:outline-none transition-all"
                rows={2}
                maxLength={500}
              />
              {contextPrompt.trim() && (
                <p className="text-[var(--text-2xs)] text-[var(--foreground-tertiary)] mt-1 text-right">
                  {contextPrompt.length}/500
                </p>
              )}
            </motion.div>

            {/* Upload card */}
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="relative w-full max-w-[var(--max-width-narrow)]"
            >
              <div
                role="button"
                tabIndex={0}
                aria-label="Carica documento da analizzare"
                className={`relative rounded-[var(--radius-xl)] border transition-all duration-[var(--duration-normal)] cursor-pointer overflow-hidden ${
                  dragOver
                    ? "border-[var(--accent)]/70 bg-[var(--surface)] scale-[1.02] shadow-[var(--shadow-lg)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-md)]"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div className="flex flex-col items-center gap-3 px-6 py-6">
                  <motion.div
                    className="w-11 h-11 rounded-[var(--radius-xl)] flex items-center justify-center bg-[var(--accent-surface)] border border-[var(--accent)]/25"
                    animate={
                      dragOver
                        ? { scale: 1.15, rotate: 5 }
                        : { scale: 1, rotate: 0 }
                    }
                  >
                    {dragOver ? (
                      <FileText className="w-5 h-5 text-[var(--accent)]" />
                    ) : (
                      <Upload className="w-5 h-5 text-[var(--accent)]" />
                    )}
                  </motion.div>

                  <p className="text-sm text-[var(--foreground)]">
                    {dragOver
                      ? "Rilascia per analizzare"
                      : "Trascina qui il tuo documento oppure"}
                  </p>

                  <button
                    className="relative w-full max-w-[360px] px-8 py-3.5 rounded-[var(--radius-xl)] text-base font-bold text-white overflow-hidden hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    style={{
                      backgroundImage: "var(--cta-gradient)",
                      boxShadow: "var(--cta-shadow)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12"
                      animate={{ x: ["-200%", "200%"] }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                        repeatDelay: 2,
                      }}
                    />
                    <span className="relative z-10">Analizza il tuo documento</span>
                    <ArrowRight className="w-4 h-4 relative z-10" />
                  </button>

                  <p className="text-xs text-[var(--foreground-tertiary)] tracking-[var(--tracking-wide)]">
                    PDF · Word · Immagini · TXT · max 20MB
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Trust signals */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex gap-6 flex-wrap mt-5 text-[var(--foreground-tertiary)] text-xs"
            >
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Dati protetti
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Server in EU
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> 3 analisi gratis
              </span>
            </motion.div>
          </div>

          {/* RIGHT — Immagine a metà schermo, nessun overlay */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="flex-1 w-full md:w-1/2 relative"
          >
            <div className="relative w-full aspect-[4/5] md:aspect-[3/4] rounded-3xl overflow-hidden" style={{ boxShadow: "var(--shadow-xl)" }}>
              <Image
                src="/images/about-legal.png"
                alt="Analisi documenti legali"
                fill
                priority
                className="object-cover object-center"
                quality={90}
              />
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════
   Section 2 — "Parlami dei tuoi dubbi"
   ══════════════════════════════════════════════════════ */

function HeroDubbi() {
  return (
    <section className="relative min-h-[90vh] flex items-center bg-[var(--surface)] overflow-hidden">
      <div className="w-full max-w-[var(--max-width-wide)] mx-auto px-6 md:px-12 py-20">
        <div className="flex flex-col md:flex-row-reverse items-center gap-8 md:gap-12">

          {/* RIGHT — Text & chatbox on clean white */}
          <div className="flex-1 w-full md:w-1/2 text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6 text-sm text-[var(--foreground)] font-medium"
              style={{ borderColor: "var(--corpus-hero-badge-border)" }}
            >
              <MessageCircle className="w-4 h-4" style={{ color: "var(--corpus-hero-accent)" }} />
              Corpus normativo
            </motion.div>

            {/* Headline */}
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="font-serif font-black text-[var(--fluid-h1)] leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-[var(--foreground)] mb-4"
            >
              Parlami dei
              <br />
              <span className="italic bg-gradient-to-br from-[var(--corpus-hero-accent)] via-[var(--corpus-hero-dot)] to-[var(--corpus-primary)] bg-clip-text text-transparent">
                tuoi dubbi.
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-[var(--fluid-body)] text-[var(--foreground-secondary)] max-w-[460px] mb-8 leading-[var(--leading-relaxed)]"
            >
              Interroga il corpus normativo italiano.
              <br className="hidden md:block" />
              Norme, sentenze, prassi — tutto a portata di domanda.
            </motion.p>

            {/* Chat */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="w-full max-w-[var(--max-width-narrow)]"
            >
              <div
                className="rounded-[var(--radius-xl)] border overflow-hidden"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--card-border)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                {/* Chat header */}
                <div
                  className="px-5 py-3 border-b flex items-center gap-2"
                  style={{
                    borderColor: "var(--card-border)",
                    background: "var(--corpus-hero-header-bg)",
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: "var(--corpus-hero-dot)" }}
                  />
                  <span className="text-xs font-medium" style={{ color: "var(--corpus-hero-text)" }}>
                    Assistente legale AI
                  </span>
                </div>

                {/* Welcome message */}
                <div className="px-5 pt-5 pb-2">
                  <div className="flex gap-3">
                    <div
                      className="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
                      style={{ background: "var(--corpus-hero-icon-bg)" }}
                    >
                      <BookOpen className="w-3.5 h-3.5" style={{ color: "var(--corpus-hero-accent)" }} />
                    </div>
                    <div
                      className="rounded-[var(--radius-xl)] rounded-tl-sm px-4 py-2.5 max-w-[85%]"
                      style={{ background: "var(--corpus-hero-bubble-bg)" }}
                    >
                      <p className="text-sm text-[var(--foreground-secondary)]">
                        Ciao! Chiedimi qualsiasi dubbio legale. Consultero&apos; il
                        corpus normativo per darti una risposta fondata.
                      </p>
                    </div>
                  </div>
                </div>

                {/* CorpusChat */}
                <div className="px-4 pb-4 pt-2">
                  <CorpusChat variant="hero" />
                </div>
              </div>
            </motion.div>
          </div>

          {/* LEFT — Immagine a metà schermo */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="flex-1 w-full md:w-1/2 relative"
          >
            <div className="relative w-full aspect-[4/5] md:aspect-[3/4] rounded-3xl overflow-hidden" style={{ boxShadow: "var(--shadow-xl)" }}>
              <Image
                src="/images/Hero.webp"
                alt="Assistente legale AI"
                fill
                className="object-cover object-center"
                quality={90}
              />
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════
   Section 3 — "La legge compresa da tutti"
   ══════════════════════════════════════════════════════ */

function HeroBrand() {
  return (
    <section className="relative min-h-[90vh] flex items-center bg-[var(--surface)] overflow-hidden">
      <div className="w-full max-w-[var(--max-width-wide)] mx-auto px-6 md:px-12 py-20">
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">

          {/* LEFT — Brand text on clean white */}
          <div className="flex-1 w-full md:w-1/2 text-left">
            {/* Brand mark */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6 }}
              className="mb-4"
            >
              <span className="font-serif font-black text-[var(--fluid-brand)] leading-none tracking-[var(--tracking-tight)]">
                <span className="text-[var(--foreground)]">controlla</span>
                <span className="text-[var(--accent)]">.me</span>
              </span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="font-serif italic text-[var(--fluid-h2)] leading-[var(--leading-snug)] bg-clip-text text-transparent mb-6"
              style={{ backgroundImage: "linear-gradient(to bottom right, var(--accent), var(--gradient-warm-mid), var(--gradient-warm-end))" }}
            >
              La legge, compresa da tutti.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-[var(--fluid-body)] text-[var(--foreground-secondary)] max-w-[440px] mb-10 leading-[var(--leading-relaxed)]"
            >
              Un team di intelligenze artificiali specializzate che leggono,
              analizzano e ti spiegano i tuoi documenti legali — prima che sia
              troppo tardi.
            </motion.p>

            {/* CTA scroll */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                document
                  .getElementById("mission")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className="px-8 py-3.5 rounded-full text-sm font-medium text-[var(--foreground-secondary)] border border-[var(--border)] hover:border-[var(--accent)]/40 hover:text-[var(--foreground)] transition-all inline-flex items-center gap-2"
            >
              Scopri come funziona
              <ArrowDown className="w-4 h-4" />
            </motion.button>
          </div>

          {/* RIGHT — Immagine a metà schermo */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="flex-1 w-full md:w-1/2 relative"
          >
            <div className="relative w-full aspect-[4/5] md:aspect-[3/4] rounded-3xl overflow-hidden" style={{ boxShadow: "var(--shadow-xl)" }}>
              <Image
                src="/images/law-references.png"
                alt="Riferimenti normativi"
                fill
                className="object-cover object-center"
                quality={90}
              />
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════
   Main Hero — combines all 3 sections
   ══════════════════════════════════════════════════════ */

export default function HeroSection({
  onFileSelected,
  contextPrompt,
  onContextChange,
}: {
  onFileSelected: (file: File) => void;
  contextPrompt: string;
  onContextChange: (value: string) => void;
}) {
  return (
    <div>
      <HeroVerifica
        onFileSelected={onFileSelected}
        contextPrompt={contextPrompt}
        onContextChange={onContextChange}
      />
      <div className="section-divider" />
      <HeroDubbi />
      <div className="section-divider" />
      <HeroBrand />
    </div>
  );
}
