"use client";

/**
 * StudiaFooter — Footer dedicato studia.me
 *
 * Nessun riferimento a controlla.me. Branding sky blue.
 */

import { motion } from "framer-motion";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

const ACCENT = "#0EA5E9";

export default function StudiaFooter() {
  return (
    <footer className="relative z-10 border-t border-white/10">
      <div className="max-w-[1000px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
          {/* Brand */}
          <div>
            <Link href="/studia" className="inline-flex items-center gap-2 mb-4">
              <GraduationCap className="w-5 h-5" style={{ color: ACCENT }} />
              <span className="font-serif text-2xl text-white">studia</span>
              <span className="font-serif text-2xl" style={{ color: ACCENT }}>.me</span>
            </Link>
            <p className="text-sm text-white/40 leading-relaxed">
              AI per studenti di medicina.
              <br />
              Studia meglio, non di più.
            </p>
          </div>

          {/* Risorse */}
          <div>
            <h4 className="text-xs font-bold tracking-[2px] uppercase text-white/50 mb-4">Risorse</h4>
            <ul className="space-y-2.5">
              {[
                { label: "Fonti mediche", href: "/studia" },
                { label: "Chiedi al Tutor", href: "/studia#chat" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-white/40 hover:text-white/60 transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legale */}
          <div>
            <h4 className="text-xs font-bold tracking-[2px] uppercase text-white/50 mb-4">Informazioni</h4>
            <ul className="space-y-2.5">
              {[
                { label: "Privacy Policy", href: "#" },
                { label: "Termini di servizio", href: "#" },
                { label: "Cookie Policy", href: "#" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-white/40 hover:text-white/60 transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/10">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} studia.me — Strumento di studio, non sostituisce il parere medico.
          </p>
          <div className="flex items-center gap-1.5">
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: ACCENT }}
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-xs text-white/30">Tutti i sistemi operativi</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
