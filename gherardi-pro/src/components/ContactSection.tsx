"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { MapPin, Phone, Mail, Send } from "lucide-react";
import Image from "next/image";

const ROLES = [
  "Designer",
  "Product Development",
  "Production Manager",
  "CEO / General Manager",
  "Procurement",
  "Sales",
  "Freelancer",
  "Altro",
];

export default function ContactSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <section
      id="contatti"
      className="py-28 md:py-36 bg-charcoal-light relative"
      ref={ref}
    >
      {/* Background image */}
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src="https://www.gherardipro.com/wp-content/uploads/2022/09/bg-contact.jpg"
          alt=""
          fill
          className="object-cover opacity-[0.05]"
          unoptimized
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">
            Contatti
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl mb-6">
            Parliamo del
            <br />
            <span className="text-gold/80">vostro progetto</span>
          </h2>
          <p className="text-foreground/40 max-w-xl mx-auto text-lg">
            Ogni grande camicia inizia con una conversazione.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-12">
          {/* Form */}
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-3 space-y-5"
          >
            <div className="grid sm:grid-cols-2 gap-5">
              <input
                type="text"
                placeholder="Nome e Cognome"
                required
                className="w-full bg-charcoal border border-gold/10 rounded px-5 py-4 text-foreground/80 text-sm placeholder:text-foreground/20 focus:outline-none focus:border-gold/40 transition-colors"
              />
              <input
                type="email"
                placeholder="Email"
                required
                className="w-full bg-charcoal border border-gold/10 rounded px-5 py-4 text-foreground/80 text-sm placeholder:text-foreground/20 focus:outline-none focus:border-gold/40 transition-colors"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <input
                type="text"
                placeholder="Azienda / Brand"
                className="w-full bg-charcoal border border-gold/10 rounded px-5 py-4 text-foreground/80 text-sm placeholder:text-foreground/20 focus:outline-none focus:border-gold/40 transition-colors"
              />
              <select
                className="w-full bg-charcoal border border-gold/10 rounded px-5 py-4 text-foreground/40 text-sm focus:outline-none focus:border-gold/40 transition-colors appearance-none"
                defaultValue=""
              >
                <option value="" disabled>
                  Il tuo ruolo
                </option>
                {ROLES.map((r) => (
                  <option key={r} value={r} className="text-foreground/80">
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="tel"
              placeholder="Telefono (opzionale)"
              className="w-full bg-charcoal border border-gold/10 rounded px-5 py-4 text-foreground/80 text-sm placeholder:text-foreground/20 focus:outline-none focus:border-gold/40 transition-colors"
            />

            <textarea
              rows={5}
              placeholder="Raccontaci il vostro progetto..."
              required
              className="w-full bg-charcoal border border-gold/10 rounded px-5 py-4 text-foreground/80 text-sm placeholder:text-foreground/20 focus:outline-none focus:border-gold/40 transition-colors resize-none"
            />

            <button
              type="submit"
              disabled={sent}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-gold to-gold-dark text-background font-medium text-sm tracking-[0.1em] uppercase hover:from-gold-light hover:to-gold transition-all duration-300 hover:shadow-[0_4px_20px_rgba(198,159,115,0.3)] disabled:opacity-50"
            >
              {sent ? (
                "Messaggio inviato"
              ) : (
                <>
                  <Send size={16} />
                  Invia richiesta
                </>
              )}
            </button>
          </motion.form>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="lg:col-span-2 space-y-8"
          >
            <div className="card-luxury rounded-lg p-6">
              <div className="flex items-start gap-4">
                <MapPin size={20} className="text-gold flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-medium text-foreground/80 mb-1">Sede</h4>
                  <p className="text-foreground/40 text-sm leading-relaxed">
                    Via Canonico Coupers 11
                    <br />
                    52036 Pieve Santo Stefano (AR)
                    <br />
                    Toscana, Italia
                  </p>
                </div>
              </div>
            </div>

            <div className="card-luxury rounded-lg p-6">
              <div className="flex items-start gap-4">
                <Phone size={20} className="text-gold flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-medium text-foreground/80 mb-1">
                    Telefono
                  </h4>
                  <p className="text-foreground/40 text-sm">
                    +39 0575 797501
                  </p>
                </div>
              </div>
            </div>

            <div className="card-luxury rounded-lg p-6">
              <div className="flex items-start gap-4">
                <Mail size={20} className="text-gold flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-medium text-foreground/80 mb-1">Email</h4>
                  <p className="text-foreground/40 text-sm">
                    info@gherardipro.com
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center pt-4">
              <p className="text-foreground/20 text-xs tracking-wide">
                Rispondiamo entro 24 ore lavorative
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
