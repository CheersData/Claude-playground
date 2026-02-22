"use client";

import { motion } from "framer-motion";
import { Shield, ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function CTASection({ onScrollToUpload }: { onScrollToUpload: () => void }) {
  return (
    <section className="relative z-10 px-6 py-24">
      <div className="max-w-[800px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[32px] border border-accent/20 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(255,107,53,0.08), rgba(255,107,53,0.02))",
          }}
        >
          {/* Background cubist image */}
          <div className="absolute inset-0 pointer-events-none">
            <Image
              src="/images/confidential-docs.png"
              alt=""
              fill
              className="object-cover opacity-[0.06]"
              quality={60}
            />
          </div>

          {/* Animated border glow */}
          <motion.div
            className="absolute inset-0 rounded-[32px] pointer-events-none"
            style={{
              background: "linear-gradient(135deg, transparent, rgba(255,107,53,0.1), transparent)",
            }}
            animate={{
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Floating particles */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-accent/30"
              style={{
                left: `${15 + i * 14}%`,
                top: `${20 + (i * 17) % 60}%`,
              }}
              animate={{
                y: [0, -20, 0],
                opacity: [0, 0.6, 0],
              }}
              transition={{
                duration: 3 + i * 0.5,
                delay: i * 0.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}

          <div className="relative px-8 md:px-14 py-14 md:py-20">
            <motion.div
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", delay: 0.2 }}
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-accent/10 border border-accent/20"
            >
              <Shield className="w-7 h-7 text-accent" />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="font-serif text-3xl md:text-5xl mb-4"
            >
              Pronto a{" "}
              <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
                proteggerti?
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="text-base text-foreground-secondary max-w-[440px] mx-auto mb-8 leading-relaxed"
            >
              Le prime 3 analisi sono gratuite. Nessuna carta di credito richiesta.
              Carica il tuo primo documento e scopri cosa stai firmando.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <motion.button
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onScrollToUpload}
                className="px-10 py-4 rounded-full text-base font-bold text-white bg-gradient-to-r from-accent to-amber-500 flex items-center gap-2 relative overflow-hidden group"
                style={{ boxShadow: "0 12px 40px rgba(255,107,53,0.3)" }}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                  animate={{ x: ["-200%", "200%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
                />
                <span className="relative z-10">Analizza gratis</span>
                <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
              </motion.button>

              <Link
                href="/pricing"
                className="px-8 py-4 rounded-full text-sm font-medium text-foreground-secondary border border-border hover:border-border hover:text-foreground transition-all"
              >
                Vedi i piani Pro
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
