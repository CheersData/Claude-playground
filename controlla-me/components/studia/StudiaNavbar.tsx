"use client";

/**
 * StudiaNavbar — Navbar dedicata studia.me
 *
 * Nessun riferimento a controlla.me. Branding sky blue.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronUp, GraduationCap } from "lucide-react";

const ACCENT = "#0EA5E9";

const navLinks = [
  { label: "Fonti", href: "/studia", sectionId: null },
  { label: "Chiedi al Tutor", href: "/studia#chat", sectionId: "chat" },
];

export default function StudiaNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 600);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("click", handleClickOutside), 10);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [mobileOpen]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleNavClick = useCallback(
    (e: React.MouseEvent, link: typeof navLinks[number]) => {
      setMobileOpen(false);
      if (link.sectionId && pathname === "/studia") {
        e.preventDefault();
        const el = document.getElementById(link.sectionId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [pathname]
  );

  const isLinkActive = (link: typeof navLinks[number]) => {
    if (!link.sectionId) return pathname === link.href;
    return false;
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-6 md:px-10 py-3 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-white/10">
        {/* Logo */}
        <Link href="/studia" className="flex items-center gap-2 group">
          <GraduationCap className="w-6 h-6 transition-colors" style={{ color: ACCENT }} />
          <span className="font-serif text-[26px] text-white group-hover:text-white/80 transition-colors">
            studia
          </span>
          <span className="font-serif text-[26px] transition-colors" style={{ color: ACCENT }}>
            .me
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex gap-1 items-center">
          {navLinks.map((link) => {
            const active = isLinkActive(link);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link)}
                className={`relative px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  active
                    ? "text-white"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                {link.label}
                {active && (
                  <motion.div
                    layoutId="studia-nav-active"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ backgroundColor: ACCENT }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10"
          onClick={(e) => {
            e.stopPropagation();
            setMobileOpen(!mobileOpen);
          }}
          aria-label={mobileOpen ? "Chiudi menu" : "Apri menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <X className="w-5 h-5 text-white/60" />
          ) : (
            <Menu className="w-5 h-5 text-white/60" />
          )}
        </button>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              ref={mobileMenuRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-white/10 shadow-lg px-6 py-6 md:hidden"
            >
              <div className="flex flex-col gap-1">
                {navLinks.map((link) => {
                  const active = isLinkActive(link);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={(e) => handleNavClick(e, link)}
                      className={`px-4 py-3 rounded-xl text-base transition-all ${
                        active
                          ? "bg-sky-500/10 text-white font-semibold"
                          : "text-white/50 hover:bg-white/5 hover:text-white/80"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {active && (
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
                        )}
                        {link.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Scroll to top */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 z-50 w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/10 shadow-md flex items-center justify-center hover:bg-white/15 transition-all group"
            aria-label="Torna su"
          >
            <ChevronUp className="w-5 h-5 text-white/40 group-hover:text-white/70 transition-colors" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
