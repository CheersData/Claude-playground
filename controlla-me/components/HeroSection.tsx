"use client";

import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Shield, Upload, FileText, Lock, Globe, Sparkles, ArrowRight } from "lucide-react";

/* ── Scan line — sweeps across the hero ── */
function HeroScanLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 h-[1px] pointer-events-none z-[2]"
      style={{
        background: "linear-gradient(90deg, transparent, rgba(255,107,53,0.18), transparent)",
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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* ═══ Layer 0: Background image ═══ */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/Hero.webp"
          alt=""
          fill
          priority
          className="object-cover object-center"
          quality={90}
        />
        {/* Dark overlay — heavy center for text readability, lighter at edges */}
        <div
          className="absolute inset-0"
          style={{
            background: [
              "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(10,10,10,0.88) 0%, rgba(10,10,10,0.65) 60%, rgba(10,10,10,0.45) 100%)",
            ].join(", "),
          }}
        />
        {/* Bottom fade to seamless section transition */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
      </div>

      {/* ═══ Layer 1: Animated gradient glow (on top of image) ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
        {/* Primary orange glow */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 900,
            height: 900,
            left: "50%",
            top: "45%",
            x: "-50%",
            y: "-50%",
            background:
              "radial-gradient(circle, rgba(255,107,53,0.20) 0%, rgba(255,107,53,0.06) 40%, transparent 65%)",
            filter: "blur(60px)",
          }}
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.5, 0.9, 0.5],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Amber accent, top-right */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 500,
            height: 500,
            left: "68%",
            top: "25%",
            x: "-50%",
            y: "-50%",
            background:
              "radial-gradient(circle, rgba(255,160,40,0.12) 0%, transparent 70%)",
            filter: "blur(50px)",
          }}
          animate={{
            scale: [1.1, 0.9, 1.1],
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <HeroScanLine />

      {/* ═══ Layer 2: Content ═══ */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 pt-28 pb-20 w-full max-w-[680px]">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-accent/25 backdrop-blur-sm mb-8 text-sm text-white/70 font-medium"
        >
          <Shield className="w-4 h-4 text-accent" />
          4 agenti AI · Risultati in 30 secondi
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.7 }}
          className="font-serif text-[clamp(42px,8vw,88px)] leading-[1.02] tracking-[-0.02em] max-w-[800px] mb-5"
          style={{ textShadow: "0 4px 30px rgba(0,0,0,0.5)" }}
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
          className="text-lg md:text-xl leading-relaxed text-white/50 max-w-[520px] mb-10"
          style={{ textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}
        >
          Carica un contratto, una bolletta, qualsiasi documento legale.
          <br className="hidden md:block" />
          Quattro agenti AI lo analizzano e ti dicono cosa rischi.
        </motion.p>

        {/* ═══ Upload Card — prominent, glowing ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
          className="relative w-full max-w-[520px]"
        >
          {/* Outer glow */}
          <div className="absolute -inset-4 rounded-3xl bg-accent/15 blur-3xl" />
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-b from-accent/20 via-accent/5 to-transparent blur-xl" />

          {/* Card */}
          <div
            className={`relative rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden ${
              dragOver
                ? "border-accent/70 bg-black/60 scale-[1.02] shadow-[0_0_80px_rgba(255,107,53,0.2)]"
                : "border-white/[0.15] bg-black/50 backdrop-blur-xl hover:border-accent/40 hover:shadow-[0_0_60px_rgba(255,107,53,0.1)]"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="flex flex-col items-center gap-4 px-8 py-8">
              {/* Icon */}
              <motion.div
                className="w-12 h-12 rounded-xl flex items-center justify-center bg-accent/[0.12] border border-accent/25"
                animate={dragOver ? { scale: 1.15, rotate: 5 } : { scale: 1, rotate: 0 }}
              >
                {dragOver ? (
                  <FileText className="w-5 h-5 text-accent" />
                ) : (
                  <Upload className="w-5 h-5 text-accent" />
                )}
              </motion.div>

              {/* Text */}
              <p className="text-sm text-white/40">
                {dragOver ? "Rilascia per analizzare" : "Trascina qui il tuo documento oppure"}
              </p>

              {/* CTA Button — THE main action */}
              <button
                className="relative w-full max-w-[360px] px-8 py-4 rounded-xl text-base font-bold text-white overflow-hidden bg-gradient-to-r from-accent to-amber-500 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                style={{ boxShadow: "0 8px 32px rgba(255,107,53,0.35), 0 0 0 1px rgba(255,107,53,0.1)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                {/* Shimmer */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12"
                  animate={{ x: ["-200%", "200%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
                />
                <span className="relative z-10">Analizza il tuo documento</span>
                <ArrowRight className="w-4 h-4 relative z-10" />
              </button>

              {/* Formats */}
              <p className="text-xs text-white/25 tracking-wide">
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
          className="flex gap-6 flex-wrap justify-center mt-8 text-white/35 text-xs"
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
          className="mt-12 flex flex-col items-center gap-2 text-white/20"
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
    </div>
  );
}
