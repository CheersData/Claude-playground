"use client";

import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import Image from "next/image";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-charcoal" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gold/[0.03] rounded-full blur-[120px]" />
      </div>

      {/* Main content — split layout */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8 pt-28 md:pt-32 pb-12">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center min-h-[calc(100vh-10rem)]">
          {/* Left — Text */}
          <div className="order-2 lg:order-1 text-center lg:text-left">
            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-gold text-sm tracking-[0.3em] uppercase mb-6"
            >
              Dal cuore della Toscana, dal 2000
            </motion.p>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.4 }}
              className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl xl:text-7xl leading-[1.1] mb-6"
            >
              L&apos;eccellenza
              <br className="hidden sm:block" />
              sartoriale{" "}
              <span className="gold-gradient">su misura</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="text-base md:text-lg text-foreground/50 max-w-lg mx-auto lg:mx-0 mb-8 leading-relaxed"
            >
              Partner manifatturiero delle griffe più prestigiose al mondo.
              Oltre 500.000 camicie l&apos;anno, dove tradizione artigianale
              e tecnologia AI si incontrano.
            </motion.p>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.9 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <a
                href="#contatti"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-gold to-gold-dark text-background font-medium text-sm tracking-[0.1em] uppercase hover:from-gold-light hover:to-gold transition-all duration-300 hover:shadow-[0_4px_20px_rgba(198,159,115,0.3)] hover:-translate-y-0.5"
              >
                Richiedi un tour
              </a>
              <a
                href="#processo"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-gold/30 text-gold text-sm tracking-[0.1em] uppercase hover:bg-gold/10 transition-all duration-300"
              >
                Scopri il processo
              </a>
            </motion.div>
          </div>

          {/* Right — Hero Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.3 }}
            className="order-1 lg:order-2 relative"
          >
            <div className="relative aspect-[4/5] md:aspect-[3/4] lg:aspect-[4/5] max-h-[70vh] mx-auto w-full max-w-md lg:max-w-none rounded-lg overflow-hidden">
              <Image
                src="https://www.gherardipro.com/wp-content/uploads/2022/10/1Q1A9976-GHERARDI-CHISIAMO.jpg"
                alt="Gherardi Pro — Eccellenza sartoriale"
                fill
                className="object-cover"
                unoptimized
                priority
              />
              {/* Gradient overlay bottom */}
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/20" />
              {/* Gold border accent */}
              <div className="absolute inset-0 ring-1 ring-inset ring-gold/20 rounded-lg" />
            </div>

            {/* Floating badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.2 }}
              className="absolute -bottom-4 left-4 right-4 sm:left-6 sm:right-auto bg-charcoal/90 backdrop-blur-md border border-gold/20 rounded-lg px-5 py-4"
            >
              <p className="text-gold text-xs tracking-[0.2em] uppercase mb-1">Dal 2000</p>
              <p className="text-foreground/70 text-sm">Pieve Santo Stefano, Toscana</p>
            </motion.div>
          </motion.div>
        </div>

        {/* Numbers — below both columns */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="mt-16 md:mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-12"
        >
          {[
            { value: "500K+", label: "Camicie / anno" },
            { value: "30+", label: "Anni di esperienza" },
            { value: "11", label: "Griffe partner" },
            { value: "3", label: "Sedi produttive" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl lg:text-4xl text-gold mb-1">
                {stat.value}
              </div>
              <div className="text-xs text-foreground/40 tracking-wide uppercase">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <ArrowDown className="text-gold/30" size={24} />
        </motion.div>
      </motion.div>
    </section>
  );
}
