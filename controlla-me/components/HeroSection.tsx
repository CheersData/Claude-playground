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
            className={`relative transition-all duration-500 ${
              phase === "strike"
                ? "line-through decoration-red-500 decoration-[3px] text-red-500/70"
                : ""
            }`}
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
                stroke="#EF4444"
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
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/about-legal.png"
          alt=""
          fill
          priority
          className="object-cover object-center"
          quality={90}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.88) 60%, rgba(255,255,255,0.7) 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-[680px] mx-auto px-6 pt-28 pb-16 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 border border-accent/25 mb-8 text-sm text-foreground font-medium"
        >
          <Sparkles className="w-4 h-4 text-accent" />4 agenti AI al tuo
          servizio
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="font-serif text-[clamp(38px,7vw,76px)] leading-[1.05] tracking-[-0.02em] mb-4"
        >
          Ti verifico
          <br />
          <span className="italic bg-gradient-to-br from-accent via-orange-400 to-amber-400 bg-clip-text text-transparent">
            il documento.
          </span>
        </motion.h1>

        {/* Animated strike words */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-lg text-foreground-secondary mb-3 h-10 flex items-center justify-center"
        >
          <span className="mr-2">Troviamo</span>
          <TextStrikeAnimation />
        </motion.div>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-base text-foreground-secondary max-w-[500px] mx-auto mb-8 leading-relaxed"
        >
          Carica un contratto, una bolletta, qualsiasi documento legale.
          <br className="hidden md:block" />I nostri agenti lo analizzano e ti
          spiegano cosa verificare.
        </motion.p>

        {/* Context prompt */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-[520px] mx-auto mb-4"
        >
          <textarea
            value={contextPrompt}
            onChange={(e) => onContextChange(e.target.value)}
            placeholder="Descrivi il contesto: che tipo di documento e'? Hai dubbi specifici? (opzionale)"
            className="w-full px-4 py-3 rounded-xl bg-white border border-border text-sm text-foreground placeholder:text-foreground-tertiary resize-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20 focus:outline-none transition-all"
            rows={2}
          />
        </motion.div>

        {/* Upload card */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="relative w-full max-w-[520px] mx-auto"
        >
          <div className="absolute -inset-4 rounded-3xl bg-accent/10 blur-3xl" />
          <div
            className={`relative rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden ${
              dragOver
                ? "border-accent/70 bg-white scale-[1.02] shadow-lg"
                : "border-border bg-white hover:border-accent/40 hover:shadow-md"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="flex flex-col items-center gap-3 px-8 py-7">
              <motion.div
                className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent/[0.12] border border-accent/25"
                animate={
                  dragOver
                    ? { scale: 1.15, rotate: 5 }
                    : { scale: 1, rotate: 0 }
                }
              >
                {dragOver ? (
                  <FileText className="w-5 h-5 text-accent" />
                ) : (
                  <Upload className="w-5 h-5 text-accent" />
                )}
              </motion.div>

              <p className="text-sm text-foreground">
                {dragOver
                  ? "Rilascia per analizzare"
                  : "Trascina qui il tuo documento oppure"}
              </p>

              <button
                className="relative w-full max-w-[360px] px-8 py-3.5 rounded-xl text-base font-bold text-white overflow-hidden bg-gradient-to-r from-accent to-amber-500 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                style={{
                  boxShadow:
                    "0 8px 32px rgba(255,107,53,0.35), 0 0 0 1px rgba(255,107,53,0.1)",
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

              <p className="text-xs text-foreground-tertiary tracking-wide">
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
          className="flex gap-6 flex-wrap justify-center mt-6 text-foreground-tertiary text-xs"
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
    </section>
  );
}

/* ══════════════════════════════════════════════════════
   Section 2 — "Parlami dei tuoi dubbi"
   ══════════════════════════════════════════════════════ */

function HeroDubbi() {
  const [mockInput, setMockInput] = useState("");

  return (
    <section className="relative min-h-[80vh] flex items-center overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/Hero.webp"
          alt=""
          fill
          className="object-cover object-center"
          quality={90}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 60%, rgba(255,255,255,0.68) 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-[680px] mx-auto px-6 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 border border-purple-300/30 mb-8 text-sm text-foreground font-medium"
        >
          <MessageCircle className="w-4 h-4 text-purple-500" />
          Corpus normativo in costruzione
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="font-serif text-[clamp(32px,6vw,64px)] leading-[1.08] tracking-[-0.02em] mb-4"
        >
          Parlami dei
          <br />
          <span className="italic bg-gradient-to-br from-purple-500 via-purple-400 to-violet-400 bg-clip-text text-transparent">
            tuoi dubbi.
          </span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-base text-foreground-secondary max-w-[480px] mx-auto mb-10 leading-relaxed"
        >
          Una chatbox che interroga il corpus normativo italiano per rispondere
          alle tue domande legali. Norme, sentenze, prassi — tutto a portata di
          domanda.
        </motion.p>

        {/* Mock chatbox */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="w-full max-w-[520px] mx-auto"
        >
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            {/* Chat header */}
            <div className="px-5 py-3 border-b border-border bg-purple-50/50 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-xs font-medium text-purple-600">
                Assistente legale AI
              </span>
              <span className="text-xs text-foreground-tertiary ml-auto">
                Prossimamente
              </span>
            </div>

            {/* Mock messages */}
            <div className="px-5 py-6 space-y-4">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <BookOpen className="w-3.5 h-3.5 text-purple-500" />
                </div>
                <div className="bg-purple-50 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%]">
                  <p className="text-sm text-foreground-secondary">
                    Ciao! Chiedimi qualsiasi dubbio legale. Consultero' il
                    corpus normativo per darti una risposta fondata.
                  </p>
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="px-4 pb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mockInput}
                  onChange={(e) => setMockInput(e.target.value)}
                  placeholder="Chiedimi qualsiasi dubbio legale..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-background-secondary border border-border text-sm placeholder:text-foreground-tertiary focus:border-purple-300 focus:ring-2 focus:ring-purple-200/50 focus:outline-none transition-all"
                />
                <button className="px-4 py-2.5 rounded-xl bg-purple-500 text-white text-sm font-medium opacity-50 cursor-not-allowed">
                  Invia
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════
   Section 3 — "La legge compresa da tutti"
   ══════════════════════════════════════════════════════ */

function HeroBrand() {
  return (
    <section className="relative min-h-[70vh] flex items-center overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/law-references.png"
          alt=""
          fill
          className="object-cover object-center"
          quality={90}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.88) 60%, rgba(255,255,255,0.72) 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-[680px] mx-auto px-6 py-20 text-center">
        {/* Brand mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mb-6"
        >
          <span className="font-serif text-[clamp(48px,9vw,96px)] leading-none tracking-[-0.03em]">
            <span className="text-foreground">controlla</span>
            <span className="text-accent">.me</span>
          </span>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="font-serif italic text-[clamp(20px,4vw,36px)] leading-snug bg-gradient-to-br from-accent via-orange-400 to-amber-400 bg-clip-text text-transparent mb-6"
        >
          La legge, compresa da tutti.
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-base text-foreground-secondary max-w-[440px] mx-auto mb-10 leading-relaxed"
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
          className="px-8 py-3.5 rounded-full text-sm font-medium text-foreground-secondary border border-border hover:border-accent/40 hover:text-foreground transition-all inline-flex items-center gap-2"
        >
          Scopri come funziona
          <ArrowDown className="w-4 h-4" />
        </motion.button>
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
