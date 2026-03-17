"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Plug,
  Activity,
  LogIn,
  Shield,
  ArrowRight,
  Mail,
  Check,
  Chrome,
} from "lucide-react";
import ConnectorCard, { type ConnectorInfo, CATEGORY_LABELS } from "@/components/integrations/ConnectorCard";
import { ConnectorCardSkeleton } from "@/components/integrations/Skeletons";
import IntegrationFilters from "@/components/integrations/IntegrationFilters";
import OnboardingTour from "@/components/integrations/OnboardingTour";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function IntegrazioneClient() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);

  // ─── Login form state ───
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSent, setLoginSent] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);

  // ─── Auth check ───
  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        setUser(data.user ?? null);
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    }
    checkAuth();
  }, []);

  const handleMagicLink = useCallback(async () => {
    if (!loginEmail.trim()) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: loginEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/integrazione`,
        },
      });
      if (error) {
        setLoginError(error.message);
      } else {
        setLoginSent(true);
      }
    } catch {
      setLoginError("Errore di rete. Riprova.");
    } finally {
      setLoginLoading(false);
    }
  }, [loginEmail]);

  const handleGoogleLogin = useCallback(async () => {
    setLoginLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=/integrazione`,
        },
      });
    } catch {
      setLoginLoading(false);
    }
  }, []);

  /** Called from ConnectorCard when an unauthenticated user clicks "Configura" */
  const handleRequestLogin = useCallback(() => {
    setShowLoginForm(true);
    // Scroll to login banner
    setTimeout(() => {
      document.getElementById("login-banner")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, []);

  const isAuthenticated = !authLoading && user !== null;

  const fetchConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/status");
      if (!res.ok) {
        setError("Impossibile caricare i connettori. Riprova tra qualche secondo.");
        return;
      }
      const json = await res.json();
      if (json?.connectors) setConnectors(json.connectors);
    } catch {
      setError("Errore di rete. Verifica la connessione e riprova.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchConnectors();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [fetchConnectors]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const c of connectors) cats.add(c.category);
    return ["all", ...Array.from(cats).sort()];
  }, [connectors]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: connectors.length };
    for (const c of connectors) {
      counts[c.category] = (counts[c.category] || 0) + 1;
    }
    return counts;
  }, [connectors]);

  const filteredConnectors = useMemo(() => {
    let result = connectors;

    if (activeCategory !== "all") {
      result = result.filter((c) => c.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          (CATEGORY_LABELS[c.category] || "").toLowerCase().includes(q)
      );
    }

    const statusOrder: Record<string, number> = {
      connected: 0,
      error: 1,
      not_connected: 2,
      coming_soon: 3,
    };
    result = [...result].sort((a, b) => {
      const aOrder = statusOrder[a.status] ?? 4;
      const bOrder = statusOrder[b.status] ?? 4;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.popular && !b.popular) return -1;
      if (!a.popular && b.popular) return 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [connectors, activeCategory, searchQuery]);

  const connectedCount = connectors.filter((c) => c.status === "connected").length;
  const availableCount = connectors.filter((c) => c.status !== "coming_soon").length;
  const comingSoonCount = connectors.filter((c) => c.status === "coming_soon").length;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-base)", color: "var(--fg-primary)" }}
    >
      {/* ─── Header ─── */}
      <div className="px-6 md:px-10 pt-8 pb-6 max-w-[1400px] mx-auto">
        <Link
          href="/"
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl transition-colors mb-6"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dark-subtle)",
          }}
          aria-label="Torna alla home"
        >
          <ArrowLeft className="w-4 h-4" style={{ color: "var(--fg-secondary)" }} />
        </Link>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="font-serif text-2xl md:text-3xl tracking-tight"
              style={{ color: "var(--fg-primary)" }}
            >
              Connettori Integrazione
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--fg-secondary)" }}>
              Collega le tue piattaforme e centralizza i dati per l&apos;analisi AI
            </p>
          </div>

          {!loading && (
            <div className="flex items-center gap-2 flex-wrap">
              {connectedCount > 0 && (
                <Link
                  href="/integrazione/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02]"
                  style={{
                    background: "rgba(93, 228, 199, 0.12)",
                    color: "var(--success)",
                    border: "1px solid rgba(93, 228, 199, 0.2)",
                  }}
                >
                  <Activity className="w-3 h-3" />
                  {connectedCount} attiv{connectedCount === 1 ? "o" : "i"} — Dashboard
                </Link>
              )}
              <span
                className="rounded-full px-3 py-1.5 text-xs"
                style={{ background: "var(--bg-overlay)", color: "var(--fg-muted)" }}
              >
                {availableCount} disponibil{availableCount === 1 ? "e" : "i"}
              </span>
              {comingSoonCount > 0 && (
                <span
                  className="rounded-full px-3 py-1.5 text-xs"
                  style={{ background: "rgba(255, 250, 194, 0.08)", color: "var(--caution)" }}
                >
                  {comingSoonCount} in arrivo
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mt-5">
          <IntegrationFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            categoryCounts={categoryCounts}
            availableCategories={availableCategories}
          />
        </div>
      </div>

      {/* ─── Login Banner (unauthenticated users) ─── */}
      {!authLoading && !user && (
        <div id="login-banner" className="px-6 md:px-10 max-w-[1400px] mx-auto mb-6">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-xl p-5 md:p-6"
            style={{
              background: "linear-gradient(135deg, rgba(255, 107, 53, 0.06) 0%, rgba(255, 107, 53, 0.02) 100%)",
              border: showLoginForm
                ? "1px solid rgba(255, 107, 53, 0.35)"
                : "1px solid rgba(255, 107, 53, 0.15)",
            }}
          >
            {/* Top accent line */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255, 107, 53, 0.4), transparent)",
              }}
            />

            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
              {/* Icon */}
              <div
                className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
                style={{ background: "rgba(255, 107, 53, 0.1)" }}
              >
                <Shield className="w-5 h-5" style={{ color: "var(--accent)" }} />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--fg-primary)" }}
                >
                  Accedi per configurare i tuoi connettori
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Esplora il catalogo liberamente. Per collegare le tue piattaforme, serve un account.
                </p>
              </div>

              {/* Expand login form button (collapsed state) */}
              {!showLoginForm && !loginSent && (
                <button
                  onClick={() => setShowLoginForm(true)}
                  className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] shrink-0"
                  style={{
                    background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                    boxShadow: "0 4px 16px rgba(255, 107, 53, 0.25)",
                    minHeight: "44px",
                    minWidth: "44px",
                  }}
                  aria-label="Accedi per configurare i connettori"
                >
                  <LogIn className="w-4 h-4" />
                  Accedi
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* ─── Expanded login form ─── */}
            <AnimatePresence>
              {(showLoginForm || loginSent) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-5 pt-5" style={{ borderTop: "1px solid rgba(255, 107, 53, 0.1)" }}>
                    {loginSent ? (
                      /* ─── Success: check your email ─── */
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 rounded-xl p-4"
                        style={{
                          background: "rgba(93, 228, 199, 0.08)",
                          border: "1px solid rgba(93, 228, 199, 0.2)",
                        }}
                      >
                        <div
                          className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                          style={{ background: "rgba(93, 228, 199, 0.15)" }}
                        >
                          <Check className="w-5 h-5" style={{ color: "var(--success)" }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--success)" }}>
                            Controlla la tua email
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>
                            Abbiamo inviato un link di accesso a <strong style={{ color: "var(--fg-secondary)" }}>{loginEmail}</strong>. Clicca il link per accedere.
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <>
                        {/* Email magic link input */}
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1 relative">
                            <Mail
                              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                              style={{ color: "var(--fg-muted)" }}
                            />
                            <input
                              type="email"
                              value={loginEmail}
                              onChange={(e) => {
                                setLoginEmail(e.target.value);
                                setLoginError(null);
                              }}
                              onKeyDown={(e) => e.key === "Enter" && handleMagicLink()}
                              placeholder="nome@azienda.it"
                              className="w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                              style={{
                                background: "var(--bg-base)",
                                border: loginError
                                  ? "1px solid var(--error)"
                                  : "1px solid var(--border-dark-subtle)",
                                color: "var(--fg-primary)",
                              }}
                              aria-label="Indirizzo email"
                              autoFocus
                            />
                          </div>
                          <button
                            onClick={handleMagicLink}
                            disabled={loginLoading || !loginEmail.trim()}
                            className="inline-flex items-center justify-center gap-2 rounded-xl py-3 px-6 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shrink-0"
                            style={{
                              background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                              boxShadow: "0 4px 16px rgba(255, 107, 53, 0.25)",
                              minHeight: "44px",
                            }}
                          >
                            {loginLoading ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4" />
                            )}
                            Invia link di accesso
                          </button>
                        </div>

                        {/* Error message */}
                        {loginError && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-xs mt-2"
                            style={{ color: "var(--error)" }}
                          >
                            {loginError}
                          </motion.p>
                        )}

                        {/* Divider */}
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px" style={{ background: "var(--border-dark-subtle)" }} />
                          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>oppure</span>
                          <div className="flex-1 h-px" style={{ background: "var(--border-dark-subtle)" }} />
                        </div>

                        {/* Google OAuth (secondary) */}
                        <button
                          onClick={handleGoogleLogin}
                          disabled={loginLoading}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 px-5 text-sm font-medium transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: "var(--bg-overlay)",
                            border: "1px solid var(--border-dark)",
                            color: "var(--fg-secondary)",
                          }}
                        >
                          <Chrome className="w-4 h-4" />
                          Accedi con Google
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {/* ─── Grid ─── */}
      <main className="px-6 md:px-10 pb-16 max-w-[1400px] mx-auto">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <ConnectorCardSkeleton key={i} index={i} />
            ))}
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-center py-20"
          >
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
              style={{ background: "rgba(229, 141, 120, 0.1)" }}
            >
              <AlertTriangle className="w-8 h-8" style={{ color: "var(--error)" }} />
            </div>
            <p className="text-lg font-medium" style={{ color: "var(--fg-secondary)" }}>
              Errore nel caricamento
            </p>
            <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: "var(--fg-muted)" }}>
              {error}
            </p>
            <button
              onClick={fetchConnectors}
              className="inline-flex items-center gap-2 mt-5 rounded-xl py-2.5 px-5 text-sm font-medium transition-all hover:scale-[1.02]"
              style={{
                background: "var(--bg-raised)",
                color: "var(--fg-secondary)",
                border: "1px solid var(--border-dark)",
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Riprova
            </button>
          </motion.div>
        ) : filteredConnectors.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center text-center py-20"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{
                background: "var(--bg-overlay)",
                border: "1px solid var(--border-dark-subtle)",
              }}
            >
              <Plug className="w-8 h-8" style={{ color: "var(--fg-muted)" }} />
            </div>
            <p className="text-lg font-semibold" style={{ color: "var(--fg-primary)" }}>
              Nessun connettore trovato
            </p>
            <p className="text-sm mt-1.5 max-w-sm" style={{ color: "var(--fg-muted)" }}>
              {searchQuery.trim()
                ? `Nessun risultato per "${searchQuery}". Prova una ricerca diversa.`
                : "Prova a modificare il filtro categoria per vedere altri connettori."}
            </p>
            {(searchQuery.trim() || activeCategory !== "all") && (
              <button
                onClick={() => { setSearchQuery(""); setActiveCategory("all"); }}
                className="mt-4 inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  background: "var(--bg-raised)",
                  color: "var(--fg-secondary)",
                  border: "1px solid var(--border-dark)",
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Resetta filtri
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
            layout
            data-tour="connector-grid"
          >
            <AnimatePresence mode="popLayout">
              {filteredConnectors.map((connector, i) => (
                <div key={connector.id} {...(i === 0 ? { "data-tour": "first-connector" } : {})}>
                  <ConnectorCard connector={connector} index={i} isAuthenticated={isAuthenticated} onRequestLogin={handleRequestLogin} />
                </div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {!loading && filteredConnectors.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="flex items-center justify-between mt-8 px-4 py-3 rounded-xl text-sm"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-muted)",
            }}
          >
            <span>
              {filteredConnectors.length === connectors.length
                ? `${connectors.length} connettori totali`
                : `${filteredConnectors.length} di ${connectors.length} connettori`}
            </span>
            <a
              href="mailto:integrazioni@controlla.me"
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: "var(--info)" }}
            >
              <ExternalLink className="w-3 h-3" />
              Richiedi un connettore
            </a>
          </motion.div>
        )}
      </main>

      {/* Onboarding tour for first-time users */}
      {!loading && !error && filteredConnectors.length > 0 && (
        <OnboardingTour />
      )}
    </div>
  );
}
