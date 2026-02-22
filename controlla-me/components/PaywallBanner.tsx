"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Crown, Zap, Loader2 } from "lucide-react";
import Link from "next/link";

interface PaywallBannerProps {
  analysesUsed: number;
  analysesLimit: number;
  authenticated: boolean;
}

export default function PaywallBanner({
  analysesUsed,
  analysesLimit,
  authenticated,
}: PaywallBannerProps) {
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
      } else if (res.status === 401) {
        window.location.href = "/dashboard";
      } else {
        alert(data.error || "Errore durante il checkout");
      }
    } catch {
      alert("Errore. Riprova.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[520px] w-full"
    >
      {/* Limit card */}
      <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-accent/[0.04] p-8 md:p-10 text-center">
        {/* Top glow */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,107,53,0.5), transparent)",
          }}
        />

        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-accent/10">
          <Lock className="w-7 h-7 text-accent" />
        </div>

        <h3 className="text-xl font-bold mb-2">
          Hai usato tutte le analisi gratuite
        </h3>
        <p className="text-sm text-foreground-secondary mb-2">
          {analysesUsed}/{analysesLimit} analisi utilizzate questo mese
        </p>

        {/* Usage bar */}
        <div className="h-[4px] rounded-full bg-background-secondary overflow-hidden max-w-[200px] mx-auto mb-6">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-red-500"
            style={{ width: "100%" }}
          />
        </div>

        {!authenticated ? (
          <>
            <p className="text-sm text-foreground-secondary mb-5">
              Accedi per gestire il tuo piano o sblocca analisi illimitate.
            </p>
            <Link
              href="/dashboard"
              className="inline-block px-8 py-3 rounded-full text-sm font-bold text-white bg-gradient-to-r from-accent to-amber-500 hover:-translate-y-0.5 transition-all"
              style={{
                boxShadow: "0 12px 40px rgba(255,107,53,0.3)",
              }}
            >
              Accedi
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground-secondary mb-6">
              Scegli come continuare:
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {/* Pro subscription */}
              <button
                onClick={() => handleCheckout("pro")}
                disabled={loading !== null}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white bg-gradient-to-r from-accent to-amber-500 hover:-translate-y-0.5 transition-all disabled:opacity-50"
                style={{
                  boxShadow: "0 12px 40px rgba(255,107,53,0.3)",
                }}
              >
                {loading === "pro" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Crown className="w-4 h-4" />
                    Pro &mdash; &euro;4,99/mese
                  </>
                )}
              </button>

              {/* Single analysis */}
              <button
                onClick={() => handleCheckout("single")}
                disabled={loading !== null}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-foreground-secondary border border-border hover:border-border hover:text-foreground transition-all disabled:opacity-50"
              >
                {loading === "single" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Singola &mdash; &euro;0,99
                  </>
                )}
              </button>
            </div>

            <Link
              href="/pricing"
              className="inline-block mt-5 text-xs text-foreground-tertiary hover:text-foreground-secondary transition-colors underline underline-offset-4"
            >
              Confronta i piani
            </Link>
          </>
        )}
      </div>
    </motion.div>
  );
}
