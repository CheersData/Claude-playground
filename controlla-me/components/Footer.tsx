"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-border-subtle">
      <div className="max-w-[1000px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="inline-flex items-baseline gap-0.5 mb-4">
              <span className="font-serif text-2xl text-foreground italic">controlla</span>
              <span className="font-serif text-2xl text-accent">.me</span>
            </Link>
            <p className="text-sm text-foreground-tertiary leading-relaxed">
              Il tuo studio legale AI.
              <br />
              4 consulenti, 30 secondi, zero sorprese.
            </p>
          </div>

          {/* Prodotto */}
          <div>
            <h4 className="text-xs font-bold tracking-[2px] uppercase text-foreground-secondary mb-4">Prodotto</h4>
            <ul className="space-y-2.5">
              {[
                { label: "Come funziona", href: "/#mission" },
                { label: "Il Team AI", href: "/#team" },
                { label: "Casi d'uso", href: "/#use-cases" },
                { label: "Prezzi", href: "/pricing" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Risorse */}
          <div>
            <h4 className="text-xs font-bold tracking-[2px] uppercase text-foreground-secondary mb-4">Risorse</h4>
            <ul className="space-y-2.5">
              {[
                { label: "Dashboard", href: "/dashboard" },
                { label: "FAQ", href: "/#faq" },
                { label: "Blog", href: "#" },
                { label: "Contatti", href: "#" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legale */}
          <div>
            <h4 className="text-xs font-bold tracking-[2px] uppercase text-foreground-secondary mb-4">Legale</h4>
            <ul className="space-y-2.5">
              {[
                { label: "Privacy Policy", href: "#" },
                { label: "Termini di servizio", href: "#" },
                { label: "Cookie Policy", href: "#" },
                { label: "GDPR", href: "#" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-border-subtle">
          <p className="text-xs text-foreground-tertiary">
            &copy; {new Date().getFullYear()} controlla.me — Non sostituisce un avvocato. Ti aiuta a capire cosa stai firmando.
          </p>
          <div className="flex items-center gap-1.5">
            <motion.div
              className="w-2 h-2 rounded-full bg-emerald-500"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-xs text-foreground-tertiary">Tutti i sistemi operativi</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
