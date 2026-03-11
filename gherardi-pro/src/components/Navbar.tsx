"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";

const NAV_ITEMS = [
  { label: "Chi Siamo", href: "#chi-siamo" },
  { label: "Il Processo", href: "#processo" },
  { label: "Tecnologia", href: "#tecnologia" },
  { label: "Servizi", href: "#servizi" },
  { label: "Clienti", href: "#clienti" },
  { label: "Sostenibilita", href: "#sostenibilita" },
  { label: "Contatti", href: "#contatti" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-gold/10">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <a href="#" className="flex items-baseline gap-3">
            <span className="font-[family-name:var(--font-playfair)] text-2xl tracking-tight text-foreground">
              Gherardi
            </span>
            <span className="text-gold text-xs font-medium tracking-[0.2em] uppercase">
              Pro
            </span>
          </a>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-foreground/60 hover:text-gold transition-colors duration-300 tracking-wide"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#contatti"
              className="ml-4 px-6 py-2.5 bg-gold/10 border border-gold/30 text-gold text-sm tracking-widest uppercase hover:bg-gold/20 transition-all duration-300"
            >
              Contattaci
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="lg:hidden text-foreground/70 hover:text-gold transition-colors"
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-background border-b border-gold/10 overflow-hidden"
          >
            <div className="px-6 py-6 flex flex-col gap-4">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="text-base text-foreground/60 hover:text-gold transition-colors py-2"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="#contatti"
                onClick={() => setOpen(false)}
                className="mt-2 px-6 py-3 bg-gold/10 border border-gold/30 text-gold text-sm tracking-widest uppercase text-center hover:bg-gold/20 transition-all"
              >
                Contattaci
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
