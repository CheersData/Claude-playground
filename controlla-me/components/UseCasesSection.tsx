"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Home, Briefcase, Receipt, Heart, ShoppingCart } from "lucide-react";
import Image from "next/image";

const useCases = [
  {
    icon: Home,
    title: "Contratto d'affitto",
    color: "#4ECDC4",
    risks: ["Clausola di recesso solo per il locatore", "Penale nascosta per disdetta anticipata", "Spese straordinarie a carico dell'inquilino"],
    quote: "Giulia ha trovato 3 clausole vessatorie. Non avrei mai firmato.",
    user: "Marco R., Milano",
  },
  {
    icon: Briefcase,
    title: "Contratto di lavoro",
    color: "#FF6B6B",
    risks: ["Patto di non concorrenza eccessivo", "Straordinari non retribuiti", "Clausola di trasferimento unilaterale"],
    quote: "Ho rinegoziato 2 clausole prima di firmare. Grazie Marta!",
    user: "Sofia L., Roma",
  },
  {
    icon: Receipt,
    title: "Bolletta / Utenza",
    color: "#A78BFA",
    risks: ["Servizi non richiesti in fattura", "Clausola di rinnovo tacito", "Penale per recesso anticipato"],
    quote: "Ho scoperto che pagavo 3 servizi mai attivati. Rimborso ottenuto.",
    user: "Andrea P., Napoli",
  },
  {
    icon: ShoppingCart,
    title: "Acquisto online / E-commerce",
    color: "#FFC832",
    risks: ["Diritto di recesso limitato", "Garanzia ridotta rispetto alla legge", "Foro competente sfavorevole"],
    quote: "Il venditore aveva rimosso il diritto di recesso. Illegale!",
    user: "Chiara M., Torino",
  },
  {
    icon: Heart,
    title: "Polizza assicurativa",
    color: "#FF6B35",
    risks: ["Esclusioni nascoste nella copertura", "Franchigia non dichiarata chiaramente", "Clausola di recesso solo per l'assicuratore"],
    quote: "La polizza escludeva proprio il caso per cui l'avevo fatta.",
    user: "Luca B., Bologna",
  },
  {
    icon: FileText,
    title: "Preliminare di vendita",
    color: "#22D3EE",
    risks: ["Caparra confirmatoria vs penitenziale", "Clausola risolutiva espressa", "Mancata menzione di vincoli urbanistici"],
    quote: "Enzo mi ha spiegato la differenza tra le caparre. Mi ha salvato.",
    user: "Giulia T., Firenze",
  },
];

export default function UseCasesSection() {
  const [active, setActive] = useState(0);
  const current = useCases[active];

  return (
    <section className="relative z-10 px-6 py-24">
      <div className="max-w-[1000px] mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          className="text-center mb-14"
        >
          <p className="text-[11px] font-bold tracking-[3px] uppercase text-accent/70 mb-3">
            Casi d&apos;uso
          </p>
          <h2 className="font-serif text-3xl md:text-5xl mb-5">
            Che documento hai{" "}
            <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
              tra le mani?
            </span>
          </h2>
          <p className="text-base text-foreground-secondary max-w-[520px] mx-auto">
            Ogni giorno analizziamo contratti, bollette, polizze e documenti legali.
            Ecco cosa troviamo.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-[280px_1fr] gap-6">
          {/* Left: tabs */}
          <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {useCases.map((uc, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                onClick={() => setActive(i)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all whitespace-nowrap md:whitespace-normal shrink-0 md:shrink ${
                  active === i
                    ? "bg-background-secondary border border-border"
                    : "hover:bg-surface-hover border border-transparent"
                }`}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all"
                  style={{
                    background: active === i ? `${uc.color}20` : "rgba(0,0,0,0.03)",
                  }}
                >
                  <uc.icon
                    className="w-4 h-4 transition-colors"
                    style={{ color: active === i ? uc.color : "rgba(26,26,46,0.4)" }}
                  />
                </div>
                <span
                  className={`text-sm font-medium transition-colors ${
                    active === i ? "text-foreground" : "text-foreground-tertiary"
                  }`}
                >
                  {uc.title}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Right: content card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.35 }}
              className="relative overflow-hidden rounded-3xl border border-border bg-white shadow-sm"
            >
              {/* Top glow */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{
                  background: `linear-gradient(90deg, transparent, ${current.color}60, transparent)`,
                }}
              />

              {/* Gradient bg */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at 0% 0%, ${current.color}08, transparent 60%)`,
                }}
              />

              {/* Decorative cubist image banner — large and visible */}
              <div className="relative h-[200px] md:h-[260px] overflow-hidden">
                <Image
                  src="/images/contract-house.png"
                  alt=""
                  fill
                  className="object-cover"
                  quality={90}
                  sizes="(max-width: 768px) 100vw, 700px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${current.color}12, transparent 50%)`,
                  }}
                />
              </div>

              <div className="relative p-8 md:p-10">
                {/* Title */}
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: `${current.color}15` }}
                  >
                    <current.icon className="w-6 h-6" style={{ color: current.color }} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{current.title}</h3>
                    <p className="text-xs text-foreground-tertiary">Rischi comuni trovati dai nostri agenti</p>
                  </div>
                </div>

                {/* Risks */}
                <div className="space-y-3 mb-8">
                  {current.risks.map((risk, j) => (
                    <motion.div
                      key={j}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + j * 0.08 }}
                      className="flex items-start gap-3 p-3 rounded-xl bg-white shadow-sm border border-border"
                    >
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: `${current.color}15` }}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M6 2v4M6 8.5v.5" stroke={current.color} strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                      <span className="text-sm text-foreground-secondary">{risk}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Testimonial quote */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="border-t border-border pt-6"
                >
                  <p className="font-serif italic text-foreground-secondary text-base mb-2">
                    &ldquo;{current.quote}&rdquo;
                  </p>
                  <p className="text-xs text-foreground-tertiary">— {current.user}</p>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
