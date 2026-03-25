"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, GraduationCap, Briefcase, Crown, Coins } from "lucide-react";

// ─── Types ───

type TierName = "intern" | "associate" | "partner";

interface ChainEntry {
  key: string;
  displayName: string;
  provider: string;
  available: boolean;
}

interface AgentInfo {
  chain: ChainEntry[];
  activeIndex: number;
  activeModel: string;
  enabled: boolean;
}

interface TierData {
  current: TierName;
  agents: Record<string, AgentInfo>;
  estimatedCost: { perQuery: number; label: string };
}

interface PowerPanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Constants ───

const TIER_CONFIG: Record<TierName, { label: string; description: string; color: string; bg: string }> = {
  intern: {
    label: "Intern",
    description: "Cerebras, Groq, Mistral",
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
  },
  associate: {
    label: "Associate",
    description: "Gemini, Haiku",
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
  },
  partner: {
    label: "Partner",
    description: "Sonnet, GPT-5",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
  },
};

const AGENT_LABELS: Record<string, { name: string; description: string }> = {
  leader:          { name: "Leader",       description: "Routing" },
  "question-prep": { name: "Q-Prep",       description: "Riformulazione" },
  classifier:      { name: "Classificatore", description: "Tipo documento" },
  "corpus-agent":  { name: "Corpus Agent", description: "Risposta Q&A" },
  analyzer:        { name: "Analista",     description: "Rischi e clausole" },
  investigator:    { name: "Investigatore", description: "Web search" },
  advisor:         { name: "Consulente",   description: "Output finale" },
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "bg-[#D4A574]/15 text-[#8B5E3C]",
  gemini: "bg-blue-50 text-blue-600",
  openai: "bg-emerald-50 text-emerald-700",
  mistral: "bg-orange-50 text-orange-600",
  groq: "bg-purple-50 text-purple-600",
  cerebras: "bg-cyan-50 text-cyan-700",
};

// ─── Component ───

export default function PowerPanel({ open, onClose }: PowerPanelProps) {
  const [data, setData] = useState<TierData | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // SEC-004: legge il token HMAC da sessionStorage per autenticare le chiamate
  const getAuthHeaders = (): HeadersInit => {
    const token = sessionStorage.getItem("lexmea-token");
    return token
      ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      : { "Content-Type": "application/json" };
  };

  // Salva il nuovo token quando la route tier ne emette uno aggiornato (tier/agent change)
  const saveToken = (json: Record<string, unknown>) => {
    if (json.token && typeof json.token === "string") {
      sessionStorage.setItem("lexmea-token", json.token);
    }
  };

  const fetchTierData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/console/tier", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return; // 401/429/500 — skip silenzioso
      const json = await res.json();
      if (json?.current) setData(json); // ignora risposte senza current (errori JSON)
    } catch {
      // ignore
    } finally {
      setLoading(false); // garantito sempre, anche su early return
    }
  }, []);

  useEffect(() => {
    if (open && !data) fetchTierData();
  }, [open, data, fetchTierData]);

  // Focus management: move focus into panel on open (WCAG 2.4.3)
  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);

  // Escape key + focus trap (WCAG 2.1.1, 2.4.3)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap: keep Tab within the panel (WCAG 2.4.3)
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const switchTier = useCallback(async (tier: TierName) => {
    if (data?.current === tier) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/console/tier", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) return; // 401/429/500 — skip silenzioso
      const json = await res.json();
      if (json?.current) { // ignora risposte senza current (errori JSON)
        saveToken(json);
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setSwitching(false); // garantito sempre, anche su early return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.current]);

  const toggleAgent = useCallback(async (agent: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/console/tier", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ agent, enabled }),
      });
      if (!res.ok) return; // 401/429/500 — skip silenzioso
      const json = await res.json();
      if (json?.current) { // ignora risposte senza current (errori JSON)
        saveToken(json);
        setData(json);
      }
    } catch {
      // ignore
    }
  }, []);

  if (!open) return null;

  const current = data?.current ?? "partner";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" ref={panelRef}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
        className="relative w-[480px] max-w-full sm:max-w-[90vw] h-full bg-[var(--surface)] flex flex-col shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Pannello Power — modelli e catene di fallback"
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-4 md:px-8 md:pt-7 md:pb-5 border-b border-[var(--border)]">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-serif text-xl md:text-2xl text-[var(--foreground)] tracking-tight">
                Power
              </h2>
              <p className="text-sm text-[var(--foreground-secondary)] mt-1">
                Modelli e catene di fallback
              </p>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors mt-1 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
              aria-label="Chiudi pannello Power"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && !data ? (
            <div className="px-4 md:px-8 py-4 md:py-8" role="status" aria-label="Caricamento dati">
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-[var(--border-subtle)] rounded-xl" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Tier selector */}
              <div className="px-4 md:px-8 pt-4 md:pt-6 pb-4">
                <h3 className="text-[10px] tracking-[2px] uppercase text-[var(--foreground-secondary)] font-medium mb-3">
                  Tier
                </h3>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Seleziona tier">
                  {(["intern", "associate", "partner"] as const).map((tier) => {
                    const cfg = TIER_CONFIG[tier];
                    const isActive = current === tier;
                    return (
                      <button
                        key={tier}
                        onClick={() => switchTier(tier)}
                        disabled={switching}
                        role="radio"
                        aria-checked={isActive}
                        aria-label={`Tier ${cfg.label}: ${cfg.description}`}
                        className={`relative flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-xl border transition-all focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] ${
                          isActive
                            ? `${cfg.bg} border-current`
                            : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--foreground-tertiary)]"
                        } ${switching ? "opacity-50" : ""}`}
                      >
                        <TierIcon tier={tier} active={isActive} />
                        <span className={`text-xs font-medium ${isActive ? cfg.color : "text-[var(--foreground-secondary)]"}`}>
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-[var(--foreground-secondary)] leading-tight text-center">
                          {cfg.description}
                        </span>
                        {isActive && (
                          <motion.div
                            layoutId="tier-indicator"
                            className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                              tier === "intern" ? "bg-emerald-500" :
                              tier === "associate" ? "bg-blue-500" : "bg-amber-500"
                            }`}
                            aria-hidden="true"
                            animate={{
                              boxShadow: [
                                `0 0 0px 0px ${tier === "intern" ? "rgba(16,185,129,0.5)" : tier === "associate" ? "rgba(59,130,246,0.5)" : "rgba(245,158,11,0.5)"}`,
                                `0 0 6px 3px ${tier === "intern" ? "rgba(16,185,129,0.35)" : tier === "associate" ? "rgba(59,130,246,0.35)" : "rgba(245,158,11,0.35)"}`,
                                `0 0 0px 0px ${tier === "intern" ? "rgba(16,185,129,0.5)" : tier === "associate" ? "rgba(59,130,246,0.5)" : "rgba(245,158,11,0.5)"}`,
                              ],
                              scale: [1, 1.15, 1],
                            }}
                            transition={{
                              boxShadow: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                              scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                              layout: { type: "spring", stiffness: 300, damping: 25 },
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Cost estimate */}
                {data?.estimatedCost && (
                  <div className="flex items-center gap-2 mt-3 py-2 px-3 rounded-lg bg-[var(--background-secondary)]">
                    <Coins className="w-3.5 h-3.5 text-[var(--foreground-secondary)]" aria-hidden="true" />
                    <span className="text-xs text-[var(--foreground-secondary)]">
                      Costo stimato per query: <span className="font-medium text-[var(--foreground)]">{data.estimatedCost.label}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Agent chains */}
              <div className="px-4 md:px-8 pb-4 md:pb-6">
                <h3 className="text-[10px] tracking-[2px] uppercase text-[var(--foreground-secondary)] font-medium mb-3">
                  Agenti
                </h3>
                <div className="space-y-2">
                  <AnimatePresence mode="wait">
                    {data?.agents && Object.entries(data.agents).map(([agent, info], i) => (
                      <AgentRow
                        key={`${agent}-${current}`}
                        agent={agent}
                        info={info}
                        index={i}
                        onToggle={toggleAgent}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 md:px-8 py-3 md:py-4 border-t border-[var(--border)] text-center">
          <p className="text-[11px] text-[var(--foreground-secondary)]">
            Su errore 429, il sistema scende automaticamente al modello successivo nella catena
          </p>
        </div>
      </motion.aside>
    </div>
  );
}

// ─── Sub-components ───

function TierIcon({ tier, active }: { tier: TierName; active: boolean }) {
  const size = "w-5 h-5";
  const color = active
    ? tier === "intern" ? "text-emerald-500" : tier === "associate" ? "text-blue-500" : "text-amber-500"
    : "text-[var(--foreground-secondary)]";

  if (tier === "intern") return <GraduationCap className={`${size} ${color}`} aria-hidden="true" />;
  if (tier === "associate") return <Briefcase className={`${size} ${color}`} aria-hidden="true" />;
  return <Crown className={`${size} ${color}`} aria-hidden="true" />;
}

function AgentRow({ agent, info, index, onToggle }: {
  agent: string;
  info: AgentInfo;
  index: number;
  onToggle: (agent: string, enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = AGENT_LABELS[agent] ?? { name: agent, description: "" };
  const activeEntry = info.chain[info.activeIndex];
  const enabled = info.enabled;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`rounded-xl border border-[var(--border-subtle)] overflow-hidden transition-opacity ${
        enabled ? "" : "opacity-50"
      }`}
    >
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-[var(--background-secondary)] transition-colors text-left focus:outline-2 focus:outline-offset-[-2px] focus:outline-[var(--accent)]"
          aria-expanded={expanded}
          aria-label={`${label.name} — ${label.description}. ${expanded ? "Comprimi" : "Espandi"} catena di fallback`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">{label.name}</span>
              <span className="text-[10px] text-[var(--foreground-secondary)]">{label.description}</span>
            </div>
          </div>

          {/* Active model chip */}
          {activeEntry && enabled && (
            <span className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium ${
              PROVIDER_COLORS[activeEntry.provider] ?? "bg-gray-100 text-gray-600"
            }`}>
              {activeEntry.displayName}
            </span>
          )}

          {!enabled && (
            <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--border-subtle)] text-[var(--foreground-secondary)]">
              off
            </span>
          )}

          <motion.svg
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="w-3.5 h-3.5 text-[var(--foreground-secondary)] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </motion.svg>
        </button>

        {/* Toggle switch — WCAG: role="switch" + aria-checked (4.1.2) */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(agent, !enabled); }}
          role="switch"
          aria-checked={enabled}
          className={`shrink-0 mr-4 w-11 h-6 rounded-full transition-colors relative focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] ${
            enabled ? "bg-[var(--foreground)]" : "bg-[#A3A3A3]"
          }`}
          aria-label={`${enabled ? "Disattiva" : "Attiva"} ${label.name}`}
        >
          <motion.div
            className="absolute top-[2px] w-5 h-5 rounded-full bg-white shadow-sm"
            animate={{ left: enabled ? 22 : 2 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 space-y-1.5 border-t border-[var(--border-subtle)]">
              <p className="text-[10px] text-[var(--foreground-secondary)] mb-3" id={`chain-label-${agent}`}>Catena di fallback:</p>
              <div role="list" aria-labelledby={`chain-label-${agent}`}>
              {info.chain.map((entry, i) => {
                const isActive = i === info.activeIndex;
                const isPast = i < info.activeIndex;
                return (
                  <div
                    key={entry.key}
                    role="listitem"
                    aria-label={`Posizione ${i + 1}: ${entry.displayName} (${entry.provider})${isActive ? " — modello attivo" : ""}${!entry.available ? " — non disponibile" : ""}`}
                    className={`flex items-center gap-2 py-1 px-2 rounded-lg text-xs ${
                      isActive ? "bg-[var(--border-subtle)]" : ""
                    } ${isPast ? "opacity-50" : ""}`}
                  >
                    {/* Position indicator */}
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      isActive
                        ? "bg-[var(--foreground)] text-white"
                        : "bg-[var(--border-subtle)] text-[var(--foreground-secondary)]"
                    }`} aria-hidden="true">
                      {i + 1}
                    </span>

                    {/* Model name */}
                    <span className={`flex-1 ${isActive ? "font-medium text-[var(--foreground)]" : "text-[var(--foreground-secondary)]"}`}>
                      {entry.displayName}
                    </span>

                    {/* Provider badge */}
                    <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                      PROVIDER_COLORS[entry.provider] ?? "bg-gray-100 text-gray-600"
                    }`}>
                      {entry.provider}
                    </span>

                    {/* Availability */}
                    {!entry.available && (
                      <span className="text-[9px] text-red-600 font-medium">off</span>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
