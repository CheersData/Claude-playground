"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const CLIENTS = [
  "Celine",
  "Dior",
  "Dunhill",
  "Ferragamo",
  "Loewe",
  "Loro Piana",
  "Louis Vuitton",
  "Pucci",
  "Stefano Ricci",
  "Thom Browne",
  "Tom Ford",
];

export default function ClientsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      id="clienti"
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
            I Nostri Partner
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl mb-6">
            La fiducia delle griffe
            <br />
            <span className="text-gold/80">piu prestigiose</span>
          </h2>
          <p className="text-foreground/40 max-w-xl mx-auto text-lg">
            Le maison che scelgono Gherardi Pro come partner manifatturiero per
            le loro camicie.
          </p>
        </motion.div>

        {/* Client logos (text-based, elegant) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1, delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1"
        >
          {CLIENTS.map((client, i) => (
            <motion.div
              key={client}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.06 * i }}
              className="flex items-center justify-center p-8 md:p-10 border border-gold/[0.06] hover:border-gold/20 hover:bg-gold/[0.02] transition-all duration-500 group"
            >
              <span className="font-[family-name:var(--font-playfair)] text-lg md:text-xl text-foreground/25 group-hover:text-foreground/60 transition-colors duration-500 tracking-wide">
                {client}
              </span>
            </motion.div>
          ))}

          {/* CTA cell */}
          <motion.a
            href="#contatti"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.06 * CLIENTS.length }}
            className="flex items-center justify-center p-8 md:p-10 border border-gold/20 bg-gold/[0.03] hover:bg-gold/[0.08] transition-all duration-500 cursor-pointer"
          >
            <span className="text-gold text-sm tracking-[0.15em] uppercase">
              Il tuo brand?
            </span>
          </motion.a>
        </motion.div>

        {/* Trust quote */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-20 text-center"
        >
          <blockquote className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-foreground/30 italic max-w-3xl mx-auto leading-relaxed">
            &ldquo;Un&apos;affidabilita priva di incertezze e al cuore del nostro
            servizio&rdquo;
          </blockquote>
        </motion.div>
      </div>
    </section>
  );
}
