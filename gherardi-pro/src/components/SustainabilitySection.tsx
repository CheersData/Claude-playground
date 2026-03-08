"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Award, Leaf, Heart, Shield } from "lucide-react";

const CERTS = [
  {
    icon: Award,
    name: "ISO 9001",
    description: "Sistema di gestione della qualita",
  },
  {
    icon: Shield,
    name: "ISO 45001",
    description: "Salute e sicurezza sul lavoro",
  },
  {
    icon: Leaf,
    name: "ISO 14001",
    description: "Gestione ambientale",
  },
  {
    icon: Heart,
    name: "UNI/PdR 125:2022",
    description: "Parita di genere e inclusione",
  },
];

export default function SustainabilitySection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="sostenibilita" className="py-28 md:py-36 relative" ref={ref}>
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">
            Certificazioni e Sostenibilita
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl mb-6">
            Responsabilita
            <br />
            <span className="text-gold/80">e trasparenza</span>
          </h2>
        </motion.div>

        {/* Certifications grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {CERTS.map((cert, i) => {
            const Icon = cert.icon;
            return (
              <motion.div
                key={cert.name}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1 * i }}
                className="card-luxury rounded-lg p-6 md:p-8 text-center"
              >
                <div className="w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-4">
                  <Icon size={24} className="text-gold" />
                </div>
                <h3 className="font-[family-name:var(--font-playfair)] text-lg md:text-xl mb-2">
                  {cert.name}
                </h3>
                <p className="text-foreground/40 text-sm">
                  {cert.description}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Values */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="card-luxury rounded-lg p-8 md:p-12"
        >
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h4 className="text-gold text-sm tracking-[0.2em] uppercase mb-3">
                Welfare aziendale
              </h4>
              <p className="text-foreground/50 leading-relaxed text-sm">
                Accordo sindacale per 700 euro netti di welfare per dipendente.
                Investiamo nelle persone che rendono possibile la nostra
                eccellenza.
              </p>
            </div>
            <div>
              <h4 className="text-gold text-sm tracking-[0.2em] uppercase mb-3">
                Crescita responsabile
              </h4>
              <p className="text-foreground/50 leading-relaxed text-sm">
                Due acquisizioni recenti con mantenimento totale del personale e
                nuove assunzioni. Cresciamo senza lasciare indietro nessuno.
              </p>
            </div>
            <div>
              <h4 className="text-gold text-sm tracking-[0.2em] uppercase mb-3">
                Sapere artigianale
              </h4>
              <p className="text-foreground/50 leading-relaxed text-sm">
                Assunzione deliberata di sarte e ricamatrici esperte per
                trasferire la maestria artigianale alle nuove generazioni.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
