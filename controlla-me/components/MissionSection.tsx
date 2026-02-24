"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { BookOpen, Eye, Scale, MessageCircle, Database } from "lucide-react";
import { agents } from "./TeamSection";
import Image from "next/image";

/* ── Animated counter ── */
function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = value / 40;
    const interval = setInterval(() => {
      start += step;
      if (start >= value) {
        setDisplay(value);
        clearInterval(interval);
      } else {
        setDisplay(Math.floor(start));
      }
    }, 30);
    return () => clearInterval(interval);
  }, [inView, value]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

/* ── Mini SVG illustrations for hover state ── */

function ClassifierMiniIllustration() {
  return (
    <svg viewBox="0 0 80 60" className="w-16 h-12">
      <rect x="4" y="2" width="40" height="52" rx="3" fill="rgba(26,26,46,0.08)" stroke="#4ECDC4" strokeWidth="1.5" />
      <rect x="12" y="14" width="24" height="2.5" rx="1" fill="rgba(26,26,46,0.3)" />
      <rect x="12" y="20" width="18" height="2.5" rx="1" fill="rgba(26,26,46,0.2)" />
      <rect x="12" y="26" width="28" height="2.5" rx="1" fill="rgba(26,26,46,0.25)" />
      <rect x="12" y="32" width="20" height="2.5" rx="1" fill="rgba(26,26,46,0.2)" />
      <motion.line
        x1="8" y1="12" x2="40" y2="12"
        stroke="#4ECDC4" strokeWidth="2" strokeLinecap="round"
        animate={{ y1: [10, 40, 10], y2: [10, 40, 10] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

function AnalyzerMiniIllustration() {
  return (
    <svg viewBox="0 0 80 60" className="w-16 h-12">
      <rect x="8" y="8" width="40" height="3" rx="1.5" fill="rgba(26,26,46,0.25)" />
      <rect x="8" y="15" width="30" height="3" rx="1.5" fill="rgba(26,26,46,0.2)" />
      <rect x="6" y="22" width="44" height="8" rx="2" fill="rgba(255,107,53,0.15)" stroke="rgba(255,107,53,0.3)" strokeWidth="0.8" />
      <rect x="8" y="34" width="35" height="3" rx="1.5" fill="rgba(26,26,46,0.2)" />
      <motion.circle
        cx="58" cy="26" r="10"
        fill="rgba(255,107,53,0.1)" stroke="#FF6B6B" strokeWidth="1.5"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

function InvestigatorMiniIllustration() {
  return (
    <svg viewBox="0 0 80 60" className="w-16 h-12">
      <rect x="36" y="4" width="6" height="30" rx="2" fill="rgba(26,26,46,0.1)" />
      <motion.g style={{ transformOrigin: "39px 10px" }} animate={{ rotate: [-5, 5, -5] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        <line x1="14" y1="10" x2="64" y2="10" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="18" cy="28" rx="10" ry="3" fill="rgba(167,139,250,0.3)" stroke="#A78BFA" strokeWidth="0.8" />
        <ellipse cx="60" cy="28" rx="10" ry="3" fill="rgba(167,139,250,0.3)" stroke="#A78BFA" strokeWidth="0.8" />
      </motion.g>
      <text x="8" y="48" fontSize="5" fill="rgba(167,139,250,0.7)" fontFamily="monospace">Art. 1341</text>
      <text x="42" y="52" fontSize="5" fill="rgba(167,139,250,0.6)" fontFamily="monospace">D.Lgs 122</text>
    </svg>
  );
}

function AdvisorMiniIllustration() {
  return (
    <svg viewBox="0 0 80 60" className="w-16 h-12">
      <motion.circle
        cx="40" cy="22" r="12"
        fill="rgba(255,200,50,0.15)" stroke="rgba(255,200,50,0.7)" strokeWidth="1.5"
        animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <path d="M35 24 Q37 18 40 22 Q43 18 45 24" fill="none" stroke="#FFC832" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="35" y="34" width="10" height="5" rx="1.5" fill="rgba(26,26,46,0.1)" />
      <rect x="22" y="46" width="14" height="2" rx="1" fill="rgba(255,200,50,0.3)" />
      <rect x="44" y="46" width="14" height="2" rx="1" fill="rgba(255,200,50,0.3)" />
    </svg>
  );
}

const MINI_ILLUSTRATIONS = [
  ClassifierMiniIllustration,
  AnalyzerMiniIllustration,
  InvestigatorMiniIllustration,
  AdvisorMiniIllustration,
];

const steps = [
  {
    icon: BookOpen,
    label: "Classificazione",
    desc: "Read cataloga il tipo di documento e le parti coinvolte",
    descExpanded:
      "Identifica tipo di documento, parti coinvolte, leggi applicabili e date chiave. Cataloga tutto per passare il contesto completo ai colleghi.",
    color: agents[0].color,
    image: "/images/confidential-docs.png",
    usesCorpus: false,
  },
  {
    icon: Eye,
    label: "Analisi",
    desc: "Understand trova le clausole rischiose e gli squilibri",
    descExpanded:
      "Analizza ogni clausola cercando squilibri, rischi e elementi mancanti. Interroga il corpus normativo aggiornato per verificare la correttezza dei riferimenti legislativi.",
    color: agents[1].color,
    image: "/images/clause-analysis.png",
    usesCorpus: true,
  },
  {
    icon: Scale,
    label: "Verifica legale",
    desc: "Investigate cerca norme, sentenze e precedenti",
    descExpanded:
      "Ricerca norme vigenti, sentenze recenti e precedenti giurisprudenziali attraverso il corpus normativo aggiornato e fonti web autorevoli.",
    color: agents[2].color,
    image: "/images/law-references.png",
    usesCorpus: true,
  },
  {
    icon: MessageCircle,
    label: "Consiglio",
    desc: "Advisor ti spiega tutto e ti suggerisce cosa verificare",
    descExpanded:
      "Genera un report completo con scoring su aderenza legale, equilibrio contrattuale e prassi di settore. Ti suggerisce azioni concrete e verifiche da fare.",
    color: agents[3].color,
    image: "/images/checklist-results.png",
    usesCorpus: false,
  },
];

export default function MissionSection() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  return (
    <section className="relative z-10 px-6 py-24">
      <div className="max-w-[1100px] mx-auto">
        {/* ═══ Mission header with image ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[32px] border border-border bg-white shadow-sm mb-8"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(255,107,53,0.06), transparent 60%)",
            }}
          />

          <div className="relative px-8 md:px-14 py-12 md:py-16">
            <div className="grid md:grid-cols-[1fr_360px] gap-10 items-center mb-0">
              <div className="text-center md:text-left">
                <motion.p
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  className="text-[11px] font-bold tracking-[3px] uppercase text-accent/70 mb-4"
                >
                  La nostra missione
                </motion.p>
                <motion.h2
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 }}
                  className="font-serif text-2xl md:text-4xl leading-snug max-w-[600px] mb-6"
                >
                  Rendere la legge accessibile a{" "}
                  <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
                    chi non la conosce.
                  </span>
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                  className="text-base text-foreground-secondary max-w-[520px] leading-relaxed"
                >
                  Ogni giorno milioni di persone firmano documenti senza capirli
                  davvero. Noi mettiamo a disposizione un team di AI
                  specializzate che leggono, analizzano e ti spiegano tutto —
                  prima che sia troppo tardi.
                </motion.p>
              </div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="hidden md:block relative"
              >
                <div className="relative w-[360px] h-[280px] rounded-2xl overflow-hidden border border-border">
                  <Image
                    src="/images/about-legal.png"
                    alt="Analisi legale cubista"
                    fill
                    className="object-cover"
                    quality={90}
                    sizes="360px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent" />
                </div>
                <div className="absolute -inset-6 rounded-3xl bg-accent/5 blur-3xl -z-10" />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* ═══ How it works — 4 steps with hover expand ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-center mb-8"
        >
          <p className="text-[11px] font-bold tracking-[3px] uppercase text-accent/70 mb-3">
            Come funziona
          </p>
          <h3 className="font-serif text-xl md:text-2xl text-foreground">
            4 agenti, pochi attimi, zero dubbi.
          </h3>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {steps.map((step, i) => {
            const isHovered = hoveredCard === i;
            const MiniIllustration = MINI_ILLUSTRATIONS[i];

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.1 }}
                onMouseEnter={() => setHoveredCard(i)}
                onMouseLeave={() => setHoveredCard(null)}
                className="group relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm cursor-default"
                style={{
                  transition: "transform 0.4s ease, box-shadow 0.4s ease, z-index 0s",
                  transform: isHovered ? "scale(1.06)" : "scale(1)",
                  zIndex: isHovered ? 10 : 1,
                  boxShadow: isHovered
                    ? `0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px ${step.color}30`
                    : undefined,
                }}
              >
                {/* Image */}
                <div className="relative h-[240px] md:h-[280px] overflow-hidden">
                  <Image
                    src={step.image}
                    alt={step.label}
                    fill
                    className="object-cover"
                    style={{
                      transition: "transform 0.7s ease",
                      transform: isHovered ? "scale(1.08)" : "scale(1)",
                    }}
                    quality={90}
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-transparent" />

                  <div
                    className="absolute top-4 left-4 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold backdrop-blur-sm"
                    style={{
                      background: `${step.color}30`,
                      color: step.color,
                      border: `1px solid ${step.color}40`,
                    }}
                  >
                    {i + 1}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 md:p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${step.color}15` }}
                    >
                      <step.icon className="w-4 h-4" style={{ color: step.color }} />
                    </div>
                    <p className="text-base font-semibold">{step.label}</p>
                  </div>

                  <p className="text-sm text-foreground-secondary leading-relaxed">
                    {step.desc}
                  </p>

                  {/* Expanded content on hover */}
                  <AnimatePresence>
                    {isHovered && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="shrink-0">
                              <MiniIllustration />
                            </div>
                            <p className="text-sm text-foreground-secondary leading-relaxed">
                              {step.descExpanded}
                            </p>
                          </div>

                          {step.usesCorpus && (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/5 border border-accent/15 text-xs font-medium text-accent">
                              <Database className="w-3 h-3" />
                              Interroga il corpus normativo aggiornato
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Bottom accent line */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${step.color}40, transparent)`,
                  }}
                />
              </motion.div>
            );
          })}
        </div>

        {/* Timeline bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="relative h-1 rounded-full bg-white shadow-sm mb-10 mx-4 hidden md:block"
        >
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: "100%" }}
            viewport={{ once: true }}
            transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#4ECDC4] via-[#FF6B6B] via-[#A78BFA] to-[#FFC832]"
          />
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 + i * 0.4, type: "spring" }}
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
              style={{
                left: `${i * 33.33}%`,
                background: step.color,
                boxShadow: `0 0 12px ${step.color}50`,
              }}
            />
          ))}
        </motion.div>

        {/* Stats */}
        <div className="relative overflow-hidden rounded-[32px] border border-border bg-white shadow-sm">
          <div className="grid grid-cols-3 gap-4 px-8 md:px-14 py-8">
            {[
              { value: 4, suffix: "", label: "Consulenti AI" },
              { value: 100, suffix: "+", label: "Norme verificate" },
              { value: 1000, suffix: "+", label: "Articoli nel corpus" },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="text-center"
              >
                <p className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-[#1A1A1A] to-[#1A1A1A]/50 bg-clip-text text-transparent">
                  <Counter value={stat.value} suffix={stat.suffix} />
                </p>
                <p className="text-xs text-foreground-tertiary mt-1">
                  {stat.label}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
