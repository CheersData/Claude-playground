"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Crown, FileText, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const plans = [
  {
    id: "free" as const,
    name: "Free",
    price: "0",
    period: "per sempre",
    description: "Perfetto per provare il servizio",
    features: [
      "3 analisi al mese",
      "1 approfondimento AI",
      "Report completo",
      "4 agenti AI",
    ],
    icon: FileText,
    color: "#888",
    popular: false,
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "4,99",
    period: "/mese",
    description: "Per chi lavora con i contratti",
    features: [
      "Analisi illimitate",
      "Approfondimenti AI illimitati",
      "Report completo + export",
      "4 agenti AI",
      "Priorità di elaborazione",
      "Storico analisi",
    ],
    icon: Crown,
    color: "#FF6B35",
    popular: true,
  },
  {
    id: "single" as const,
    name: "Singola",
    price: "0,99",
    period: "una tantum",
    description: "Un documento importante da controllare",
    features: [
      "1 analisi completa",
      "1 approfondimento AI",
      "Report completo",
      "4 agenti AI",
    ],
    icon: Zap,
    color: "#FFC832",
    popular: false,
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleCheckout = async (plan: "pro" | "single") => {
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        // If not logged in, redirect to login
        if (res.status === 401) {
          window.location.href = "/dashboard";
        } else {
          alert(data.error);
        }
      }
    } catch {
      alert("Errore durante il checkout. Riprova.");
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Nessun abbonamento attivo");
      }
    } catch {
      alert("Errore. Riprova.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Navbar />

      {/* Background orbs */}
      <div
        className="floating-orb"
        style={{ width: 300, height: 300, left: "10%", top: "15%" }}
      />
      <div
        className="floating-orb"
        style={{
          width: 200,
          height: 200,
          left: "70%",
          top: "60%",
          animationDelay: "3s",
        }}
      />

      <div className="relative z-10 px-6 pt-32 pb-20 max-w-[1100px] mx-auto">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          Torna alla home
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-14"
        >
          <h1 className="font-serif text-4xl md:text-5xl mb-4">
            Scegli il tuo{" "}
            <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
              piano
            </span>
          </h1>
          <p className="text-lg text-white/40 max-w-[480px] mx-auto">
            Inizia gratis. Passa a Pro quando vuoi, cancella quando vuoi.
          </p>
        </motion.div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className={`relative rounded-3xl border p-8 flex flex-col ${
                plan.popular
                  ? "border-accent/40 bg-accent/[0.04]"
                  : "border-white/[0.08] bg-white/[0.02]"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-gradient-to-r from-accent to-amber-500 text-white">
                  Consigliato
                </div>
              )}

              {/* Icon + name */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${plan.color}15` }}
                >
                  <plan.icon
                    className="w-5 h-5"
                    style={{ color: plan.color }}
                  />
                </div>
                <h3 className="text-lg font-bold">{plan.name}</h3>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold">&euro;{plan.price}</span>
                <span className="text-sm text-white/40">{plan.period}</span>
              </div>
              <p className="text-sm text-white/40 mb-6">{plan.description}</p>

              {/* Features */}
              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-3 text-sm text-white/70"
                  >
                    <Check
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: plan.color }}
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {plan.id === "free" ? (
                <Link
                  href="/"
                  className="block text-center px-6 py-3 rounded-full text-sm font-bold border border-white/[0.15] text-white/70 hover:border-white/40 hover:text-white transition-all"
                >
                  Inizia gratis
                </Link>
              ) : (
                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={loading !== null}
                  className={`px-6 py-3 rounded-full text-sm font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                    plan.popular
                      ? "bg-gradient-to-r from-accent to-amber-500 shadow-[0_12px_40px_rgba(255,107,53,0.3)]"
                      : "bg-white/[0.08] border border-white/[0.15] hover:bg-white/[0.12]"
                  }`}
                >
                  {loading === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : plan.id === "pro" ? (
                    "Abbonati a Pro"
                  ) : (
                    "Acquista analisi"
                  )}
                </button>
              )}
            </motion.div>
          ))}
        </div>

        {/* Manage subscription */}
        <div className="text-center">
          <p className="text-sm text-white/30 mb-3">
            Hai già un abbonamento Pro?
          </p>
          <button
            onClick={handlePortal}
            disabled={loading !== null}
            className="text-sm text-accent/70 hover:text-accent transition-colors underline underline-offset-4"
          >
            {loading === "portal" ? "Caricamento..." : "Gestisci abbonamento"}
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-10 border-t border-white/[0.04] text-white/20 text-sm relative z-10">
        <span className="font-serif italic">controlla.me</span> — Non
        sostituisce un avvocato. Ti aiuta a capire cosa stai firmando.
      </footer>
    </div>
  );
}
