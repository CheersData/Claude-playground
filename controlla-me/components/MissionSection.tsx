"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { BookOpen, Eye, Scale, MessageCircle } from "lucide-react";
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

  return <span ref={ref}>{display}{suffix}</span>;
}

const steps = [
  {
    icon: BookOpen,
    label: "Classificazione",
    desc: "Read cataloga il tipo di documento e le parti coinvolte",
    color: agents[0].color,
    duration: "~5s",
    image: "/images/confidential-docs.png",
  },
  {
    icon: Eye,
    label: "Analisi",
    desc: "Understand trova le clausole rischiose e gli squilibri",
    color: agents[1].color,
    duration: "~10s",
    image: "/images/clause-analysis.png",
  },
  {
    icon: Scale,
    label: "Verifica legale",
    desc: "Investigate cerca norme, sentenze e precedenti",
    color: agents[2].color,
    duration: "~10s",
    image: "/images/law-references.png",
  },
  {
    icon: MessageCircle,
    label: "Consiglio",
    desc: "Advisor ti spiega tutto e ti dice cosa fare",
    color: agents[3].color,
    duration: "~5s",
    image: "/images/checklist-results.png",
  },
];

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
          className="relative overflow-hidden rounded-[32px] border border-border bg-white shadow-sm mb-8"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, rgba(255,107,53,0.06), transparent 60%)",
            }}
          />

          <div className="relative px-8 md:px-14 py-12 md:py-16">
            <div className="grid md:grid-cols-[1fr_360px] gap-10 items-center mb-0">
              {/* Text */}
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

              {/* Decorative image — large and prominent */}
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
                {/* Glow behind image */}
                <div className="absolute -inset-6 rounded-3xl bg-accent/5 blur-3xl -z-10" />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* ═══ How it works — 4 steps with cubist images ═══ */}
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
            4 agenti, 30 secondi, zero dubbi.
          </h3>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm hover:border-border transition-all"
            >
              {/* Image — big and prominent */}
              <div className="relative h-[240px] md:h-[300px] overflow-hidden">
                <Image
                  src={step.image}
                  alt={step.label}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                  quality={90}
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
                {/* Subtle gradient — only at bottom for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-transparent" />
                {/* Step number */}
                <div
                  className="absolute top-4 left-4 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold backdrop-blur-sm"
                  style={{ background: `${step.color}30`, color: step.color, border: `1px solid ${step.color}40` }}
                >
                  {i + 1}
                </div>
                {/* Duration badge */}
                <div className="absolute top-4 right-4 px-3 py-1 rounded-lg bg-white/80 backdrop-blur-sm text-[11px] font-mono text-accent/70 border border-border">
                  {step.duration}
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
                <p className="text-sm text-foreground-secondary leading-relaxed">{step.desc}</p>
              </div>

              {/* Bottom accent line */}
              <div
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{
                  background: `linear-gradient(90deg, transparent, ${step.color}40, transparent)`,
                }}
              />
            </motion.div>
          ))}
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
