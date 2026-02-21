"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Come funziona", href: "/#mission" },
  { label: "Il Team", href: "/#team" },
  { label: "Casi d'uso", href: "/#use-cases" },
  { label: "Prezzi", href: "/pricing" },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-6 md:px-10 py-5 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/[0.04]">
      {/* Logo */}
      <Link href="/" className="flex items-baseline gap-0.5">
        <span className="font-serif text-[28px] text-white italic">controlla</span>
        <span className="font-serif text-[28px] text-accent">.me</span>
      </Link>

      {/* Desktop nav */}
      <div className="hidden md:flex gap-3 items-center">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="px-4 py-2 rounded-full text-sm font-medium text-white/50 hover:text-white/90 transition-colors"
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/dashboard"
          className="ml-2 px-5 py-2.5 rounded-full text-sm font-bold text-white bg-gradient-to-br from-accent to-[#E8451A] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(255,107,53,0.35)] transition-all"
        >
          Accedi
        </Link>
      </div>

      {/* Mobile hamburger */}
      <button
        className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.1]"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5 text-white/70" /> : <Menu className="w-5 h-5 text-white/70" />}
      </button>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 right-0 bg-[#0A0A0A]/95 backdrop-blur-xl border-b border-white/[0.06] px-6 py-6 md:hidden"
          >
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-3 rounded-xl text-base text-white/60 hover:bg-white/[0.05] hover:text-white transition-all"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="mt-2 px-5 py-3 rounded-full text-center text-base font-bold text-white bg-gradient-to-br from-accent to-[#E8451A]"
              >
                Accedi
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
