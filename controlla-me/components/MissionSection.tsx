"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { BookOpen, Eye, Scale, MessageCircle } from "lucide-react";
import { agents } from "./TeamSection";

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

/* ── Animated connection line between steps ── */
function ConnectionLine({ color }: { color: string }) {
  return (
    <div className="hidden md:flex items-center justify-center">
      <motion.div
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="h-[2px] w-full origin-left"
        style={{
          background: `linear-gradient(90deg, ${color}40, ${color}10)`,
        }}
      />
    </div>
  );
}

const steps = [
  { icon: BookOpen, label: "Classificazione", desc: "Leo cataloga il tipo di documento e le parti coinvolte", color: agents[0].color, duration: "~5s" },
  { icon: Eye, label: "Analisi", desc: "Marta trova le clausole rischiose e gli squilibri", color: agents[1].color, duration: "~10s" },
  { icon: Scale, label: "Verifica legale", desc: "Giulia cerca norme, sentenze e precedenti", color: agents[2].color, duration: "~10s" },
  { icon: MessageCircle, label: "Consiglio", desc: "Enzo ti spiega tutto e ti dice cosa fare", color: agents[3].color, duration: "~5s" },
];

export default function MissionSection() {
  return (
    <section className="relative z-10 px-6 py-24">
      <div className="max-w-[900px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[32px] border border-white/[0.06] bg-white/[0.02]"
        >
          {/* Background gradient */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, rgba(255,107,53,0.06), transparent 60%)",
            }}
          />

          <div className="relative px-8 md:px-14 py-12 md:py-16">
            {/* Mission header */}
            <div className="text-center mb-12">
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
                className="font-serif text-2xl md:text-4xl leading-snug max-w-[600px] mx-auto mb-6"
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
                className="text-base text-white/40 max-w-[520px] mx-auto leading-relaxed"
              >
                Ogni giorno milioni di persone firmano documenti senza capirli davvero.
                Noi mettiamo a disposizione un team di AI specializzate che leggono,
                analizzano e ti spiegano tutto — prima che sia troppo tardi.
              </motion.p>
            </div>

            {/* How it works — 4 steps with animated connections */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-12">
              {steps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 + i * 0.12 }}
                  className={`text-center p-4 ${i < 3 ? "md:col-span-1" : ""}`}
                  style={{ gridColumn: `${i * 2 + 1}` }}
                >
                  {/* Animated icon container */}
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 relative"
                    style={{ background: `${step.color}15` }}
                  >
                    <step.icon className="w-6 h-6" style={{ color: step.color }} />
                    {/* Pulse ring on hover */}
                    <motion.div
                      className="absolute inset-0 rounded-2xl"
                      style={{ border: `1px solid ${step.color}` }}
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                    />
                  </motion.div>
                  <p className="text-sm font-semibold mb-1">{step.label}</p>
                  <p className="text-xs text-white/35 mb-1">{step.desc}</p>
                  <span className="text-[10px] font-mono text-accent/50">{step.duration}</span>
                </motion.div>
              ))}
            </div>

            {/* Timeline bar */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="relative h-1 rounded-full bg-white/[0.04] mb-12 mx-4 hidden md:block"
            >
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true }}
                transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#4ECDC4] via-[#FF6B6B] via-[#A78BFA] to-[#FFC832]"
              />
              {/* Step markers */}
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
            <div className="grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-8">
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
                  <p className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">
                    <Counter value={stat.value} suffix={stat.suffix} />
                  </p>
                  <p className="text-xs text-white/30 mt-1">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
