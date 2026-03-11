"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import type { Risk } from "@/lib/types";
import DeepSearchChat from "./DeepSearchChat";

interface RiskCardProps {
  risk: Risk;
  index: number;
  analysisId?: string;
}

interface UsageData {
  authenticated: boolean;
  plan: "free" | "pro";
  canDeepSearch: boolean;
  deepSearchUsed: number;
  deepSearchLimit: number;
}

const severityStyles = {
  alta: {
    bg: "bg-red-50",
    border: "border-red-500/40",
    text: "text-red-400",
    badge: "bg-red-950 border-red-500 text-red-400",
  },
  media: {
    bg: "bg-amber-50",
    border: "border-amber-500/40",
    text: "text-amber-400",
    badge: "bg-amber-950 border-amber-500 text-amber-400",
  },
  bassa: {
    bg: "bg-green-50",
    border: "border-green-500/40",
    text: "text-green-400",
    badge: "bg-green-950 border-green-500 text-green-400",
  },
};

export default function RiskCard({ risk, index, analysisId }: RiskCardProps) {
  const [showDeepSearch, setShowDeepSearch] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const style = severityStyles[risk.severity] || severityStyles.media;

  // Pre-fetch usage on mount so the badge is visible before any click
  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setUsageData(data as UsageData);
      })
      .catch(() => {/* ignore — badge simply won't show */});
    return () => { cancelled = true; };
  }, []);

  const handleDeepSearchClick = async () => {
    if (showDeepSearch) {
      setShowDeepSearch(false);
      return;
    }

    // Se abbiamo già il dato e il deep search è consentito, apri subito
    if (usageData?.canDeepSearch) {
      setShowDeepSearch(true);
      return;
    }

    // Check usage prima di aprire il chat (fallback se useEffect non ha ancora risposto)
    setUsageLoading(true);
    try {
      const res = await fetch("/api/user/usage");
      if (res.ok) {
        const data = await res.json() as UsageData;
        setUsageData(data);
        setShowDeepSearch(true); // mostra il pannello (con paywall o chat)
      } else {
        // In caso di errore, mostra la chat (fail-open, il backend gestisce i limiti)
        setShowDeepSearch(true);
      }
    } catch {
      setShowDeepSearch(true);
    } finally {
      setUsageLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.12 }}
      className={`p-5 rounded-xl bg-white shadow-sm border border-border`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-[15px] font-bold">{risk.title}</span>
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase border ${style.badge}`}
        >
          {risk.severity}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-foreground-secondary mb-3">
        {risk.detail}
      </p>

      {(risk.legalBasis || risk.courtCase) && (
        <div className="flex gap-3 flex-wrap text-xs text-foreground-tertiary mb-3">
          {risk.legalBasis && <span>{risk.legalBasis}</span>}
          {risk.courtCase && <span>{risk.courtCase}</span>}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          onClick={handleDeepSearchClick}
          disabled={usageLoading}
          className="flex items-center gap-1.5 text-xs font-medium text-accent/70 hover:text-accent transition-colors disabled:opacity-50"
        >
          {usageLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          Approfondisci questo punto
        </button>

        {/* Usage badge — shown once usageData is available */}
        {usageData && (
          <motion.span
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
              !usageData.authenticated
                ? "bg-gray-50 border-gray-200 text-gray-400"
                : !usageData.canDeepSearch
                ? "bg-red-50 border-red-200 text-red-500"
                : usageData.plan === "pro"
                ? "bg-green-50 border-green-200 text-green-600"
                : "bg-accent/5 border-accent/20 text-accent/80"
            }`}
          >
            {!usageData.authenticated ? (
              <>
                <Lock className="w-2.5 h-2.5" />
                Accedi per usare la ricerca approfondita
              </>
            ) : !usageData.canDeepSearch ? (
              <>
                <Lock className="w-2.5 h-2.5" />
                Limite raggiunto —{" "}
                <Link href="/pricing" className="underline underline-offset-2 hover:text-red-600 transition-colors">
                  Passa a Pro
                </Link>
              </>
            ) : usageData.plan === "pro" ? (
              <>Ricerche illimitate</>
            ) : (
              <>{usageData.deepSearchUsed}/{usageData.deepSearchLimit} ricerche usate</>
            )}
          </motion.span>
        )}
      </div>

      {showDeepSearch && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-3 pt-3 border-t border-border"
        >
          {/* Paywall: utente non autenticato */}
          {usageData && !usageData.authenticated && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/5 border border-accent/20">
              <Lock className="w-4 h-4 text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">
                  Accedi per approfondire
                </p>
                <p className="text-xs text-foreground-secondary mb-3">
                  La ricerca approfondita richiede un account.
                </p>
                <Link
                  href="/dashboard"
                  className="inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white bg-accent hover:bg-accent/90 transition-colors"
                >
                  Accedi
                </Link>
              </div>
            </div>
          )}

          {/* Paywall: limite deep search gratuito esaurito */}
          {usageData && usageData.authenticated && !usageData.canDeepSearch && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/5 border border-accent/20">
              <Lock className="w-4 h-4 text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">
                  Limite ricerche approfondite raggiunto
                </p>
                <p className="text-xs text-foreground-secondary mb-3">
                  Hai usato {usageData.deepSearchUsed}/{usageData.deepSearchLimit} ricerche gratuite questo mese.
                  Passa a Pro per ricerche illimitate.
                </p>
                <Link
                  href="/pricing"
                  className="inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white bg-accent hover:bg-accent/90 transition-colors"
                >
                  Upgrade a Pro &mdash; &euro;4,99/mese
                </Link>
              </div>
            </div>
          )}

          {/* Deep search chat: utente autenticato e dentro i limiti */}
          {(!usageData || (usageData.authenticated && usageData.canDeepSearch)) && (
            <DeepSearchChat
              clauseContext={`${risk.title}: ${risk.detail}`}
              existingAnalysis={`Base legale: ${risk.legalBasis || "N/A"}. Sentenza: ${risk.courtCase || "N/A"}`}
              analysisId={analysisId}
            />
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
