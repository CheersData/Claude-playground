"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Plug, ExternalLink } from "lucide-react";
import ConnectorCard, { type ConnectorInfo, CATEGORY_LABELS } from "@/components/integrations/ConnectorCard";
import IntegrationFilters from "@/components/integrations/IntegrationFilters";

// ─── Main Component ───

export default function IntegrazioneClient() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  // Fetch connector status from API
  const fetchConnectors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/status");
      if (!res.ok) return;
      const json = await res.json();
      if (json?.connectors) setConnectors(json.connectors);
    } catch {
      // silently fail — marketplace shows empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  // Build available categories dynamically from data
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const c of connectors) {
      cats.add(c.category);
    }
    return ["all", ...Array.from(cats).sort()];
  }, [connectors]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: connectors.length };
    for (const c of connectors) {
      counts[c.category] = (counts[c.category] || 0) + 1;
    }
    return counts;
  }, [connectors]);

  // Filter connectors by category and search
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

    // Sort: connected first, then available, then coming soon
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
      // Popular connectors first within same status
      if (a.popular && !b.popular) return -1;
      if (!a.popular && b.popular) return 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [connectors, activeCategory, searchQuery]);

  // Summary counts
  const connectedCount = connectors.filter((c) => c.status === "connected").length;
  const availableCount = connectors.filter((c) => c.status !== "coming_soon").length;
  const comingSoonCount = connectors.filter((c) => c.status === "coming_soon").length;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--fg-primary)" }}>
      {/* Header */}
      <header className="pt-8 pb-6 px-6 md:px-10 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
              aria-label="Torna alla home"
            >
              <ArrowLeft className="w-4 h-4" style={{ color: "var(--fg-secondary)" }} />
            </Link>
            <div>
              <h1
                className="font-serif text-3xl md:text-4xl tracking-tight"
                style={{ color: "var(--fg-primary)" }}
              >
                Integrazioni
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--fg-secondary)" }}>
                Collega i tuoi strumenti per centralizzare i dati nella piattaforma
              </p>
            </div>
          </div>

          {/* Summary badges */}
          {!loading && (
            <div className="hidden md:flex items-center gap-3">
              {connectedCount > 0 && (
                <span
                  className="rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{ background: "rgba(93, 228, 199, 0.15)", color: "var(--success)" }}
                >
                  {connectedCount} attiv{connectedCount === 1 ? "o" : "i"}
                </span>
              )}
              <span
                className="rounded-full px-3 py-1.5 text-xs font-medium"
                style={{ background: "var(--bg-overlay)", color: "var(--fg-muted)" }}
              >
                {availableCount} disponibil{availableCount === 1 ? "e" : "i"}
              </span>
              {comingSoonCount > 0 && (
                <span
                  className="rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{ background: "rgba(255, 250, 194, 0.1)", color: "var(--caution)" }}
                >
                  {comingSoonCount} in arrivo
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <IntegrationFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          categoryCounts={categoryCounts}
          availableCategories={availableCategories}
        />
      </header>

      {/* Connector Grid */}
      <main className="px-6 md:px-10 pb-16 max-w-[1400px] mx-auto">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="rounded-xl p-6 animate-pulse"
                style={{
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border-dark-subtle)",
                  height: 300,
                }}
              />
            ))}
          </div>
        ) : filteredConnectors.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-center py-20"
          >
            <Plug className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--fg-muted)" }} />
            <p className="text-lg font-medium" style={{ color: "var(--fg-secondary)" }}>
              Nessun connettore trovato
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--fg-muted)" }}>
              Prova a modificare la ricerca o il filtro categoria
            </p>
          </motion.div>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
            layout
          >
            <AnimatePresence mode="popLayout">
              {filteredConnectors.map((connector, i) => (
                <ConnectorCard key={connector.id} connector={connector} index={i} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Footer row */}
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
    </div>
  );
}
