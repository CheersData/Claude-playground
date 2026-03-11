"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Mail, User, CheckCircle, FileText, ArrowLeft, Shield, AlertTriangle, Clock } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const benefits = [
  { icon: Shield, text: "15 clausole illegittime da riconoscere subito" },
  { icon: AlertTriangle, text: "Cosa puoi fare se le trovi nel tuo contratto" },
  { icon: Clock, text: "Aggiornato con la normativa 2024" },
];

export default function ResourcesPageClient() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError("Inserisci nome ed email per continuare.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Inserisci un indirizzo email valido.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/resources/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), source: "checklist-affitti" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Errore durante la registrazione.");
      }

      setDownloadUrl(data.downloadUrl);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Navbar />

      {/* Background orbs */}
      <div
        className="floating-orb"
        style={{ width: 400, height: 400, left: "5%", top: "10%", animationDelay: "0s" }}
      />
      <div
        className="floating-orb"
        style={{ width: 250, height: 250, left: "75%", top: "50%", animationDelay: "3s" }}
      />
      <div
        className="floating-orb"
        style={{ width: 180, height: 180, left: "55%", top: "15%", animationDelay: "6s" }}
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

        <div className="grid md:grid-cols-2 gap-12 items-start">
          {/* Left column — hero content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/[0.06] text-accent text-xs font-semibold tracking-wide uppercase mb-6">
              <Download className="w-3.5 h-3.5" />
              Download gratuito
            </div>

            <h1 className="font-serif text-4xl md:text-5xl leading-tight mb-5">
              Checklist clausole{" "}
              <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
                illegittime
              </span>{" "}
              nei contratti di affitto
            </h1>

            <p className="text-lg text-foreground-secondary mb-8 leading-relaxed">
              Ogni anno migliaia di inquilini firmano contratti con clausole nulle o illegittime.
              Spesso non lo sanno nemmeno. Questa checklist ti aiuta a riconoscerle{" "}
              <strong className="text-foreground">prima di firmare</strong>.
            </p>

            {/* Benefits list */}
            <ul className="space-y-4 mb-8">
              {benefits.map((benefit, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <benefit.icon className="w-4 h-4 text-accent" />
                  </div>
                  <span className="text-foreground-secondary">{benefit.text}</span>
                </motion.li>
              ))}
            </ul>

            {/* Social proof */}
            <div className="flex items-center gap-3 pt-6 border-t border-border">
              <div className="flex -space-x-2">
                {["#FF6B35", "#4ECDC4", "#A78BFA"].map((color, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: color }}
                  >
                    {["A", "M", "L"][i]}
                  </div>
                ))}
              </div>
              <p className="text-sm text-foreground-tertiary">
                <span className="text-foreground font-medium">+1.200 persone</span> hanno già scaricato questa guida
              </p>
            </div>
          </motion.div>

          {/* Right column — form / success */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <div className="rounded-3xl border border-border bg-white shadow-lg p-8">
              <AnimatePresence mode="wait">
                {!submitted ? (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Scarica gratis</p>
                        <p className="text-xs text-foreground-tertiary">PDF • Aggiornato 2024</p>
                      </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Name field */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          Nome
                        </label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-tertiary pointer-events-none" />
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Il tuo nome"
                            disabled={loading}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background-secondary text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all disabled:opacity-60"
                          />
                        </div>
                      </div>

                      {/* Email field */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          Email
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-tertiary pointer-events-none" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="la.tua@email.it"
                            disabled={loading}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background-secondary text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all disabled:opacity-60"
                          />
                        </div>
                      </div>

                      {/* Error message */}
                      <AnimatePresence>
                        {error && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5"
                          >
                            {error}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      {/* Submit button */}
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 rounded-xl font-semibold text-white bg-accent hover:bg-accent-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <>
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                            />
                            Elaborazione...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            Scarica gratis
                          </>
                        )}
                      </button>

                      <p className="text-xs text-center text-foreground-tertiary">
                        Nessuno spam. Puoi cancellarti in qualsiasi momento.
                      </p>
                    </form>
                  </motion.div>
                ) : (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-4"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                      className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5"
                    >
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    </motion.div>

                    <h3 className="font-semibold text-xl text-foreground mb-2">
                      Ottimo, {name.split(" ")[0]}!
                    </h3>
                    <p className="text-foreground-secondary text-sm mb-7">
                      La tua checklist è pronta. Clicca il bottone per scaricarla.
                    </p>

                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        download
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-accent hover:bg-accent-dark transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Scarica la checklist PDF
                      </a>
                    )}

                    <div className="mt-8 pt-6 border-t border-border">
                      <p className="text-sm text-foreground-tertiary mb-3">
                        Vuoi un&apos;analisi completa del tuo contratto?
                      </p>
                      <Link
                        href="/"
                        className="text-sm font-medium text-accent hover:text-accent-dark transition-colors"
                      >
                        Prova controlla.me gratis →
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* Trust section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-20 text-center"
        >
          <p className="text-sm text-foreground-tertiary mb-6">
            Questa checklist è uno strumento informativo. Per situazioni complesse, consulta un avvocato.
          </p>
          <div className="flex flex-wrap justify-center gap-8 text-foreground-tertiary text-sm">
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              Nessun dato venduto a terzi
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" />
              Contenuto verificato
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              Download immediato
            </span>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
