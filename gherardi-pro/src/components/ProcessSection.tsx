"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  Pencil,
  Scissors,
  Layers,
  Hand,
  CheckCircle,
  Package,
  Sparkles,
} from "lucide-react";

const STEPS = [
  {
    icon: Pencil,
    title: "Studio e Ricerca",
    description:
      "Selezioniamo materiali innovativi, studiamo tecniche di cucito e lavaggio per ogni progetto.",
  },
  {
    icon: Layers,
    title: "Progettazione",
    description:
      "Dal concept al modello. Modellistica digitale e campionario su misura per ogni brand.",
  },
  {
    icon: Sparkles,
    title: "Taglio AI",
    description:
      "Intelligenza artificiale riconosce i pattern, scarta i difetti e ottimizza il tessuto. Dall'ordine al taglio: 120 secondi.",
  },
  {
    icon: Scissors,
    title: "Produzione",
    description:
      "Centinaia di camicie al giorno, con la precisione di chi ne produce una sola. Tre distretti produttivi in Europa.",
  },
  {
    icon: Hand,
    title: "Finiture Manuali",
    description:
      "Monogrammi, asole ricamate a mano, rifiniture sartoriali. La manualita e il nostro pregio.",
  },
  {
    icon: CheckCircle,
    title: "Controllo Qualita",
    description:
      "Ogni capo viene ispezionato singolarmente. Competenza tecnica e garanzia certificata ISO 9001.",
  },
  {
    icon: Package,
    title: "Logistica",
    description:
      "Magazzino 4.0 con 1.000 vassoi semi-automatizzati. Consegna puntuale in tutto il mondo.",
  },
];

export default function ProcessSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="processo" className="py-28 md:py-36 relative" ref={ref}>
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">
            Il Processo
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl mb-6">
            Dalla materia prima
            <br />
            <span className="text-gold/80">alla camicia perfetta</span>
          </h2>
          <p className="text-foreground/40 max-w-xl mx-auto text-lg">
            Sette fasi in cui artigianalita e tecnologia si fondono
            per creare capi di eccellenza.
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-gold/0 via-gold/20 to-gold/0" />

          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isLeft = i % 2 === 0;

            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.15 * i }}
                className={`relative flex items-center mb-12 md:mb-16 ${
                  isLeft ? "md:flex-row" : "md:flex-row-reverse"
                }`}
              >
                {/* Content */}
                <div
                  className={`ml-20 md:ml-0 md:w-[calc(50%-3rem)] ${
                    isLeft ? "md:text-right md:pr-12" : "md:text-left md:pl-12"
                  }`}
                >
                  <div
                    className={`inline-flex items-center gap-3 mb-3 ${
                      isLeft ? "md:flex-row-reverse" : ""
                    }`}
                  >
                    <span className="text-gold/40 text-sm font-medium">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="font-[family-name:var(--font-playfair)] text-xl md:text-2xl mb-3 text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-foreground/40 leading-relaxed text-sm md:text-base">
                    {step.description}
                  </p>
                </div>

                {/* Center dot */}
                <div className="absolute left-8 md:left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-charcoal border border-gold/30 flex items-center justify-center z-10">
                  <Icon size={18} className="text-gold" />
                </div>

                {/* Spacer for opposite side */}
                <div className="hidden md:block md:w-[calc(50%-3rem)]" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
