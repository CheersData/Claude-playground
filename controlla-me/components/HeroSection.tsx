"use client";

import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Shield, Upload, FileText, Lock, Globe, Sparkles } from "lucide-react";

/* ── Floating legal terms — atmospheric background ── */
function FloatingLegalElements() {
  const clauses = [
    "Art. 1341 c.c.", "clausola vessatoria", "recesso unilaterale",
    "penale contrattuale", "Art. 1375 c.c.", "buona fede",
    "nullita parziale", "Art. 33 Cod. Consumo", "foro competente",
    "tacito rinnovo", "Art. 1469-bis c.c.", "diritto di recesso",
    "Art. 1384 c.c.", "responsabilita limitata", "clausola compromissoria",
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {clauses.map((clause, i) => (
        <motion.div
          key={i}
          className="absolute text-[10px] md:text-xs font-mono text-white/[0.03] whitespace-nowrap select-none"
          style={{
            left: `${5 + (i * 6.5) % 90}%`,
            top: `${8 + (i * 11) % 84}%`,
          }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.05, 0.05, 0],
            y: [0, -40],
          }}
          transition={{
            duration: 10,
            delay: i * 0.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {clause}
        </motion.div>
      ))}
    </div>
  );
}

/* ── Scan line — sweeps across the hero ── */
function HeroScanLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 h-[1px] pointer-events-none z-0"
      style={{
        background: "linear-gradient(90deg, transparent, rgba(255,107,53,0.12), transparent)",
      }}
      animate={{ top: ["0%", "100%"] }}
      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
    />
  );
}

/* ── Main Hero ── */
export default function HeroSection({
  onFileSelected,
}: {
  onFileSelected: (file: File) => void;
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
    <div className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-24 pb-16 text-center z-10 overflow-hidden">
      {/* ═══ Animated gradient background — dramatic, visible, alive ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Primary glow — LARGE orange, very visible */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 1000,
            height: 1000,
            left: "50%",
            top: "40%",
            x: "-50%",
            y: "-50%",
            background:
              "radial-gradient(circle, rgba(255,107,53,0.25) 0%, rgba(255,107,53,0.08) 40%, transparent 65%)",
            filter: "blur(60px)",
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Secondary glow — warm amber, offset top-right */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 600,
            height: 600,
            left: "65%",
            top: "25%",
            x: "-50%",
            y: "-50%",
            background:
              "radial-gradient(circle, rgba(255,160,40,0.18) 0%, rgba(255,140,30,0.04) 50%, transparent 70%)",
            filter: "blur(50px)",
          }}
          animate={{
            scale: [1.15, 0.85, 1.15],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Tertiary glow — teal accent, bottom-left */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 450,
            height: 450,
            left: "30%",
            top: "62%",
            x: "-50%",
            y: "-50%",
            background:
              "radial-gradient(circle, rgba(78,205,196,0.12) 0%, transparent 65%)",
            filter: "blur(40px)",
          }}
          animate={{
            scale: [0.85, 1.2, 0.85],
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Fourth glow — deep purple accent, subtle, adds depth */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 400,
            height: 400,
            left: "75%",
            top: "60%",
            x: "-50%",
            y: "-50%",
            background:
              "radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 65%)",
            filter: "blur(45px)",
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <FloatingLegalElements />
      <HeroScanLine />

      {/* ═══ Content ═══ */}

      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/[0.08] border border-accent/20 mb-8 text-sm text-white/70 font-medium"
      >
        <Shield className="w-4 h-4 text-accent" />
        4 agenti AI · Risultati in 30 secondi
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.7 }}
        className="font-serif text-[clamp(42px,8vw,88px)] leading-[1.02] tracking-[-0.02em] max-w-[800px] mb-6"
      >
        Non firmare nulla
        <br />
        <span className="italic bg-gradient-to-br from-accent via-orange-400 to-amber-400 bg-clip-text text-transparent">
          che non capisci.
        </span>
      </motion.h1>

      {/* Subheadline */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="text-lg md:text-xl leading-relaxed text-white/45 max-w-[560px] mb-10"
      >
        Carica un contratto, una bolletta, qualsiasi documento legale.
        <br className="hidden md:block" />
        Quattro agenti AI lo analizzano e ti dicono esattamente cosa rischi.
      </motion.p>

      {/* ═══ Upload Card — the hero action ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.7 }}
        className="relative w-full max-w-[520px]"
      >
        {/* Glow behind card — strong, visible */}
        <div className="absolute -inset-3 rounded-3xl bg-gradient-to-b from-accent/25 via-accent/10 to-amber-500/5 blur-2xl" />
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-accent/20 via-transparent to-amber-500/10 blur-md" />

        {/* Card */}
        <div
          className={`relative rounded-2xl border transition-all duration-300 cursor-pointer backdrop-blur-md ${
            dragOver
              ? "border-accent/70 bg-accent/[0.12] scale-[1.02] shadow-[0_0_60px_rgba(255,107,53,0.15)]"
              : "border-white/[0.12] bg-white/[0.04] hover:border-accent/30 hover:bg-white/[0.06] hover:shadow-[0_0_40px_rgba(255,107,53,0.08)]"
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
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex flex-col items-center gap-5 px-8 py-10">
            {/* Icon */}
            <motion.div
              className="w-14 h-14 rounded-2xl flex items-center justify-center bg-accent/[0.1] border border-accent/20"
              animate={dragOver ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
            >
              {dragOver ? (
                <FileText className="w-6 h-6 text-accent" />
              ) : (
                <Upload className="w-6 h-6 text-accent" />
              )}
            </motion.div>

            {/* Text */}
            <div className="text-center">
              <p className="text-base font-semibold text-white/80 mb-1">
                {dragOver ? "Rilascia per analizzare" : "Trascina qui il tuo documento"}
              </p>
              <p className="text-sm text-white/30">oppure clicca per selezionare</p>
            </div>

            {/* CTA Button */}
            <button
              className="relative px-10 py-4 rounded-full text-base font-bold text-white overflow-hidden group bg-gradient-to-r from-accent to-amber-500 hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.98] transition-all"
              style={{ boxShadow: "0 12px 40px rgba(255,107,53,0.3)" }}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              {/* Shimmer */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                animate={{ x: ["-200%", "200%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
              />
              <span className="relative z-10">Analizza il tuo documento</span>
            </button>

            {/* Formats */}
            <p className="text-xs text-white/20 tracking-wide">
              PDF · Word · Immagini · TXT · max 20MB
            </p>
          </div>
        </div>
      </motion.div>

      {/* ═══ Trust signals ═══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="flex gap-6 flex-wrap justify-center mt-8 text-white/30 text-xs"
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

      {/* ═══ Scroll hint ═══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-14 flex flex-col items-center gap-2 text-white/15"
      >
        <span className="text-[10px] tracking-[2px] uppercase">Scopri come funziona</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
