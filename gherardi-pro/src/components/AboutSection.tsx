"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";

export default function AboutSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      id="chi-siamo"
      className="py-28 md:py-36 bg-charcoal-light relative"
      ref={ref}
    >
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_1fr_1fr] gap-16 items-center">
          {/* Image - left column on desktop */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="hidden lg:block relative h-full min-h-[500px] rounded-lg overflow-hidden"
          >
            <Image
              src="https://www.gherardipro.com/wp-content/uploads/2022/10/1Q1A9871-GHERARDI-CHISIAMO.jpg"
              alt="Gherardi Pro - Chi Siamo"
              fill
              className="object-cover"
              unoptimized
            />
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.15 }}
          >
            <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">
              Chi Siamo
            </p>
            <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl mb-8 leading-tight">
              Dove il tessuto
              <br />
              <span className="text-gold/80">diventa arte</span>
            </h2>

            <div className="space-y-6 text-foreground/50 leading-relaxed">
              <p>
                Fondata da <strong className="text-foreground/70">Alessandro Gherardi</strong> nel
                cuore della Toscana, la nostra azienda nasce da oltre 30 anni
                di esperienza nella camiceria di alta gamma. Dalla direzione
                della storica fabbrica Perla negli anni &apos;70 alla creazione di
                un punto di riferimento per le griffe internazionali.
              </p>
              <p>
                Oggi, guidata dalla seconda generazione —{" "}
                <strong className="text-foreground/70">Claudia e Paolo Gherardi</strong> — l&apos;azienda
                combina i tratti artigianali della tradizione con tecnologia
                di ultima generazione, producendo centinaia di camicie al giorno
                con la cura di chi ne realizza una sola.
              </p>
              <p>
                Il nostro impegno non si ferma alla qualita del prodotto:
                investiamo nelle persone, nel territorio e nella sostenibilita,
                perche l&apos;eccellenza e tale solo quando e responsabile.
              </p>
            </div>
          </motion.div>

          {/* Stats / Visual */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="space-y-4"
          >
            {/* Timeline */}
            <div className="card-luxury rounded-lg p-8">
              <h3 className="text-gold text-xs tracking-[0.2em] uppercase mb-6">
                La nostra storia
              </h3>
              <div className="space-y-6">
                {[
                  {
                    year: "Anni '70",
                    event: "Alessandro Gherardi dirige la fabbrica Perla a Pieve Santo Stefano",
                  },
                  {
                    year: "2000",
                    event: "Fondazione Gherardi S.r.l. — nasce il brand e la produzione conto terzi",
                  },
                  {
                    year: "2020",
                    event: "Seconda generazione al timone: Claudia e Paolo Gherardi",
                  },
                  {
                    year: "2023",
                    event: "Fatturato 24M EUR — partnership con 11 griffe internazionali",
                  },
                  {
                    year: "2024",
                    event: "Due acquisizioni, Magazzino 4.0 e Taglio AI operativi",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex gap-6">
                    <span className="font-[family-name:var(--font-playfair)] text-gold/60 text-sm w-20 flex-shrink-0 text-right">
                      {item.year}
                    </span>
                    <div className="flex-1 border-l border-gold/10 pl-6">
                      <p className="text-foreground/50 text-sm">{item.event}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Locations */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { place: "Toscana", role: "Sede principale" },
                { place: "Puglia", role: "Laboratori" },
                { place: "Romania", role: "Stabilimento" },
              ].map((loc) => (
                <div
                  key={loc.place}
                  className="card-luxury rounded-lg p-5 text-center"
                >
                  <p className="font-[family-name:var(--font-playfair)] text-lg text-foreground/70 mb-1">
                    {loc.place}
                  </p>
                  <p className="text-foreground/30 text-xs">{loc.role}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
