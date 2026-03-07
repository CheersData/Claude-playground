/**
 * Department Registry — Metadati statici per gli 11 dipartimenti della virtual company.
 * Nessuna chiamata DB, nessun async. Importabile ovunque a costo zero.
 */

import type { Department } from "./types";

export interface AgentRef {
  id: string;
  label: string;
  filePath: string; // relativo alla root del progetto: "company/ufficio-legale/agents/classifier.md"
}

export interface RunbookRef {
  id: string;
  label: string;
  filePath: string;
}

export interface DepartmentMeta {
  id: Department;
  label: string;
  emoji: string;
  type: "revenue" | "staff";  // Revenue = uffici core, Staff = supporto
  mission: string;       // 1-2 frasi estratte da department.md
  vision: string;        // Visione 6 mesi del dipartimento
  priorities: string[];  // Priorità ordinate [P0, P1, P2]
  agents: AgentRef[];
  runbooks: RunbookRef[];
  kpis: string[];
  departmentFilePath: string; // "company/{dept}/department.md"
}

export const DEPARTMENTS: Record<Department, DepartmentMeta> = {
  "ufficio-legale": {
    id: "ufficio-legale",
    label: "Ufficio Legale",
    emoji: "⚖️",
    type: "revenue",
    mission:
      "Gestione e ottimizzazione dei 7 agenti runtime che analizzano documenti legali per i cittadini. Punto di vista: sempre dalla parte debole — consumatore, conduttore, lavoratore.",
    vision:
      "Analisi legale best-in-class Italia con almeno 2 verticali (contratti generici + contratti lavoro). Pipeline < 60s, accuracy > 95%, zero sentenze inventate.",
    priorities: [
      "Verticale HR — adattare prompt per contratti di lavoro quando corpus HR sarà pronto",
      "Prompt optimization — ridurre token usage mantenendo qualità output",
      "Testbook expansion — aggiungere 10+ nuovi casi di test reali",
    ],
    agents: [
      { id: "leader",        label: "Leader",        filePath: "company/ufficio-legale/agents/leader.md" },
      { id: "classifier",    label: "Classifier",    filePath: "company/ufficio-legale/agents/classifier.md" },
      { id: "analyzer",      label: "Analyzer",      filePath: "company/ufficio-legale/agents/analyzer.md" },
      { id: "investigator",  label: "Investigator",  filePath: "company/ufficio-legale/agents/investigator.md" },
      { id: "advisor",       label: "Advisor",       filePath: "company/ufficio-legale/agents/advisor.md" },
      { id: "corpus-agent",  label: "Corpus Agent",  filePath: "company/ufficio-legale/agents/corpus-agent.md" },
      { id: "question-prep", label: "Question Prep", filePath: "company/ufficio-legale/agents/question-prep.md" },
    ],
    runbooks: [],
    kpis: [
      "Tempo pipeline < 90s",
      "Accuracy classificazione > 90%",
      "JSON output valido: 100%",
    ],
    departmentFilePath: "company/ufficio-legale/department.md",
  },

  "trading": {
    id: "trading",
    label: "Ufficio Trading",
    emoji: "📈",
    type: "revenue",
    mission:
      "Trading automatizzato su azioni US e ETF via Alpaca Markets per sostenibilità finanziaria. Pipeline 5 agenti: scanner, signal, risk, executor, monitor.",
    vision:
      "Trading live profittevole con Sharpe > 1.0, max drawdown < 10%, 30+ giorni paper validati. Revenue trading che copre almeno i costi infrastrutturali.",
    priorities: [
      "Sharpe > 1.0 — grid search parametri per superare soglia",
      "Paper trading 30 giorni — validare strategia ottimizzata",
      "Go-live checklist — kill switch testato, capital allocato, monitoring attivo",
    ],
    agents: [
      { id: "trading-lead",      label: "Trading Lead",      filePath: "company/trading/agents/trading-lead.md" },
      { id: "market-scanner",    label: "Market Scanner",    filePath: "company/trading/agents/market-scanner.md" },
      { id: "signal-generator",  label: "Signal Generator",  filePath: "company/trading/agents/signal-generator.md" },
      { id: "risk-manager",      label: "Risk Manager",      filePath: "company/trading/agents/risk-manager.md" },
      { id: "executor",          label: "Executor",          filePath: "company/trading/agents/executor.md" },
      { id: "portfolio-monitor", label: "Portfolio Monitor", filePath: "company/trading/agents/portfolio-monitor.md" },
    ],
    runbooks: [
      { id: "trading-pipeline",  label: "Trading Pipeline",  filePath: "company/trading/runbooks/trading-pipeline.md" },
      { id: "risk-management",   label: "Risk Management",   filePath: "company/trading/runbooks/risk-management.md" },
      { id: "backtest",          label: "Backtest",           filePath: "company/trading/runbooks/backtest.md" },
      { id: "go-live",           label: "Go Live",            filePath: "company/trading/runbooks/go-live.md" },
    ],
    kpis: [
      "Paper trading: 30 giorni minimo prima di go-live",
      "Max daily loss < -2% portfolio",
      "Sharpe ratio > 1.0 in backtest",
    ],
    departmentFilePath: "company/trading/department.md",
  },

  "data-engineering": {
    id: "data-engineering",
    label: "Data Engineering",
    emoji: "🔌",
    type: "staff",
    mission:
      "Gestione pipeline dati legislativi: connessione a fonti esterne, parsing, validazione e caricamento nel corpus. Obiettivo: corpus completo e aggiornato delle leggi italiane ed europee.",
    vision:
      "Corpus legislativo completo per ogni verticale attivo. Pipeline automatizzata con delta update settimanali, zero intervento manuale.",
    priorities: [
      "Statuto dei Lavoratori (L. 300/1970) — ricercare sistemi alternativi",
      "Fonti verticale HR — D.Lgs. 81/2008, D.Lgs. 276/2003, D.Lgs. 23/2015",
      "Automazione delta update — rendere update incrementali completamente automatici",
    ],
    agents: [
      { id: "data-connector", label: "Data Connector", filePath: "company/data-engineering/agents/data-connector.md" },
    ],
    runbooks: [
      { id: "add-new-source", label: "Aggiungere fonte",    filePath: "company/data-engineering/runbooks/add-new-source.md" },
      { id: "delta-update",   label: "Aggiornamento delta", filePath: "company/data-engineering/runbooks/delta-update.md" },
    ],
    kpis: [
      "Articoli nel corpus > 5.000",
      "Fonti attive: 13/14",
      "Zero sync fallite negli ultimi 7 giorni",
    ],
    departmentFilePath: "company/data-engineering/department.md",
  },

  "quality-assurance": {
    id: "quality-assurance",
    label: "Quality Assurance",
    emoji: "🧪",
    type: "staff",
    mission:
      "Validazione continua del sistema: type check, lint, test manuali e testbook. Garantisce che ogni modifica non rompa nulla e che la qualità del codice rimanga alta.",
    vision:
      "Coverage 100% su infrastruttura core. Testbook con >90% accuracy. CI/CD che blocca PR con test falliti. Zero regressioni su merge.",
    priorities: [
      "Test suite critiche — agent-runner.ts, tiers.ts, generate.ts",
      "Middleware coverage — console-token.ts, analysis-cache.ts",
      "Testbook accuracy — portare da 75% a >85%",
    ],
    agents: [
      { id: "test-runner", label: "Test Runner", filePath: "company/quality-assurance/agents/test-runner.md" },
    ],
    runbooks: [
      { id: "run-full-suite",   label: "Run Full Suite",   filePath: "company/quality-assurance/runbooks/run-full-suite.md" },
      { id: "fix-failing-test", label: "Fix Failing Test", filePath: "company/quality-assurance/runbooks/fix-failing-test.md" },
    ],
    kpis: [
      "Type check: zero errori",
      "Lint: zero errori",
      "Build: sempre green",
    ],
    departmentFilePath: "company/quality-assurance/department.md",
  },

  "architecture": {
    id: "architecture",
    label: "Architecture",
    emoji: "🏛️",
    type: "staff",
    mission:
      "Progettazione soluzioni tecniche scalabili e cost-aware. Ogni proposta include stima costi API, complessità e impatto sugli altri dipartimenti. Nessun refactoring senza ADR.",
    vision:
      "Config-driven infrastruttura che supporta N verticali senza duplicare logica. Ogni nuovo verticale = configurazione, non codice custom.",
    priorities: [
      "CI/CD pipeline — GitHub Actions: test + build + deploy preview su ogni PR",
      "Multi-verticale config-driven — sistema config per aggiungere verticali senza codice inline",
      "ADR cleanup — aggiornare decision log con ultime decisioni",
    ],
    agents: [
      { id: "architect", label: "Architect", filePath: "company/architecture/agents/architect.md" },
    ],
    runbooks: [
      { id: "evaluate-solution", label: "Valuta Soluzione", filePath: "company/architecture/runbooks/evaluate-solution.md" },
    ],
    kpis: [
      "Zero breaking changes non annunciati",
      "Cost estimate presente in ogni proposta",
      "ADR aggiornato ad ogni decisione",
    ],
    departmentFilePath: "company/architecture/department.md",
  },

  "finance": {
    id: "finance",
    label: "Finance",
    emoji: "💰",
    type: "staff",
    mission:
      "Monitoraggio costi API in tempo reale. Alert quando i costi superano le soglie stabilite. Obiettivo: massimo valore al minimo costo, con visibilità completa sulla spesa per provider e agente.",
    vision:
      "Costo per analisi < $0.02. Dashboard P&L che unisce costi API + revenue trading + subscription. Alert automatici su sforamenti budget.",
    priorities: [
      "Free tier maximization — ottimizzare routing per minimizzare costi Anthropic",
      "Costo per analisi — metrica chiave per tier",
      "Trading P&L integration — collegare dati trading al report finanziario complessivo",
    ],
    agents: [
      { id: "cost-controller", label: "Cost Controller", filePath: "company/finance/agents/cost-controller.md" },
    ],
    runbooks: [
      { id: "cost-report", label: "Cost Report", filePath: "company/finance/runbooks/cost-report.md" },
    ],
    kpis: [
      "Costo giornaliero < $1.00",
      "Costo singola query < $0.10",
      "Fallback rate < 30%",
    ],
    departmentFilePath: "company/finance/department.md",
  },

  "operations": {
    id: "operations",
    label: "Operations",
    emoji: "📡",
    type: "staff",
    mission:
      "Monitoring e dashboard della virtual company. Visibilità completa sullo stato di tutti i dipartimenti, agenti e pipeline. Il punto di controllo è /ops.",
    vision:
      "Ops completamente autonoma: alerting automatico, dashboard self-service, monitoring proattivo. Nessun team deve chiedere 'come stiamo?'.",
    priorities: [
      "Alerting automatico — notifiche Telegram su test falliti, costi e sync",
      "Dashboard KPI dipartimenti — metriche real-time su /ops",
      "Cron monitoring — health check automatico dei cron job",
    ],
    agents: [
      { id: "ops-monitor", label: "Ops Monitor", filePath: "company/operations/agents/ops-monitor.md" },
    ],
    runbooks: [
      { id: "status-report", label: "Status Report", filePath: "company/operations/runbooks/status-report.md" },
    ],
    kpis: [
      "Dashboard aggiornata < 60s",
      "Zero alert non risolti > 24h",
    ],
    departmentFilePath: "company/operations/department.md",
  },

  "security": {
    id: "security",
    label: "Security",
    emoji: "🛡️",
    type: "staff",
    mission:
      "Proteggere Controlla.me e i suoi utenti. App legale = dati sensibili. Audit periodici, zero vulnerabilità critiche aperte, RLS su tutti i dati utente.",
    vision:
      "Compliance automatizzata: audit security schedulati, DPA firmati con tutti i provider AI, EU AI Act readiness. Security scanning integrato nella CI/CD.",
    priorities: [
      "DPA provider AI — firmare Data Processing Agreement con Anthropic, Google, Mistral",
      "EU AI Act readiness — ingaggiare consulente, classificazione sistema, gap analysis",
      "Security scanning CI/CD — integrare audit automatico delle route nella pipeline",
    ],
    agents: [
      { id: "security-auditor", label: "Security Auditor", filePath: "company/security/agents/security-auditor.md" },
    ],
    runbooks: [
      { id: "security-audit",    label: "Security Audit",    filePath: "company/security/runbooks/security-audit.md" },
      { id: "fix-vulnerability", label: "Fix Vulnerability", filePath: "company/security/runbooks/fix-vulnerability.md" },
    ],
    kpis: [
      "Zero vulnerabilità critiche aperte",
      "Audit periodico completato ogni 30 giorni",
    ],
    departmentFilePath: "company/security/department.md",
  },

  "strategy": {
    id: "strategy",
    label: "Strategy",
    emoji: "🎯",
    type: "staff",
    mission:
      "Scansiona continuamente mercato, competitor e tecnologie AI emergenti per identificare opportunità di business, nuovi domini e nuovi agenti. Risponde a: \"Dove dovremmo andare che nessun altro ancora vede?\"",
    vision:
      "Controlla.me come piattaforma madre con almeno 2 verticali attivi. Pipeline opportunità strutturata che genera almeno 1 nuovo dominio validato per trimestre.",
    priorities: [
      "Opportunity Brief verticale HR — valutare domanda HRTech Italia, competitor, effort",
      "OKR Q2 2026 — definire obiettivi misurabili per il trimestre",
      "Competitive intelligence — monitoraggio sistematico dei 5 competitor principali",
    ],
    agents: [
      { id: "strategist", label: "Strategist", filePath: "company/strategy/agents/strategist.md" },
    ],
    runbooks: [
      { id: "quarterly-review",        label: "Quarterly Review",       filePath: "company/strategy/runbooks/quarterly-review.md" },
      { id: "feature-prioritization",  label: "Feature Prioritization", filePath: "company/strategy/runbooks/feature-prioritization.md" },
    ],
    kpis: [
      "Opportunity Brief >= 2/mese",
      "Competitor snapshot >= 1/mese",
      "OKR completion > 70%",
    ],
    departmentFilePath: "company/strategy/department.md",
  },

  "marketing": {
    id: "marketing",
    label: "Marketing",
    emoji: "📣",
    type: "staff",
    mission:
      "Radar del mercato. Ascolta la domanda reale, valida le opportunità identificate da Strategy e trasforma i segnali utenti in insight azionabili per la direzione.",
    vision:
      "Traffico organico >5.000 sessioni/mese con funnel misurabile. Primo Market Signal Report che guida almeno 1 decisione di prodotto.",
    priorities: [
      "GSC + GA4 operativi — configurare proprietà Google, verificare dominio",
      "Contenuto SEO seed — 5 guide legali ad alto volume di ricerca",
      "Primo Market Signal Report — raccogliere segnali da keyword, community, competitor",
    ],
    agents: [
      { id: "content-writer", label: "Content Writer", filePath: "company/marketing/agents/content-writer.md" },
      { id: "growth-hacker",  label: "Growth Hacker",  filePath: "company/marketing/agents/growth-hacker.md" },
    ],
    runbooks: [
      { id: "content-calendar", label: "Content Calendar", filePath: "company/marketing/runbooks/content-calendar.md" },
      { id: "growth-analysis",  label: "Growth Analysis",  filePath: "company/marketing/runbooks/growth-analysis.md" },
    ],
    kpis: [
      "Market Signal Reports >= 1/mese",
      "Organic traffic > 1.000 sessioni/mese",
      "Conversion > 5%",
    ],
    departmentFilePath: "company/marketing/department.md",
  },

  "ux-ui": {
    id: "ux-ui",
    label: "UX/UI",
    emoji: "🎨",
    type: "staff",
    mission:
      "Design, implementazione e mantenimento dell'esperienza utente. Coerenza visiva, accessibilità WCAG 2.1 AA, Design System, brand identity. Responsabile del Beauty Report.",
    vision:
      "Design system completo e riusabile per N verticali. Accessibilità WCAG 2.1 AA certificata. Ogni nuovo verticale eredita il design system senza lavoro custom.",
    priorities: [
      "Audit accessibilità WCAG — verificare tutte le pagine principali",
      "Design system tokens — estrarre valori hardcoded in token riusabili",
      "Template multi-verticale — preparare layout template per nuovi verticali",
    ],
    agents: [
      { id: "ui-ux-designer", label: "UI/UX Designer", filePath: "company/ux-ui/agents/ui-ux-designer.md" },
    ],
    runbooks: [
      { id: "implement-ui-change", label: "Implementa UI Change", filePath: "company/ux-ui/runbooks/implement-ui-change.md" },
      { id: "accessibility-audit",  label: "Audit Accessibilità",  filePath: "company/ux-ui/runbooks/accessibility-audit.md" },
    ],
    kpis: [
      "Beauty Report score >= 8.0/10",
      "Zero violazioni WCAG AA critiche",
      "Design System: token coverage 100%",
    ],
    departmentFilePath: "company/ux-ui/department.md",
  },
};

export function getDepartmentMeta(dept: Department): DepartmentMeta | null {
  return DEPARTMENTS[dept] ?? null;
}

export const DEPT_ORDER: Department[] = [
  "ufficio-legale",
  "trading",
  "data-engineering",
  "quality-assurance",
  "architecture",
  "ux-ui",
  "security",
  "finance",
  "operations",
  "strategy",
  "marketing",
];
