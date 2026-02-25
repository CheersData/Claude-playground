"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronUp } from "lucide-react";

const navLinks = [
  { label: "Come funziona", href: "/#mission", sectionId: "mission" },
  { label: "Casi d'uso", href: "/#use-cases", sectionId: "use-cases" },
  { label: "Corpus", href: "/corpus", sectionId: null },
  { label: "Prezzi", href: "/pricing", sectionId: null },
];

interface NavbarProps {
  /** Called when logo is clicked — use to reset app state (e.g. return to landing view) */
  onLogoClick?: () => void;
}

export default function Navbar({ onLogoClick }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Track scroll position for navbar background + active section
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 600);

      // Only track sections on home page
      if (pathname !== "/") return;

      const sections = ["mission", "use-cases", "upload-section"];
      let current: string | null = null;

      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200 && rect.bottom > 100) {
            current = id;
          }
        }
      }
      setActiveSection(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    // Delay to avoid closing on the same click that opens
    const t = setTimeout(() => document.addEventListener("click", handleClickOutside), 10);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [mobileOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Handle logo click
  const handleLogoClick = useCallback(
    (e: React.MouseEvent) => {
      if (onLogoClick) {
        e.preventDefault();
        onLogoClick();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      // If no onLogoClick, the Link naturally navigates to /
    },
    [onLogoClick]
  );

  // Handle nav link click — smooth scroll if on home page
  const handleNavClick = useCallback(
    (e: React.MouseEvent, link: typeof navLinks[number]) => {
      setMobileOpen(false);

      // If it's an anchor link to a section on the home page
      if (link.sectionId) {
        if (pathname === "/") {
          // Already on home — smooth scroll
          e.preventDefault();
          const el = document.getElementById(link.sectionId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
        // If NOT on home, let the Link navigate to /#section (Next.js handles it)
      }
    },
    [pathname]
  );

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const isLinkActive = (link: typeof navLinks[number]) => {
    // For page links (no sectionId)
    if (!link.sectionId) return pathname === link.href;
    // For section links on home page
    if (pathname === "/") return activeSection === link.sectionId;
    return false;
  };

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-6 md:px-10 py-3 bg-white border-b border-border shadow-sm"
      >
        {/* Logo — always clickable to go home */}
        <Link
          href="/"
          onClick={handleLogoClick}
          className="flex items-baseline gap-0.5 group"
        >
          <span className="font-serif text-[28px] text-foreground italic group-hover:text-foreground/80 transition-colors">
            controlla
          </span>
          <span className="font-serif text-[28px] text-accent group-hover:text-accent/80 transition-colors">
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
                    ? "text-foreground"
                    : "text-foreground-secondary hover:text-foreground"
                }`}
              >
                {link.label}
                {/* Active indicator dot */}
                {active && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
          <Link
            href="/dashboard"
            className={`ml-3 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(255,107,53,0.35)] ${
              pathname === "/dashboard"
                ? "bg-accent shadow-[0_8px_30px_rgba(255,107,53,0.3)]"
                : "bg-gradient-to-br from-accent to-[#E8451A]"
            }`}
          >
            {pathname === "/dashboard" ? "Dashboard" : "Accedi"}
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden w-11 h-11 flex items-center justify-center rounded-xl bg-background-secondary border border-border"
          onClick={(e) => {
            e.stopPropagation();
            setMobileOpen(!mobileOpen);
          }}
        >
          {mobileOpen ? (
            <X className="w-5 h-5 text-foreground-secondary" />
          ) : (
            <Menu className="w-5 h-5 text-foreground-secondary" />
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
              className="absolute top-full left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-border shadow-lg px-6 py-6 md:hidden"
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
                          ? "bg-accent/10 text-foreground font-semibold"
                          : "text-foreground-secondary hover:bg-background-secondary hover:text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {active && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        )}
                        {link.label}
                      </span>
                    </Link>
                  );
                })}
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="mt-3 px-5 py-3 rounded-full text-center text-base font-bold text-white bg-gradient-to-br from-accent to-[#E8451A]"
                >
                  {pathname === "/dashboard" ? "Dashboard" : "Accedi"}
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Scroll to top button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 z-50 w-11 h-11 rounded-full bg-white backdrop-blur-md border border-border shadow-md flex items-center justify-center hover:bg-surface-hover hover:border-border transition-all group"
            aria-label="Torna su"
          >
            <ChevronUp className="w-5 h-5 text-foreground-tertiary group-hover:text-foreground transition-colors" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
