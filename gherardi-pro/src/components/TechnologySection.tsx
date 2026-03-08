"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Cpu, Warehouse, Eye, Zap } from "lucide-react";
import Image from "next/image";

const TECH = [
  {
    icon: Cpu,
    title: "Taglio AI",
    subtitle: "Dall'ordine al taglio: 120 secondi",
    image: "https://www.gherardipro.com/wp-content/uploads/2022/10/1Q1A9905-GHERARDI-TAGLIOAI.jpg",
    description:
      "Il sistema di visione con intelligenza artificiale riconosce e posiziona i pattern sul tessuto, scarta i difetti e riposiziona istantaneamente le parti della camicia. Telecamera ad alta risoluzione collegata al programma di modellistica per zero sprechi.",
    stats: [
      { label: "Tempo ordine-taglio", value: "120s" },
      { label: "Precisione", value: "99.8%" },
    ],
  },
  {
    icon: Warehouse,
    title: "Magazzino 4.0",
    subtitle: "1.000 vassoi semi-automatizzati",
    image: "https://www.gherardipro.com/wp-content/uploads/2022/10/Gherardi-MAGAZZINO-4.0.jpg",
    description:
      "Sistema semi-automatizzato che recupera fino all'80% dello spazio rispetto ai magazzini tradizionali. Riduzione dei tempi di inefficienza del 70%. Eliminazione dei rischi di infortuni da movimentazione con carrelli elevatori.",
    stats: [
      { label: "Spazio risparmiato", value: "80%" },
      { label: "Efficienza", value: "+70%" },
    ],
  },
  {
    icon: Eye,
    title: "Controllo Ottico",
    subtitle: "Ispezione luminosa avanzata",
    image: "https://www.gherardipro.com/wp-content/uploads/2022/10/GherardiPro-controlloqualita2.jpg",
    description:
      "Ogni rotolo di tessuto passa attraverso un'ispezione luminosa per il controllo qualita. Il sistema acquisisce informazioni su passo, quadratura e stampa, garantendo che solo tessuti perfetti entrino in produzione.",
    stats: [
      { label: "Tessuti ispezionati", value: "100%" },
      { label: "Difetti rilevati", value: "Sub-mm" },
    ],
  },
  {
    icon: Zap,
    title: "Gestionale MTM",
    subtitle: "Made-to-Measure digitale",
    image: "https://www.gherardipro.com/wp-content/uploads/2022/10/Gherardi-SU-MISURA.jpg",
    description:
      "Archiviazione digitale nel sistema gestionale MTM per riordini con un semplice click. Fornitura di accessori per la personalizzazione del cliente finale e formazione del personale del brand.",
    stats: [
      { label: "Riordino", value: "1 click" },
      { label: "Camicie MTM/anno", value: "18.000" },
    ],
  },
];

function AnimatedCounter({ value }: { value: string }) {
  return (
    <span className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-gold">
      {value}
    </span>
  );
}

export default function TechnologySection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      id="tecnologia"
      className="py-28 md:py-36 bg-charcoal-light relative"
      ref={ref}
    >
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">
            Tecnologia
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl mb-6">
            Innovazione al servizio
            <br />
            <span className="text-gold/80">dell&apos;artigianalita</span>
          </h2>
          <p className="text-foreground/40 max-w-xl mx-auto text-lg">
            Investiamo in tecnologia per amplificare — mai sostituire — la
            maestria delle nostre mani.
          </p>
        </motion.div>

        {/* Tech grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {TECH.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.15 * i }}
                className="card-luxury rounded-lg overflow-hidden"
              >
                <div className="relative w-full h-[200px]">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="p-8 md:p-10">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={22} className="text-gold" />
                  </div>
                  <div>
                    <h3 className="font-[family-name:var(--font-playfair)] text-xl md:text-2xl mb-1">
                      {item.title}
                    </h3>
                    <p className="text-gold/60 text-sm">{item.subtitle}</p>
                  </div>
                </div>

                <p className="text-foreground/40 leading-relaxed mb-8 text-sm md:text-base">
                  {item.description}
                </p>

                <div className="flex gap-8 pt-6 border-t border-gold/10">
                  {item.stats.map((stat) => (
                    <div key={stat.label}>
                      <AnimatedCounter value={stat.value} />
                      <p className="text-foreground/30 text-xs mt-1 tracking-wide uppercase">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
