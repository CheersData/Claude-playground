"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Shield } from "lucide-react";
import { AgentAvatar, agents } from "./TeamSection";

/* ── Typewriter effect ── */
function Typewriter({ phrases, speed = 60, pause = 2000 }: { phrases: string[]; speed?: number; pause?: number }) {
  const [text, setText] = useState("");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = phrases[phraseIdx];
    if (!deleting && charIdx < current.length) {
      const t = setTimeout(() => { setText(current.slice(0, charIdx + 1)); setCharIdx(charIdx + 1); }, speed);
      return () => clearTimeout(t);
    }
    if (!deleting && charIdx === current.length) {
      const t = setTimeout(() => setDeleting(true), pause);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx > 0) {
      const t = setTimeout(() => { setText(current.slice(0, charIdx - 1)); setCharIdx(charIdx - 1); }, speed / 2);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx === 0) {
      setDeleting(false);
      setPhraseIdx((phraseIdx + 1) % phrases.length);
    }
  }, [charIdx, deleting, phraseIdx, phrases, speed, pause]);

  return (
    <span>
      {text}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
        className="text-accent"
      >
        |
      </motion.span>
    </span>
  );
}

/* ── Floating legal paragraph elements ── */
function FloatingLegalElements() {
  const clauses = [
    "Art. 1341 c.c.",
    "clausola vessatoria",
    "recesso unilaterale",
    "penale contrattuale",
    "Art. 1375 c.c.",
    "buona fede",
    "nullita parziale",
    "Art. 33 Cod. Consumo",
    "foro competente",
    "tacito rinnovo",
    "Art. 1469-bis c.c.",
    "diritto di recesso",
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {clauses.map((clause, i) => (
        <motion.div
          key={i}
          className="absolute text-[10px] md:text-xs font-mono text-white/[0.04] whitespace-nowrap select-none"
          style={{
            left: `${5 + (i * 7.5) % 90}%`,
            top: `${10 + (i * 13) % 80}%`,
          }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.06, 0.06, 0],
            y: [0, -30],
          }}
          transition={{
            duration: 8,
            delay: i * 0.7,
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

/* ── Animated scan line across the hero ── */
function HeroScanLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 h-[1px] pointer-events-none z-0"
      style={{
        background: "linear-gradient(90deg, transparent, rgba(255,107,53,0.15), transparent)",
      }}
      animate={{
        top: ["0%", "100%"],
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: "linear",
      }}
    />
  );
}

export default function HeroSection({ onScrollToUpload }: { onScrollToUpload: () => void }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!heroRef.current) return;
      const rect = heroRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX.set(x);
      mouseY.set(y);
    },
    [mouseX, mouseY]
  );

  const avatarX = useTransform(mouseX, [-0.5, 0.5], [-12, 12]);
  const avatarY = useTransform(mouseY, [-0.5, 0.5], [-12, 12]);

  return (
    <div
      ref={heroRef}
      onMouseMove={handleMouseMove}
      className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-28 pb-16 text-center z-10 overflow-hidden"
    >
      <FloatingLegalElements />
      <HeroScanLine />

      {/* Radial spotlight */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(255,107,53,0.06), transparent)",
        }}
      />

      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/[0.08] border border-accent/20 mb-8 text-sm text-white/70 font-medium"
      >
        <Shield className="w-4 h-4 text-accent" />
        Studio legale AI — 4 consulenti, 30 secondi
      </motion.div>

      {/* Main headline */}
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.7 }}
        className="font-serif text-[clamp(40px,7vw,80px)] leading-[1.05] max-w-[800px] mb-6"
      >
        Non firmare nulla
        <br />
        <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
          che non capisci.
        </span>
      </motion.h1>

      {/* Typewriter sub-headline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-lg md:text-xl leading-relaxed text-white/40 max-w-[600px] mb-4 h-[60px] flex items-center justify-center"
      >
        <Typewriter
          phrases={[
            "Contratto d'affitto? Analizzo le clausole vessatorie.",
            "Preliminare di vendita? Trovo le trappole nascoste.",
            "Bolletta sospetta? Verifico la legittimita.",
            "Contratto di lavoro? Controllo i tuoi diritti.",
          ]}
          speed={45}
          pause={2500}
        />
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-sm text-white/25 mb-10 max-w-[500px]"
      >
        Carica un documento. Quattro consulenti AI lo analizzano in profondita:
        classificazione, clausole rischiose, norme applicabili e consiglio finale.
      </motion.p>

      {/* 4 Avatars in a row with parallax */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.7 }}
        style={{ x: avatarX, y: avatarY }}
        className="flex items-end justify-center gap-4 md:gap-6 mb-10"
      >
        {agents.map((agent, i) => (
          <motion.div
            key={agent.phase}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + i * 0.12 }}
            className="flex flex-col items-center gap-2"
          >
            <AgentAvatar variant={agent.variant} color={agent.color} size="md" delay={0.6 + i * 0.12} />
            <span className="text-xs font-medium text-white/30">{agent.name}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* CTA button */}
      <motion.button
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        whileHover={{ scale: 1.04, y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={onScrollToUpload}
        className="px-10 py-4 rounded-full text-base font-bold text-white transition-all bg-gradient-to-r from-accent to-amber-500 relative overflow-hidden group"
        style={{ boxShadow: "0 12px 40px rgba(255,107,53,0.3)" }}
      >
        {/* Shimmer effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
          animate={{ x: ["-200%", "200%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
        />
        <span className="relative z-10">Analizza un documento</span>
      </motion.button>

      {/* Scroll hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
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
