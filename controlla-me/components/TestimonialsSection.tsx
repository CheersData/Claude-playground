"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Marco Rossi",
    location: "Milano",
    role: "Inquilino",
    text: "Stavo per firmare un contratto d'affitto con 4 clausole vessatorie. controlla.me me le ha segnalate tutte in 20 secondi. L'avvocato me ne avrebbe fatta notare forse una.",
    stars: 5,
    highlight: "4 clausole vessatorie trovate",
  },
  {
    name: "Sofia Lombardi",
    location: "Roma",
    role: "Freelancer",
    text: "Il mio nuovo cliente mi aveva mandato un contratto di collaborazione. Enzo mi ha detto chiaramente: 'Non firmare, il patto di non concorrenza e' eccessivo.' Aveva ragione.",
    stars: 5,
    highlight: "Patto di non concorrenza eccessivo",
  },
  {
    name: "Andrea Ferretti",
    location: "Napoli",
    role: "Consumatore",
    text: "Una bolletta del gas con addebiti strani. Ho caricato il PDF e in 30 secondi Marta ha trovato 3 servizi mai richiesti. Ho ottenuto il rimborso completo.",
    stars: 5,
    highlight: "Rimborso completo ottenuto",
  },
  {
    name: "Chiara Moretti",
    location: "Torino",
    role: "Acquirente",
    text: "Preliminare di vendita per la mia prima casa. Giulia ha trovato che mancava la menzione di un vincolo urbanistico. Il notaio ha confermato tutto.",
    stars: 5,
    highlight: "Vincolo urbanistico nascosto",
  },
  {
    name: "Luca Bianchi",
    location: "Bologna",
    role: "Dipendente",
    text: "Nuovo contratto di lavoro con clausola di trasferimento unilaterale. Non l'avrei mai notata da solo. Ho chiesto di modificarla e l'azienda ha accettato.",
    stars: 5,
    highlight: "Clausola di trasferimento rimossa",
  },
  {
    name: "Giulia Toscano",
    location: "Firenze",
    role: "Assicurata",
    text: "La mia polizza assicurativa escludeva proprio il danno per cui l'avevo stipulata. Grazie a controlla.me ho cambiato compagnia prima che succedesse qualcosa.",
    stars: 5,
    highlight: "Esclusione nascosta scoperta",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="relative z-10 px-6 py-24 overflow-hidden">
      <div className="max-w-[1100px] mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          className="text-center mb-14"
        >
          <p className="text-[11px] font-bold tracking-[3px] uppercase text-accent/70 mb-3">
            Testimonianze
          </p>
          <h2 className="font-serif text-3xl md:text-5xl mb-5">
            Chi ci ha provato{" "}
            <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
              non torna indietro.
            </span>
          </h2>
          <p className="text-base text-white/40 max-w-[500px] mx-auto">
            Migliaia di persone hanno gia protetto i loro diritti con controlla.me.
          </p>
        </motion.div>

        {/* Scrolling testimonial cards — two rows, opposite directions */}
        <div className="space-y-5">
          {/* Row 1 — scroll left */}
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-r from-[#0A0A0A] to-transparent pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-l from-[#0A0A0A] to-transparent pointer-events-none" />
            <motion.div
              animate={{ x: [0, -1200] }}
              transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
              className="flex gap-5"
            >
              {[...testimonials.slice(0, 3), ...testimonials.slice(0, 3)].map((t, i) => (
                <TestimonialCard key={i} testimonial={t} />
              ))}
            </motion.div>
          </div>

          {/* Row 2 — scroll right */}
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-r from-[#0A0A0A] to-transparent pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-l from-[#0A0A0A] to-transparent pointer-events-none" />
            <motion.div
              animate={{ x: [-1200, 0] }}
              transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
              className="flex gap-5"
            >
              {[...testimonials.slice(3, 6), ...testimonials.slice(3, 6)].map((t, i) => (
                <TestimonialCard key={i} testimonial={t} />
              ))}
            </motion.div>
          </div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="flex justify-center gap-8 md:gap-14 mt-14 pt-8 border-t border-white/[0.06]"
        >
          {[
            { value: "4.9/5", label: "Valutazione media" },
            { value: "15k+", label: "Documenti analizzati" },
            { value: "98%", label: "Consiglia controlla.me" },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-2xl md:text-3xl font-bold bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">
                {stat.value}
              </p>
              <p className="text-xs text-white/30 mt-1">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function TestimonialCard({ testimonial }: { testimonial: typeof testimonials[number] }) {
  return (
    <div className="shrink-0 w-[360px] md:w-[400px] rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      {/* Stars */}
      <div className="flex gap-0.5 mb-3">
        {Array.from({ length: testimonial.stars }).map((_, i) => (
          <Star key={i} className="w-3.5 h-3.5 fill-accent text-accent" />
        ))}
      </div>

      {/* Text */}
      <p className="text-sm text-white/50 leading-relaxed mb-4">
        &ldquo;{testimonial.text}&rdquo;
      </p>

      {/* Highlight badge */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/[0.08] border border-accent/15 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
        <span className="text-[10px] font-semibold text-accent/80">{testimonial.highlight}</span>
      </div>

      {/* User */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-sm font-bold text-white/40">
          {testimonial.name.split(" ").map((n) => n[0]).join("")}
        </div>
        <div>
          <p className="text-sm font-medium text-white/70">{testimonial.name}</p>
          <p className="text-[11px] text-white/25">
            {testimonial.role} — {testimonial.location}
          </p>
        </div>
      </div>
    </div>
  );
}
