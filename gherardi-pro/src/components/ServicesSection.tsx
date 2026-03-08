"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import {
  Ruler,
  PenTool,
  Factory,
  Truck,
  Hand,
  ShieldCheck,
  FlaskConical,
  ChevronRight,
} from "lucide-react";

const SERVICES = [
  {
    icon: FlaskConical,
    title: "Studio e Ricerca",
    summary: "Materiali innovativi, tecniche di cucito e lavaggio all'avanguardia.",
    detail:
      "Il nostro laboratorio studia e propone costantemente nuovi materiali, nuove tecniche di cucito e nuovi processi di lavaggio. Ogni brand ha esigenze uniche: noi le anticipiamo.",
  },
  {
    icon: Ruler,
    title: "Servizio Su Misura",
    summary: "Made-to-measure con archiviazione digitale per riordini istantanei.",
    detail:
      "Ufficio dedicato al servizio personalizzato. Sviluppiamo Master Garment di riferimento, forniamo accessori per la personalizzazione del cliente finale e formiamo il personale del brand. Riordini con un click grazie al gestionale MTM.",
  },
  {
    icon: PenTool,
    title: "Progettazione",
    summary: "Dal concept alla modellistica digitale, pronti per la produzione.",
    detail:
      "Trasformiamo le idee dei designer in modelli producibili su scala. Modellistica digitale di precisione, campionario, sviluppo taglie e grading.",
  },
  {
    icon: Factory,
    title: "Produzione",
    summary: "Tre distretti produttivi europei. 500.000 camicie l'anno.",
    detail:
      "Sede principale in Toscana (Pieve Santo Stefano), laboratori nel distretto pugliese-salentino, stabilimento in Romania. Capacita produttiva europea con qualita italiana.",
  },
  {
    icon: Hand,
    title: "Finiture Manuali",
    summary: "Monogrammi, asole ricamate a mano, rifiniture sartoriali.",
    detail:
      "La vocazione sartoriale e il nostro DNA. Eredita e maestria artigiana nelle finiture manuali che rendono ogni capo unico. Il tocco umano che nessuna macchina puo replicare.",
  },
  {
    icon: ShieldCheck,
    title: "Controllo Qualita",
    summary: "Ispezione singola su ogni capo. Certificazione ISO 9001.",
    detail:
      "Precisione, competenza tecnica e garanzia di qualita. Ogni camicia viene controllata individualmente prima della spedizione. Standard certificati ISO 9001, ISO 14001, ISO 45001.",
  },
  {
    icon: Truck,
    title: "Logistica",
    summary: "Magazzino 4.0 semi-automatizzato. Consegne puntuali worldwide.",
    detail:
      "Il nostro Magazzino 4.0 con 1.000 vassoi semi-automatizzati recupera l'80% dello spazio e riduce i tempi del 70%. Gestione completa della supply chain fino alla porta del cliente.",
  },
];

export default function ServicesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section id="servizi" className="py-28 md:py-36 relative" ref={ref}>
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">
            Servizi
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl mb-6">
            Full-service
            <br />
            <span className="text-gold/80">per il lusso</span>
          </h2>
          <p className="text-foreground/40 max-w-xl mx-auto text-lg">
            Dalla prima idea al prodotto finito. Un unico partner per tutta la
            filiera.
          </p>
        </motion.div>

        {/* Services list */}
        <div className="space-y-3">
          {SERVICES.map((svc, i) => {
            const Icon = svc.icon;
            const isOpen = expanded === i;

            return (
              <motion.div
                key={svc.title}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.08 * i }}
                className="card-luxury rounded-lg overflow-hidden cursor-pointer"
                onClick={() => setExpanded(isOpen ? null : i)}
              >
                <div className="flex items-center gap-5 p-6 md:p-8">
                  <div className="w-11 h-11 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={20} className="text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-[family-name:var(--font-playfair)] text-lg md:text-xl mb-1">
                      {svc.title}
                    </h3>
                    <p className="text-foreground/40 text-sm truncate">
                      {svc.summary}
                    </p>
                  </div>
                  <ChevronRight
                    size={20}
                    className={`text-gold/40 flex-shrink-0 transition-transform duration-300 ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                </div>

                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="px-6 md:px-8 pb-6 md:pb-8 pt-0"
                  >
                    <div className="pl-16 border-l border-gold/10 ml-[1px]">
                      <p className="text-foreground/50 leading-relaxed">
                        {svc.detail}
                      </p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
