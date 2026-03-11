"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Mail,
  CheckCircle,
  FileText,
  ArrowLeft,
  BookOpen,
  Scale,
  Tag,
  Shield,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const bullets = [
  "Aggiornata L. 431/1998",
  "Clausole da rifiutare",
  "Template lettere legali",
];

const resources = [
  {
    icon: BookOpen,
    color: "#4ECDC4",
    title: "Glossario dei contratti",
    description:
      "Oltre 6.100 articoli legislativi italiani ed europei. Cerca qualsiasi norma in linguaggio semplice.",
    href: "/corpus",
    cta: "Consulta il corpus →",
  },
  {
    icon: Scale,
    color: "#FF6B6B",
    title: "Analizza il tuo contratto",
    description:
      "4 agenti AI leggono il tuo documento, identificano le clausole rischiose e ti spiegano cosa fare.",
    href: "/legaloffice",
    cta: "Analizza gratis →",
  },
  {
    icon: Tag,
    color: "#FFC832",
    title: "Piani e prezzi",
    description:
      "Inizia gratis con 3 analisi al mese. Passa a Pro per analisi illimitate a €4,99/mese.",
    href: "/pricing",
    cta: "Scopri i piani →",
  },
];

export default function ResourcesClient() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Inserisci la tua email per continuare.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Inserisci un indirizzo email valido.");
      return;
    }

    setSubmitted(true);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Navbar />

      {/* Background orbs */}
      <div
        className="floating-orb"
        style={{ width: 350, height: 350, left: "5%", top: "12%", animationDelay: "0s" }}
      />
      <div
        className="floating-orb"
        style={{ width: 220, height: 220, left: "72%", top: "55%", animationDelay: "4s" }}
      />

      <div className="relative z-10 px-6 pt-32 pb-24 max-w-[1000px] mx-auto">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          Torna alla home
        </Link>

        {/* ── Hero section ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/[0.06] text-accent text-xs font-semibold tracking-wide uppercase mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Risorse gratuite
          </div>

          <h1 className="font-serif text-4xl md:text-5xl leading-tight mb-5">
            Tutto quello che ti serve per{" "}
            <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
              firmare in sicurezza
            </span>
          </h1>

          <p className="text-lg text-foreground-secondary leading-relaxed">
            Guide pratiche scritte da avvocati, aggiornate 2025.
          </p>
        </motion.div>

        {/* ── Lead magnet card ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="rounded-3xl border border-accent/40 bg-accent/[0.04] p-8 md:p-10 mb-16 relative overflow-hidden"
        >
          {/* Decorative stripe */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent to-amber-400 rounded-t-3xl" />

          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* Left — description */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    PDF gratuito · 32 pagine
                  </p>
                  <h2 className="font-serif text-xl md:text-2xl leading-snug">
                    Guida pratica ai contratti d&apos;affitto 2025
                  </h2>
                </div>
              </div>

              <p className="text-foreground-secondary text-sm leading-relaxed mb-5">
                Cosa controllare prima di firmare, clausole rischiose, diritti del
                conduttore, deposito cauzionale, recesso anticipato.
              </p>

              <ul className="space-y-2">
                {bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-center gap-2.5 text-sm text-foreground-secondary"
                  >
                    <CheckCircle className="w-4 h-4 flex-shrink-0 text-accent" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — form / success */}
            <div>
              <AnimatePresence mode="wait">
                {!submitted ? (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="bg-white rounded-2xl border border-border shadow-sm p-6"
                  >
                    <p className="font-semibold text-foreground mb-4">
                      Ricevi la guida via email
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-tertiary pointer-events-none" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (error) setError(null);
                          }}
                          placeholder="la.tua@email.it"
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background-secondary text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all text-sm"
                        />
                      </div>

                      <AnimatePresence>
                        {error && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-2"
                          >
                            {error}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      <button
                        type="submit"
                        className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-accent to-amber-500 shadow-[0_8px_24px_rgba(255,107,53,0.25)] hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Scarica gratis
                      </button>
                    </form>

                    <p className="text-xs text-center text-foreground-tertiary mt-3">
                      Nessuno spam. Dati trattati ai sensi del GDPR.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 280, damping: 22 }}
                    className="bg-white rounded-2xl border border-green-200 shadow-sm p-6 text-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
                      className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"
                    >
                      <CheckCircle className="w-7 h-7 text-green-500" />
                    </motion.div>

                    <h3 className="font-semibold text-foreground mb-2">
                      ✅ Controlla la tua email!
                    </h3>
                    <p className="text-sm text-foreground-secondary">
                      Ti abbiamo inviato il link per il download.
                    </p>

                    <div className="mt-5 pt-4 border-t border-border">
                      <p className="text-xs text-foreground-tertiary mb-2">
                        Nel frattempo, analizza il tuo contratto gratis:
                      </p>
                      <Link
                        href="/legaloffice"
                        className="text-sm font-medium text-accent hover:text-amber-500 transition-colors"
                      >
                        Prova controlla.me →
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* ── Resources grid ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h2 className="font-serif text-2xl md:text-3xl text-center mb-8">
            Altre risorse utili
          </h2>

          <div className="grid md:grid-cols-3 gap-5">
            {resources.map((res, i) => (
              <motion.div
                key={res.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.08 }}
                className="rounded-2xl border border-border bg-white shadow-sm p-6 flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all group"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 flex-shrink-0"
                  style={{ background: `${res.color}18` }}
                >
                  <res.icon className="w-5 h-5" style={{ color: res.color }} />
                </div>

                <h3 className="font-semibold text-foreground mb-2">{res.title}</h3>
                <p className="text-sm text-foreground-secondary leading-relaxed flex-1 mb-4">
                  {res.description}
                </p>

                <Link
                  href={res.href}
                  className="text-sm font-medium transition-colors"
                  style={{ color: res.color }}
                >
                  {res.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Trust bar ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="mt-16 pt-8 border-t border-border text-center"
        >
          <div className="inline-flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-foreground-tertiary">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              6.100+ articoli legislativi
            </span>
            <span className="text-border">·</span>
            <span>Corpus IT+EU</span>
            <span className="text-border">·</span>
            <span>Aggiornato 2025</span>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
