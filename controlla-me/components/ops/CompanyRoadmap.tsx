"use client";

/**
 * CompanyRoadmap — Sezione "Chi siamo e dove andiamo"
 *
 * Mostra:
 *   - Cosa abbiamo costruito (milestones completate, timeline visuale)
 *   - Su cosa stiamo lavorando (task in_progress dal board)
 *   - Prossimi passi (roadmap strategica)
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Rocket,
  Shield,
  Database,
  Brain,
  TrendingUp,
  Scale,
  Microscope,
  Palette,
  Globe,
  Clock,
  Target,
  Zap,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string;
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
  stats?: string;
  date?: string;
}

interface ActiveWork {
  id: string;
  title: string;
  department: string;
  priority: string;
}

interface NextStep {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  tag?: string;
}

// ─── Static data ──────────────────────────────────────────────────────────────

const MILESTONES: Milestone[] = [
  {
    id: "legal-pipeline",
    icon: Scale,
    color: "#FF6B6B",
    title: "Pipeline Analisi Legale",
    description:
      "4 agenti AI specializzati: Classificatore, Analista, Investigatore e Consulente. Analisi completa di contratti con scoring multidimensionale e consigli in linguaggio semplice.",
    stats: "4 agenti · SSE streaming · cache SHA256",
  },
  {
    id: "vector-db",
    icon: Database,
    color: "#A78BFA",
    title: "Database Vettoriale + RAG",
    description:
      "Supabase pgvector con embeddings Voyage AI (voyage-law-2). Ricerca semantica su corpus legislativo, documenti analizzati e knowledge base collettiva che cresce ad ogni analisi.",
    stats: "5600+ articoli · 3 layer · HNSW index",
  },
  {
    id: "corpus",
    icon: Globe,
    color: "#4ECDC4",
    title: "Corpus Legislativo",
    description:
      "13 fonti legislative italiane ed europee ingerite tramite pipeline Data Connector (CONNECT → MODEL → LOAD). Normattiva Open Data API + EUR-Lex Cellar REST.",
    stats: "13 fonti · IT + EU · Akoma Ntoso XML",
  },
  {
    id: "multi-provider",
    icon: Brain,
    color: "#60A5FA",
    title: "Multi-Provider AI + Tier System",
    description:
      "7 provider (Anthropic, Google, OpenAI, Mistral, Groq, Cerebras, DeepSeek), ~40 modelli. Sistema a 3 tier (Intern/Associate/Partner) con catene di fallback N-modelli automatiche.",
    stats: "7 provider · 40+ modelli · 3 tier",
  },
  {
    id: "trading",
    icon: TrendingUp,
    color: "#FFC832",
    title: "Ufficio Trading Automatizzato",
    description:
      "5 agenti Python per swing trading su azioni US + ETF via Alpaca Markets. Strategia slope+volume su barre 1Min con Tiingo IEX real-time. Risk management non negoziabile con kill switch automatico.",
    stats: "5 agenti · slope+volume · Tiingo IEX",
  },
  {
    id: "hr-vertical",
    icon: Scale,
    color: "#34D399",
    title: "Verticale HR",
    description:
      "572 articoli giuslavoristici: D.Lgs. 81/2008 (sicurezza), 81/2015 (contratti), 276/2003 (mercato lavoro), 23/2015 (tutele crescenti), 148/2015 (ammortizzatori), Statuto dei Lavoratori.",
    stats: "6 fonti · 572 articoli",
  },
  {
    id: "medical-vertical",
    icon: Microscope,
    color: "#FB923C",
    title: "Verticale Medico (MVP)",
    description:
      "Studia.me: 3 connettori (StatPearls, EuropePMC, OpenStax). Pipeline medica con migration DB, UI dedicata /studia, prompt medici e API routes operative.",
    stats: "3 connettori · 47+ articoli StatPearls",
  },
  {
    id: "security",
    icon: Shield,
    color: "#F87171",
    title: "Security Audit Completo",
    description:
      "Audit su 50 route API, 100% coverage. Middleware centralizzato: auth, CSRF, rate-limit, sanitization, audit-log. Token HMAC-SHA256 per console. RLS su tutte le tabelle.",
    stats: "50 route · 0 finding alti · 100% coverage",
  },
  {
    id: "ops-center",
    icon: Rocket,
    color: "#FF6B35",
    title: "Console & Ops Center",
    description:
      "Dashboard operativa con 9 tab: monitoring real-time, task board, costi, trading, daemon control, agenti, QA testing. CME come CEO virtuale con routing protocolli.",
    stats: "9 tab · 645+ task gestiti · 7gg cost tracking",
  },
  {
    id: "design-system",
    icon: Palette,
    color: "#F472B6",
    title: "Design System + CI/CD",
    description:
      "Token CSS design system con dark theme, responsive mobile-first, Framer Motion. GitHub Actions CI con lint, typecheck, Vitest (703+ test), Playwright E2E.",
    stats: "703+ test · CI/CD · WCAG 2.1 AA",
  },
];

const NEXT_STEPS: NextStep[] = [
  {
    title: "Deploy in Produzione",
    description: "Pubblicazione su Vercel con dominio definitivo, HTTPS, Stripe live",
    icon: Rocket,
    color: "#FF6B35",
    tag: "Priorità alta",
  },
  {
    title: "Trading: Paper → Go Live",
    description: "Completare backtest (Sharpe > 1.0), 30 giorni paper trading, poi attivazione live",
    icon: TrendingUp,
    color: "#FFC832",
    tag: "In backtest",
  },
  {
    title: "Verticale Fiscale",
    description: "Nuovo verticale per consulenza fiscale — fonti tributarie da identificare",
    icon: Scale,
    color: "#34D399",
    tag: "Prossimo verticale",
  },
  {
    title: "Monitoraggio Contratti",
    description: "Alert automatici su scadenze, rinnovi e modifiche normative per contratti analizzati",
    icon: Clock,
    color: "#A78BFA",
    tag: "Feature",
  },
  {
    title: "Compliance EU AI Act + DPA",
    description: "Firma DPA Anthropic (GDPR B2B blocker), consulente EU AI Act (scadenza agosto 2026)",
    icon: Shield,
    color: "#F87171",
    tag: "Legale",
  },
];

// ─── Dept colors ──────────────────────────────────────────────────────────────

const DEPT_COLORS: Record<string, string> = {
  "ufficio-legale": "#FF6B6B",
  trading: "#FFC832",
  architecture: "#4ECDC4",
  "data-engineering": "#A78BFA",
  "quality-assurance": "#60A5FA",
  operations: "#34D399",
  security: "#F87171",
  strategy: "#FBBF24",
  marketing: "#FB923C",
  protocols: "#818CF8",
  "ux-ui": "#F472B6",
  acceleration: "#2DD4BF",
  finance: "#A3E635",
};

const DEPT_LABELS: Record<string, string> = {
  "ufficio-legale": "Ufficio Legale",
  trading: "Trading",
  architecture: "Architecture",
  "data-engineering": "Data Eng.",
  "quality-assurance": "QA",
  operations: "Operations",
  security: "Security",
  strategy: "Strategy",
  marketing: "Marketing",
  protocols: "Protocols",
  "ux-ui": "UX/UI",
  acceleration: "Acceleration",
  finance: "Finance",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "var(--error)",
  high: "var(--accent)",
  medium: "var(--identity-gold)",
  low: "var(--fg-secondary)",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MilestoneCard({ milestone, index }: { milestone: Milestone; index: number }) {
  const Icon = milestone.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="relative flex gap-3 group"
    >
      {/* Timeline connector */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
          style={{
            background: `${milestone.color}15`,
            border: `1px solid ${milestone.color}30`,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: milestone.color }} />
        </div>
        {index < MILESTONES.length - 1 && (
          <div
            className="w-px flex-1 min-h-[16px] mt-1"
            style={{ background: "var(--border-dark-subtle)" }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4
            className="text-sm font-semibold leading-tight"
            style={{ color: "var(--fg-primary)" }}
          >
            {milestone.title}
          </h4>
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--success)" }} />
        </div>
        <p
          className="text-xs leading-relaxed mt-1"
          style={{ color: "var(--fg-secondary)" }}
        >
          {milestone.description}
        </p>
        {milestone.stats && (
          <p
            className="text-xs font-mono mt-1.5"
            style={{ color: "var(--fg-invisible)" }}
          >
            {milestone.stats}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function ActiveWorkItem({ work }: { work: ActiveWork }) {
  const deptColor = DEPT_COLORS[work.department] ?? "var(--fg-secondary)";
  const deptLabel = DEPT_LABELS[work.department] ?? work.department;
  const priorityColor = PRIORITY_COLORS[work.priority] ?? "var(--fg-secondary)";

  return (
    <div className="flex items-start gap-3 py-2">
      {/* Pulsing dot */}
      <span className="relative flex h-2.5 w-2.5 mt-1 shrink-0">
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ backgroundColor: deptColor, opacity: 0.4 }}
        />
        <span
          className="relative inline-flex h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: deptColor }}
        />
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-snug" style={{ color: "var(--fg-primary)" }}>
          {work.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              color: deptColor,
              background: `${deptColor}12`,
            }}
          >
            {deptLabel}
          </span>
          <span
            className="w-1 h-1 rounded-full"
            style={{ background: priorityColor }}
          />
          <span className="text-xs" style={{ color: "var(--fg-invisible)" }}>
            {work.priority}
          </span>
        </div>
      </div>
    </div>
  );
}

function NextStepCard({ step, index }: { step: NextStep; index: number }) {
  const Icon = step.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.06 }}
      className="flex items-start gap-3 py-2.5 border-b last:border-b-0"
      style={{ borderColor: "var(--border-dark-subtle)" }}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
        style={{
          background: `${step.color}12`,
          border: `1px solid ${step.color}25`,
        }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: step.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>
            {step.title}
          </span>
          {step.tag && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                color: step.color,
                background: `${step.color}12`,
                border: `1px solid ${step.color}20`,
              }}
            >
              {step.tag}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: "var(--fg-secondary)" }}>
          {step.description}
        </p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-1" style={{ color: "var(--fg-invisible)" }} />
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CompanyRoadmap() {
  const [expanded, setExpanded] = useState(true);
  const [activeWork, setActiveWork] = useState<ActiveWork[]>([]);
  const [loadingWork, setLoadingWork] = useState(true);

  // Fetch current in-progress tasks
  const fetchActiveWork = useCallback(async () => {
    setLoadingWork(true);
    try {
      const res = await fetch("/api/company/status", { headers: getConsoleAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const tasks = (data.board?.recent ?? []) as Array<{
          id: string;
          title: string;
          department: string;
          priority: string;
          status: string;
        }>;
        // Filter in_progress + open tasks (limited)
        const active = tasks
          .filter((t) => t.status === "in_progress" || t.status === "open")
          .slice(0, 8)
          .map((t) => ({
            id: t.id,
            title: t.title,
            department: t.department,
            priority: t.priority,
          }));
        setActiveWork(active);
      }
    } catch (err) {
      console.error("[CompanyRoadmap] fetch error:", err);
    } finally {
      setLoadingWork(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveWork();
  }, [fetchActiveWork]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-3 flex items-center gap-3 transition-colors"
        style={{ borderBottom: expanded ? "1px solid var(--border-dark-subtle)" : "none" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(255,107,53,0.12)", border: "1px solid rgba(255,107,53,0.2)" }}
        >
          <Target className="w-4 h-4" style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1 text-left">
          <h3
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--fg-primary)" }}
          >
            Roadmap & Progressi
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--fg-secondary)" }}>
            Cosa abbiamo costruito, su cosa lavoriamo, dove andiamo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{
              background: "rgba(93,228,199,0.08)",
              color: "var(--success)",
              border: "1px solid rgba(93,228,199,0.15)",
            }}
          >
            {MILESTONES.length} completati
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            style={{ color: "var(--fg-invisible)" }}
          />
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ── Col 1-2: Cosa abbiamo costruito ──────────────────── */}
              <div className="lg:col-span-2 space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4" style={{ color: "var(--success)" }} />
                  <h4
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--fg-primary)" }}
                  >
                    Cosa abbiamo costruito
                  </h4>
                </div>

                <div className="space-y-0">
                  {MILESTONES.map((m, i) => (
                    <MilestoneCard key={m.id} milestone={m} index={i} />
                  ))}
                </div>
              </div>

              {/* ── Col 3: In corso + Prossimi ───────────────────────── */}
              <div className="space-y-5">
                {/* In corso */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4" style={{ color: "var(--accent)" }} />
                    <h4
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--fg-primary)" }}
                    >
                      In lavorazione
                    </h4>
                    {!loadingWork && activeWork.length > 0 && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-mono"
                        style={{
                          background: "rgba(255,107,53,0.12)",
                          color: "var(--accent)",
                        }}
                      >
                        {activeWork.length}
                      </span>
                    )}
                  </div>

                  <div
                    className="rounded-lg p-3"
                    style={{
                      background: "var(--bg-base)",
                      border: "1px solid var(--border-dark-subtle)",
                    }}
                  >
                    {loadingWork ? (
                      <p className="text-xs" style={{ color: "var(--fg-invisible)" }}>
                        Carico task attivi...
                      </p>
                    ) : activeWork.length === 0 ? (
                      <div className="text-center py-3">
                        <CheckCircle2
                          className="w-5 h-5 mx-auto mb-1"
                          style={{ color: "var(--success)" }}
                        />
                        <p className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                          Board pulito — nessun task in corso
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y" style={{ borderColor: "var(--border-dark-subtle)" }}>
                        {activeWork.map((w) => (
                          <ActiveWorkItem key={w.id} work={w} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Prossimi passi */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ChevronRight className="w-4 h-4" style={{ color: "var(--identity-violet)" }} />
                    <h4
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--fg-primary)" }}
                    >
                      Prossimi passi
                    </h4>
                  </div>

                  <div
                    className="rounded-lg p-3"
                    style={{
                      background: "var(--bg-base)",
                      border: "1px solid var(--border-dark-subtle)",
                    }}
                  >
                    {NEXT_STEPS.map((step, i) => (
                      <NextStepCard key={step.title} step={step} index={i} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
