"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Plug,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Zap,
  Shield,
  BarChart3,
  Layers,
  Check,
  Lock,
  Clock,
  Brain,
  Building2,
  Scale,
  ShoppingCart,
  ChevronDown,
  Upload,
  Workflow,
  Globe,
  Timer,
  Activity,
} from "lucide-react";
import ConnectorCard, { type ConnectorInfo, CATEGORY_LABELS } from "@/components/integrations/ConnectorCard";
import IntegrationFilters from "@/components/integrations/IntegrationFilters";

// ─── How-it-works Step ───

interface HowItWorksStep {
  icon: typeof Zap;
  title: string;
  description: string;
  color: string;
}

const STEPS: HowItWorksStep[] = [
  {
    icon: Plug,
    title: "Collega",
    description: "Scegli il connettore e autentica il tuo account in pochi click. OAuth, API key o webhook.",
    color: "var(--identity-teal)",
  },
  {
    icon: Layers,
    title: "Mappa",
    description: "L'AI suggerisce automaticamente la mappatura tra i campi della sorgente e il tuo schema dati.",
    color: "var(--identity-violet)",
  },
  {
    icon: BarChart3,
    title: "Sincronizza",
    description: "I dati fluiscono automaticamente con la frequenza che scegli: real-time, oraria o giornaliera.",
    color: "var(--identity-cyan)",
  },
  {
    icon: Shield,
    title: "Analizza",
    description: "I tuoi dati centralizzati alimentano gli agenti AI per analisi piu profonde e accurate.",
    color: "var(--accent)",
  },
];

function StepCard({ step, index }: { step: HowItWorksStep; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ delay: 0.1 + index * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex flex-col items-center text-center p-6 rounded-xl"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
    >
      {/* Step number */}
      <div
        className="absolute -top-3 left-6 rounded-full px-2.5 py-0.5 text-xs font-bold"
        style={{ background: step.color, color: "var(--bg-base)" }}
      >
        {index + 1}
      </div>

      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 mt-2"
        style={{ background: `${step.color}15` }}
      >
        <step.icon className="w-7 h-7" style={{ color: step.color }} />
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--fg-primary)" }}>
        {step.title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
        {step.description}
      </p>
    </motion.div>
  );
}

// ─── Feature Pills ───

const FEATURES = [
  "Setup guidato in 3 minuti",
  "Mappatura AI automatica",
  "Sync in tempo reale",
  "Crittografia end-to-end",
  "Retry automatico su errori",
  "Log completo di ogni sync",
  "Webhook in entrata e uscita",
  "API REST per automazioni",
];

// ─── Use Cases ───

interface UseCase {
  icon: typeof Building2;
  persona: string;
  title: string;
  description: string;
  examples: string[];
  color: string;
}

const USE_CASES: UseCase[] = [
  {
    icon: Scale,
    persona: "Studio legale",
    title: "Documenti sempre sotto controllo",
    description:
      "Collega Google Drive o il gestionale di studio. Ogni nuovo contratto viene analizzato automaticamente dai 4 agenti AI.",
    examples: [
      "Analisi automatica contratti in ingresso",
      "Alert su clausole rischiose",
      "Archivio centralizzato con ricerca semantica",
    ],
    color: "var(--identity-violet)",
  },
  {
    icon: Building2,
    persona: "Commercialista",
    title: "Fatture e dati fiscali sincronizzati",
    description:
      "Sincronizza Fatture in Cloud o il tuo ERP. I dati fluiscono nella piattaforma per verifiche fiscali e compliance automatica.",
    examples: [
      "Import fatture con mappatura AI dei campi",
      "Verifica conformita normativa automatica",
      "Dashboard unificata clienti-documenti",
    ],
    color: "var(--identity-teal)",
  },
  {
    icon: ShoppingCart,
    persona: "PMI / E-commerce",
    title: "CRM e ordini in un unico punto",
    description:
      "HubSpot, Stripe, Salesforce: ogni dato del cliente converge nella piattaforma. Contratti, pagamenti e comunicazioni analizzati insieme.",
    examples: [
      "Sync contatti e deal dal CRM",
      "Analisi contratti fornitori e clienti",
      "Monitoraggio compliance GDPR automatico",
    ],
    color: "var(--accent)",
  },
];

function UseCaseCard({ useCase, index }: { useCase: UseCase; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ delay: 0.1 + index * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-xl p-6 md:p-7 flex flex-col"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: `${useCase.color}15` }}
        >
          <useCase.icon className="w-5 h-5" style={{ color: useCase.color }} />
        </div>
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: useCase.color }}
        >
          {useCase.persona}
        </span>
      </div>

      <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--fg-primary)" }}>
        {useCase.title}
      </h3>
      <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--fg-secondary)" }}>
        {useCase.description}
      </p>

      <ul className="mt-auto space-y-2">
        {useCase.examples.map((ex) => (
          <li key={ex} className="flex items-start gap-2 text-sm" style={{ color: "var(--fg-muted)" }}>
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--success)" }} />
            {ex}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// ─── Benefits ───

interface Benefit {
  icon: typeof Shield;
  title: string;
  description: string;
  color: string;
}

const BENEFITS: Benefit[] = [
  {
    icon: Lock,
    title: "Sicurezza enterprise",
    description:
      "Credenziali criptate AES-256-GCM, vault separato per utente. OAuth2 PKCE per ogni connettore. Audit trail GDPR completo. Server in EU.",
    color: "var(--success)",
  },
  {
    icon: Brain,
    title: "Mappatura AI intelligente",
    description:
      "L'AI riconosce automaticamente i campi della sorgente e li mappa al tuo schema. Regole, similarita semantica, LLM e learning dai tuoi override.",
    color: "var(--identity-violet)",
  },
  {
    icon: Clock,
    title: "Sync continuo e affidabile",
    description:
      "Scegli la frequenza: real-time, oraria o giornaliera. Retry automatico su errori, log completo di ogni operazione, webhook per automazioni.",
    color: "var(--identity-cyan)",
  },
];

// ─── Comparison Table ───

interface ComparisonRow {
  feature: string;
  manual: string;
  automated: string;
}

const COMPARISON: ComparisonRow[] = [
  { feature: "Tempo di setup", manual: "30-60 minuti per fonte", automated: "3 minuti con wizard AI" },
  { feature: "Aggiornamento dati", manual: "Upload manuale", automated: "Sync automatico" },
  { feature: "Mappatura campi", manual: "Copia-incolla manuale", automated: "AI suggerisce mappatura" },
  { feature: "Errori di importazione", manual: "Frequenti, nessun alert", automated: "Retry + notifica" },
  { feature: "Tracciabilita", manual: "Nessuna", automated: "Audit log completo" },
  { feature: "Sicurezza credenziali", manual: "Password in chiaro", automated: "Vault criptato AES-256" },
];

// ─── FAQ ───

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Quanto tempo serve per collegare un connettore?",
    answer:
      "Il setup guidato richiede circa 3 minuti. Selezioni il connettore, autentichi il tuo account (OAuth o API key), l'AI mappa i campi automaticamente e scegli la frequenza di sync. Puoi iniziare a sincronizzare subito.",
  },
  {
    question: "I miei dati sono al sicuro?",
    answer:
      "Le credenziali sono criptate con AES-256-GCM in un vault separato per ogni utente. Usiamo OAuth2 PKCE (mai password salvate), server in EU, RLS per isolamento dati e audit trail completo per conformita GDPR.",
  },
  {
    question: "Quali piattaforme posso collegare?",
    answer:
      "Al lancio: Fatture in Cloud, Google Drive, HubSpot e Stripe. Salesforce e altri in arrivo. Puoi richiedere nuovi connettori e li aggiungiamo alla roadmap.",
  },
  {
    question: "Cosa succede se la sync fallisce?",
    answer:
      "Il sistema riprova automaticamente con backoff esponenziale. Ricevi un alert se l'errore persiste. Ogni operazione e loggata con dettagli per il debug. Puoi anche fare retry manuale dalla dashboard.",
  },
  {
    question: "Posso personalizzare la mappatura dei campi?",
    answer:
      "Si. L'AI suggerisce una mappatura automatica basata su regole, similarita semantica e machine learning. Puoi sovrascrivere qualsiasi campo manualmente, e il sistema impara dalle tue preferenze.",
  },
];

function FAQAccordion({ item, index }: { item: FAQItem; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ delay: 0.05 + index * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left text-sm font-medium transition-colors"
        style={{ color: "var(--fg-primary)" }}
      >
        {item.question}
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--fg-muted)" }} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <p
              className="px-5 pb-5 text-sm leading-relaxed"
              style={{ color: "var(--fg-secondary)" }}
            >
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Stats ───

interface Stat {
  icon: typeof Globe;
  value: string;
  label: string;
  color: string;
}

const STATS: Stat[] = [
  { icon: Workflow, value: "4+", label: "Connettori disponibili", color: "var(--accent)" },
  { icon: Timer, value: "3 min", label: "Setup medio", color: "var(--identity-teal)" },
  { icon: Lock, value: "AES-256", label: "Crittografia vault", color: "var(--success)" },
  { icon: Globe, value: "EU", label: "Server e dati", color: "var(--identity-violet)" },
];

// ─── Main Component ───

export default function IntegrazioneClient() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const gridRef = useRef<HTMLDivElement>(null);

  // Fetch connector status from API
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

  // Auto-refresh connector status when user returns from wizard/detail page
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchConnectors();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    // Also refresh on popstate (back navigation)
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
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

  const scrollToGrid = () => {
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--fg-primary)" }}>

      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden pt-12 pb-16 px-6 md:px-10">
        {/* Background decorative elements */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 300 + i * 80,
                height: 300 + i * 80,
                left: `${10 + i * 15}%`,
                top: `${-20 + i * 10}%`,
                background: `radial-gradient(circle, rgba(255,107,53,${0.03 - i * 0.005}) 0%, transparent 70%)`,
              }}
              animate={{
                y: [0, -15, 0],
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 6 + i,
                delay: i * 0.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        <div className="relative max-w-[1400px] mx-auto">
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl transition-colors mb-8"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
            aria-label="Torna alla home"
          >
            <ArrowLeft className="w-4 h-4" style={{ color: "var(--fg-secondary)" }} />
          </Link>

          <div className="max-w-[700px]">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <span
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider mb-6"
                style={{
                  background: "rgba(255, 107, 53, 0.12)",
                  color: "var(--accent)",
                  border: "1px solid rgba(255, 107, 53, 0.2)",
                }}
              >
                <Zap className="w-3.5 h-3.5" />
                Marketplace Integrazioni
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight leading-tight mb-5"
              style={{ color: "var(--fg-primary)" }}
            >
              Tutti i tuoi dati,{" "}
              <span
                className="italic"
                style={{
                  background: "linear-gradient(135deg, var(--accent), #FFC832)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                un&apos;unica piattaforma
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-lg md:text-xl leading-relaxed mb-8 max-w-[560px]"
              style={{ color: "var(--fg-secondary)" }}
            >
              Collega CRM, ERP, cloud storage e strumenti legali.
              I connettori portano i dati dentro controlla.me, dove gli agenti AI
              li analizzano automaticamente.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-wrap gap-3"
            >
              <button
                onClick={scrollToGrid}
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.03]"
                style={{
                  background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                  boxShadow: "0 8px 24px rgba(255, 107, 53, 0.25)",
                }}
              >
                Esplora i connettori
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="mailto:integrazioni@controlla.me"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  background: "var(--bg-raised)",
                  color: "var(--fg-secondary)",
                  border: "1px solid var(--border-dark)",
                }}
              >
                Richiedi un connettore
              </a>
            </motion.div>

            {/* Feature pills */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex flex-wrap gap-2 mt-8"
            >
              {FEATURES.map((feat, i) => (
                <motion.span
                  key={feat}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35 + i * 0.04, duration: 0.3 }}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
                  style={{
                    background: "var(--bg-overlay)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--border-dark-subtle)",
                  }}
                >
                  <Check className="w-3 h-3" style={{ color: "var(--success)" }} />
                  {feat}
                </motion.span>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="px-6 md:px-10 pb-16">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2
              className="font-serif text-2xl md:text-3xl mb-3"
              style={{ color: "var(--fg-primary)" }}
            >
              Come funziona
            </h2>
            <p className="text-sm max-w-[480px] mx-auto" style={{ color: "var(--fg-secondary)" }}>
              Dalla connessione all&apos;analisi in 4 passaggi, con setup guidato dall&apos;AI.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((step, i) => (
              <StepCard key={step.title} step={step} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Stats Bar ─── */}
      <section className="px-6 md:px-10 pb-16">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3 rounded-xl p-4"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${stat.color}15` }}
                >
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
                <div>
                  <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</div>
                  <div className="text-xs" style={{ color: "var(--fg-muted)" }}>{stat.label}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Use Cases ─── */}
      <section className="px-6 md:px-10 pb-16">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2
              className="font-serif text-2xl md:text-3xl mb-3"
              style={{ color: "var(--fg-primary)" }}
            >
              Pensato per il tuo settore
            </h2>
            <p className="text-sm max-w-[520px] mx-auto" style={{ color: "var(--fg-secondary)" }}>
              Ogni PMI ha le sue piattaforme. I connettori si adattano al tuo flusso di lavoro, non il contrario.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {USE_CASES.map((useCase, i) => (
              <UseCaseCard key={useCase.persona} useCase={useCase} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Benefits Deep-Dive ─── */}
      <section className="px-6 md:px-10 pb-16">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2
              className="font-serif text-2xl md:text-3xl mb-3"
              style={{ color: "var(--fg-primary)" }}
            >
              Perche scegliere i nostri connettori
            </h2>
            <p className="text-sm max-w-[520px] mx-auto" style={{ color: "var(--fg-secondary)" }}>
              Non solo integrazione: sicurezza, intelligenza e affidabilita enterprise.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {BENEFITS.map((benefit, i) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: 0.1 + i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl p-6 md:p-7"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${benefit.color}15` }}
                >
                  <benefit.icon className="w-6 h-6" style={{ color: benefit.color }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--fg-primary)" }}>
                  {benefit.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                  {benefit.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Comparison Table ─── */}
      <section className="px-6 md:px-10 pb-16">
        <div className="max-w-[800px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2
              className="font-serif text-2xl md:text-3xl mb-3"
              style={{ color: "var(--fg-primary)" }}
            >
              Upload manuale vs Connettori
            </h2>
            <p className="text-sm max-w-[480px] mx-auto" style={{ color: "var(--fg-secondary)" }}>
              Quanto tempo risparmi automatizzando il flusso dei dati.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
          >
            {/* Header row */}
            <div
              className="grid grid-cols-3 gap-px text-xs font-bold uppercase tracking-wider px-5 py-3"
              style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
            >
              <div style={{ color: "var(--fg-muted)" }}>Funzionalita</div>
              <div className="text-center" style={{ color: "var(--fg-muted)" }}>
                <Upload className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Manuale
              </div>
              <div className="text-center" style={{ color: "var(--accent)" }}>
                <Zap className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Connettori
              </div>
            </div>

            {/* Rows */}
            {COMPARISON.map((row, i) => (
              <div
                key={row.feature}
                className="grid grid-cols-3 gap-px px-5 py-3.5 text-sm"
                style={{
                  borderBottom: i < COMPARISON.length - 1 ? "1px solid var(--border-dark-subtle)" : undefined,
                }}
              >
                <div className="font-medium" style={{ color: "var(--fg-primary)" }}>{row.feature}</div>
                <div className="text-center" style={{ color: "var(--fg-muted)" }}>{row.manual}</div>
                <div className="text-center font-medium" style={{ color: "var(--success)" }}>{row.automated}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="px-6 md:px-10 pb-16">
        <div className="max-w-[700px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2
              className="font-serif text-2xl md:text-3xl mb-3"
              style={{ color: "var(--fg-primary)" }}
            >
              Domande frequenti
            </h2>
          </motion.div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <FAQAccordion key={item.question} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Section divider before grid ─── */}
      <div className="section-divider mb-12" />

      {/* ─── Connector Grid (existing functional section) ─── */}
      <div ref={gridRef} className="scroll-mt-6">
        <header className="pt-8 pb-6 px-6 md:px-10 max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2
                className="font-serif text-2xl md:text-3xl tracking-tight"
                style={{ color: "var(--fg-primary)" }}
              >
                Connettori disponibili
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--fg-secondary)" }}>
                Cerca e configura i connettori per centralizzare i tuoi dati
              </p>
            </div>

            {/* Summary badges + dashboard link */}
            {!loading && (
              <div className="hidden md:flex items-center gap-3">
                {connectedCount > 0 && (
                  <Link
                    href="/integrazione/dashboard"
                    className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-all hover:scale-[1.02]"
                    style={{
                      background: "rgba(93, 228, 199, 0.15)",
                      color: "var(--success)",
                      border: "1px solid rgba(93, 228, 199, 0.2)",
                    }}
                  >
                    <Activity className="w-3 h-3" />
                    {connectedCount} attiv{connectedCount === 1 ? "o" : "i"} — Sync Dashboard
                  </Link>
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
          ) : error ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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

      {/* ─── CTA Section ─── */}
      <section className="px-6 md:px-10 pb-16">
        <div className="max-w-[800px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-2xl p-8 md:p-12 text-center"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            {/* Gradient glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 0%, rgba(255,107,53,0.08) 0%, transparent 60%)",
              }}
            />

            <div className="relative">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: "rgba(255, 107, 53, 0.12)", border: "1px solid rgba(255, 107, 53, 0.2)" }}
              >
                <Plug className="w-7 h-7" style={{ color: "var(--accent)" }} />
              </div>

              <h2
                className="font-serif text-2xl md:text-3xl mb-3"
                style={{ color: "var(--fg-primary)" }}
              >
                Non trovi il connettore che cerchi?
              </h2>
              <p
                className="text-sm leading-relaxed max-w-[440px] mx-auto mb-7"
                style={{ color: "var(--fg-secondary)" }}
              >
                Il nostro team sviluppa nuovi connettori ogni settimana.
                Scrivici e lo aggiungeremo alla roadmap.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href="mailto:integrazioni@controlla.me"
                  className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.03]"
                  style={{
                    background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                    boxShadow: "0 8px 24px rgba(255, 107, 53, 0.25)",
                  }}
                >
                  Richiedi un connettore
                  <ArrowRight className="w-4 h-4" />
                </a>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium transition-all hover:scale-[1.02]"
                  style={{
                    color: "var(--fg-secondary)",
                    border: "1px solid var(--border-dark)",
                  }}
                >
                  Torna alla home
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
