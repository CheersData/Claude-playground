"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { BookOpen, Eye, Scale, MessageCircle } from "lucide-react";
import { AgentAvatar, agents } from "./TeamSection";
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

  return <span ref={ref}>{display}{suffix}</span>;
}

/* ── Step data (linked to agents) ── */
const steps = [
  {
    icon: BookOpen,
    label: "Classificazione",
    desc: "Legge il documento da cima a fondo. Identifica tipo, parti coinvolte, leggi applicabili.",
    color: agents[0].color,
    duration: "~5s",
    agent: agents[0],
  },
  {
    icon: Eye,
    label: "Analisi",
    desc: "Rilegge ogni clausola col microscopio. Trova trappole nascoste e squilibri.",
    color: agents[1].color,
    duration: "~10s",
    agent: agents[1],
  },
  {
    icon: Scale,
    label: "Verifica legale",
    desc: "Cerca norme vigenti, sentenze della Cassazione e precedenti rilevanti.",
    color: agents[2].color,
    duration: "~10s",
    agent: agents[2],
  },
  {
    icon: MessageCircle,
    label: "Consiglio",
    desc: "Ti dice cosa rischi e cosa fare — in parole semplici.",
    color: agents[3].color,
    duration: "~5s",
    agent: agents[3],
  },
];

/* ── Single expandable card ── */
function AgentStepCard({ step, index }: { step: typeof steps[number]; index: number }) {
  const [hovered, setHovered] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  const handleMouseEnter = () => {
    setHovered(true);
    setQuoteIndex(Math.floor(Math.random() * step.agent.hoverQuotes.length));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
      className="group relative cursor-pointer"
    >
      <motion.div
        layout
        className="relative overflow-hidden rounded-3xl border border-border bg-white shadow-sm transition-all duration-500"
        style={{
          boxShadow: hovered
            ? `0 0 60px ${step.color}15, 0 20px 60px ${step.color}10`
            : "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Hover gradient overlay */}
        <div
          className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${step.color}12, transparent 40%, transparent 60%, ${step.color}08)`,
          }}
        />

        {/* Top glow stripe */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `linear-gradient(90deg, transparent, ${step.color}80, transparent)` }}
        />

        <div className="relative p-6 md:p-7">
          {/* Header row: step badge + duration */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold"
                style={{ background: `${step.color}20`, color: step.color, border: `1px solid ${step.color}30` }}
              >
                {index + 1}
              </div>
              <span className="text-[10px] font-bold tracking-[2px] uppercase" style={{ color: `${step.color}90` }}>
                Fase {index + 1}
              </span>
            </div>
            <div className="px-3 py-1 rounded-lg bg-background-secondary text-[11px] font-mono text-foreground-tertiary border border-border">
              {step.duration}
            </div>
          </div>

          {/* Avatar + Agent info */}
          <div className="flex flex-col items-center text-center">
            {/* Animated avatar with hover scale */}
            <motion.div
              animate={hovered ? { scale: 1.1 } : { scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative mb-4"
            >
              <AgentAvatar
                variant={step.agent.variant}
                color={step.color}
                size="md"
                delay={index * 0.08}
              />
              {/* Hover glow ring */}
              <motion.div
                className="absolute inset-[-6px] rounded-full pointer-events-none"
                style={{ border: `2px solid ${step.color}` }}
                animate={hovered ? { opacity: 0.35, scale: 1.08 } : { opacity: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
              />
            </motion.div>

            {/* Agent name + role */}
            <h3 className="text-lg md:text-xl font-bold mb-0.5">{step.agent.name}</h3>
            <span
              className="inline-block text-[9px] font-bold tracking-[2px] uppercase px-2.5 py-0.5 rounded-full mb-3"
              style={{ color: step.color, background: `${step.color}12`, border: `1px solid ${step.color}20` }}
            >
              {step.agent.role}
            </span>

            {/* Default state: step description */}
            <AnimatePresence mode="wait">
              {!hovered ? (
                <motion.div
                  key="default"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-2 justify-center mb-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: `${step.color}12` }}
                    >
                      <step.icon className="w-3.5 h-3.5" style={{ color: step.color }} />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{step.label}</p>
                  </div>
                  <p className="text-sm text-foreground-secondary leading-relaxed max-w-[260px] mx-auto">
                    {step.desc}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="w-full"
                >
                  {/* Speech bubble quote */}
                  <div
                    className="relative rounded-2xl px-4 py-3 text-sm leading-relaxed backdrop-blur-md mb-4"
                    style={{
                      background: `${step.color}10`,
                      border: `1px solid ${step.color}25`,
                      color: `${step.color}DD`,
                    }}
                  >
                    <div
                      className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45"
                      style={{
                        background: `${step.color}10`,
                        borderTop: `1px solid ${step.color}25`,
                        borderLeft: `1px solid ${step.color}25`,
                      }}
                    />
                    <span className="relative z-10 font-medium italic">
                      &ldquo;{step.agent.hoverQuotes[quoteIndex]}&rdquo;
                    </span>
                  </div>

                  {/* What they do — bullet list */}
                  <ul className="space-y-1.5 text-left">
                    {step.agent.whatHeDoes.map((item, j) => (
                      <motion.li
                        key={j}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: j * 0.05 }}
                        className="flex items-center gap-2 text-[13px] text-foreground-secondary"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: step.color }} />
                        {item}
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom accent line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${step.color}40, transparent)`,
          }}
        />
      </motion.div>
    </motion.div>
  );
}

/* ── Main section ── */
export default function MissionSection() {
  return (
    <section className="relative z-10 px-6 py-24">
      <div className="max-w-[1100px] mx-auto">
        {/* ═══ Mission header with image ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[32px] border border-border bg-white shadow-sm mb-10"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, rgba(255,107,53,0.06), transparent 60%)",
            }}
          />

          <div className="relative px-8 md:px-14 py-12 md:py-16">
            <div className="grid md:grid-cols-[1fr_360px] gap-10 items-center">
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
                  Ogni giorno milioni di persone firmano documenti senza capirli davvero.
                  Noi mettiamo a disposizione un team di AI specializzate che leggono,
                  analizzano e ti spiegano tutto — prima che sia troppo tardi.
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

        {/* ═══ Section title ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-center mb-4"
        >
          <p className="text-[11px] font-bold tracking-[3px] uppercase text-accent/70 mb-3">
            Come funziona
          </p>
          <h3 className="font-serif text-2xl md:text-3xl text-foreground mb-2">
            Quattro menti.{" "}
            <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
              Una missione.
            </span>
          </h3>
          <p className="text-sm md:text-base text-foreground-secondary max-w-[400px] mx-auto leading-relaxed">
            Passa il mouse su ognuno per sentire cosa ha da dire.
          </p>
        </motion.div>

        {/* ═══ 2x2 Agent-Step grid with expand-on-hover ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {steps.map((step, i) => (
            <AgentStepCard key={i} step={step} index={i} />
          ))}
        </div>

        {/* Pipeline flow: Read → Understand → Investigate → Advisor */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex items-center justify-center gap-2 md:gap-3 flex-wrap mb-8"
        >
          {agents.map((agent, i) => (
            <div key={agent.phase} className="flex items-center gap-2 md:gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: `${agent.color}10` }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: agent.color }} />
                <span className="text-sm font-medium" style={{ color: `${agent.color}CC` }}>{agent.name}</span>
              </div>
              {i < agents.length - 1 && (
                <svg width="20" height="10" viewBox="0 0 20 10" className="text-foreground-tertiary shrink-0">
                  <path d="M0 5h16M14 2l3 3-3 3" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </motion.div>

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
              { value: 30, suffix: "s", label: "Tempo medio analisi" },
              { value: 100, suffix: "+", label: "Norme verificate" },
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
                <p className="text-xs text-foreground-tertiary mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
