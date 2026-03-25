/**
 * Department Registry — Metadati statici + dinamici per i dipartimenti della virtual company.
 *
 * I dipartimenti storici (~15) sono hardcoded nel DEPARTMENTS Record.
 * Dipartimenti creati a runtime dai creator vengono caricati dal DB (company_departments).
 *
 * Sync: DEPARTMENTS, getDepartmentMeta(), DEPT_ORDER — solo dati statici, costo zero.
 * Async: loadDepartments() — merge statici + DB, per contesti che necessitano la lista completa.
 */

import type { Department } from "./types";
import { KNOWN_DEPARTMENTS } from "./types";

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
  /** true = dipartimento protetto (hardcoded o boss-owned), non cancellabile da creator */
  protected?: boolean;
  /** UUID del creator (null per dipartimenti storici) */
  createdBy?: string | null;
}

/**
 * Static registry: tutti i dipartimenti hardcoded.
 * Tipo Record<string, DepartmentMeta> anziché Record<Department, DepartmentMeta>
 * perché Department è ora string e TypeScript richiederebbe un'entry per ogni stringa possibile.
 */
export const DEPARTMENTS: Record<string, DepartmentMeta> = {
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
      "Proteggere Poimandres e i suoi utenti. Piattaforma AI = dati sensibili. Audit periodici, zero vulnerabilità critiche aperte, RLS su tutti i dati utente.",
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
      "Poimandres come piattaforma madre con almeno 2 verticali attivi. Pipeline opportunità strutturata che genera almeno 1 nuovo dominio validato per trimestre.",
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

  "protocols": {
    id: "protocols",
    label: "Protocols",
    emoji: "📋",
    type: "staff",
    mission:
      "Governance aziendale: decision trees, routing richieste, audit decisioni, prompt optimization. Garantisce che ogni decisione segua il processo corretto.",
    vision:
      "Processo decisionale completamente tracciabile. Ogni decisione non-triviale ha un audit trail, un livello di approvazione e un owner chiaro.",
    priorities: [
      "Decision tree coverage — coprire tutti i flussi decisionali critici",
      "Routing automation — ridurre intervento manuale nel routing task",
      "Audit trail — tracciabilità completa delle decisioni",
    ],
    agents: [],
    runbooks: [
      { id: "validate-task-gate", label: "Validate Task Gate", filePath: "company/protocols/runbooks/validate-task-gate.md" },
    ],
    kpis: [
      "Routing coverage > 90%",
      "Decision audit completeness 100%",
    ],
    departmentFilePath: "company/protocols/department.md",
  },

  "acceleration": {
    id: "acceleration",
    label: "Acceleration",
    emoji: "🚀",
    type: "staff",
    mission:
      "Velocità: performance dipartimenti e pulizia codebase. Identifica bottleneck, propone semplificazioni, misura velocity.",
    vision:
      "Ogni dipartimento opera al massimo della velocità possibile. Zero tech debt critico. Build time < 30s.",
    priorities: [
      "Build performance — ridurre tempi di build e startup",
      "Tech debt cleanup — eliminare debiti tecnici bloccanti",
      "Velocity tracking — metriche di velocità per dipartimento",
    ],
    agents: [],
    runbooks: [],
    kpis: [
      "Build time < 60s",
      "Zero tech debt critico",
    ],
    departmentFilePath: "company/acceleration/department.md",
  },

  "integration": {
    id: "integration",
    label: "Ufficio Integrazione",
    emoji: "🔗",
    type: "revenue",
    mission:
      "Integrazione dati business per PMI italiane: connettori OAuth2 verso piattaforme esterne, pipeline CONNECT-AUTH-MAP-SYNC, analisi legale automatica sui documenti importati.",
    vision:
      "Hub di integrazione per PMI italiane con almeno 3 connettori attivi. Pipeline automatizzata con zero intervento manuale post-setup.",
    priorities: [
      "Fatture in Cloud connector — primo connettore MVP",
      "Google Drive connector — document management",
      "HubSpot connector — CRM",
    ],
    agents: [
      { id: "integration-lead",    label: "Integration Lead",    filePath: "company/integration/agents/integration-lead.md" },
      { id: "connector-builder",   label: "Connector Builder",   filePath: "company/integration/agents/connector-builder.md" },
      { id: "mapping-engine",      label: "Mapping Engine",      filePath: "company/integration/agents/mapping-engine.md" },
    ],
    runbooks: [
      { id: "add-connector",            label: "Add Connector",           filePath: "company/integration/runbooks/add-connector.md" },
      { id: "credential-management",    label: "Credential Management",   filePath: "company/integration/runbooks/credential-management.md" },
      { id: "mapping-troubleshoot",     label: "Mapping Troubleshoot",    filePath: "company/integration/runbooks/mapping-troubleshoot.md" },
    ],
    kpis: [
      "Connettori attivi >= 3",
      "Sync success rate > 95%",
      "Mapping accuracy > 90%",
    ],
    departmentFilePath: "company/integration/department.md",
  },

  "music": {
    id: "music",
    label: "Ufficio Musica",
    emoji: "🎵",
    type: "revenue",
    mission:
      "Label virtuale AI-powered: analisi audio, trend scouting, direzione artistica per artisti emergenti. Il tuo A&R personale, powered by AI.",
    vision:
      "Pipeline completa dall'upload del demo al piano di release. 7 agenti AI che guidano l'artista verso il successo commerciale.",
    priorities: [
      "Pipeline integration — collegare tutti gli agenti nell'orchestratore",
      "Trend data — integrare API Tunebat/Hooktheory",
      "Monetizzazione — piani Artist/Pro/Label",
    ],
    agents: [
      { id: "music-lead",             label: "Chief Music Manager",   filePath: "company/music/agents/music-lead.md" },
      { id: "audio-analyst",          label: "Audio Analyst",         filePath: "company/music/agents/audio-analyst.md" },
      { id: "trend-scout",            label: "Trend Scout",           filePath: "company/music/agents/trend-scout.md" },
      { id: "arrangement-director",   label: "Arrangement Director",  filePath: "company/music/agents/arrangement-director.md" },
      { id: "quality-reviewer",       label: "Quality Reviewer",      filePath: "company/music/agents/quality-reviewer.md" },
      { id: "release-strategist",     label: "Release Strategist",    filePath: "company/music/agents/release-strategist.md" },
      { id: "career-advisor",         label: "Career Advisor",        filePath: "company/music/agents/career-advisor.md" },
    ],
    runbooks: [
      { id: "music-pipeline", label: "Music Pipeline", filePath: "company/music/runbooks/music-pipeline.md" },
      { id: "setup-python",   label: "Setup Python",   filePath: "company/music/runbooks/setup-python.md" },
    ],
    kpis: [
      "Pipeline < 5 min per analisi",
      "AudioDNA accuracy > 90%",
      "User satisfaction > 4.0/5",
    ],
    departmentFilePath: "company/music/department.md",
  },
};

/**
 * Lookup sincrono per dipartimento (solo registry statico).
 * Per includere anche i dipartimenti dal DB, usare getDepartmentMetaAsync().
 */
export function getDepartmentMeta(dept: Department): DepartmentMeta | null {
  return DEPARTMENTS[dept] ?? null;
}

/**
 * Lookup asincrono per dipartimento — cerca prima nel registry statico, poi nel DB.
 */
export async function getDepartmentMetaAsync(dept: Department): Promise<DepartmentMeta | null> {
  const staticMeta = DEPARTMENTS[dept];
  if (staticMeta) return staticMeta;

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data } = await admin
      .from("company_departments")
      .select("*")
      .eq("name", dept)
      .limit(1)
      .single();

    if (!data) return null;

    return mapDbRowToDepartmentMeta(data);
  } catch {
    return null;
  }
}

/**
 * Carica TUTTI i dipartimenti: merge di statici (DEPARTMENTS) + dinamici (DB).
 * I dipartimenti statici hanno precedenza (override) su quelli nel DB con lo stesso nome.
 */
export async function loadDepartments(): Promise<DepartmentMeta[]> {
  // Parti dai dipartimenti statici
  const result = new Map<string, DepartmentMeta>();
  for (const [id, meta] of Object.entries(DEPARTMENTS)) {
    result.set(id, meta);
  }

  // Aggiungi dipartimenti dal DB (solo quelli non già presenti nel registry statico)
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data } = await admin
      .from("company_departments")
      .select("*")
      .order("created_at", { ascending: true });

    if (data) {
      for (const row of data) {
        if (!result.has(row.name)) {
          result.set(row.name, mapDbRowToDepartmentMeta(row));
        }
      }
    }
  } catch {
    // Se il DB non è raggiungibile, restituiamo solo i dipartimenti statici
  }

  return Array.from(result.values());
}

/** Mappa una riga DB (company_departments) in DepartmentMeta */
function mapDbRowToDepartmentMeta(row: Record<string, unknown>): DepartmentMeta {
  const config = (row.config as Record<string, unknown>) ?? {};
  const agents = (row.agents as Array<Record<string, string>>) ?? [];
  const runbooks = (row.runbooks as Array<Record<string, string>>) ?? [];

  return {
    id: row.name as string,
    label: (row.display_name as string) ?? (row.name as string),
    emoji: (config.emoji as string) ?? "📁",
    type: (config.type as "revenue" | "staff") ?? "staff",
    mission: (row.mission as string) ?? "",
    vision: (config.vision as string) ?? "",
    priorities: (config.priorities as string[]) ?? [],
    agents: agents.map((a) => ({
      id: a.id ?? "",
      label: a.label ?? "",
      filePath: a.filePath ?? "",
    })),
    runbooks: runbooks.map((r) => ({
      id: r.id ?? "",
      label: r.label ?? "",
      filePath: r.filePath ?? "",
    })),
    kpis: (config.kpis as string[]) ?? [],
    departmentFilePath: `company/${row.name}/department.md`,
    protected: (row.protected as boolean) ?? false,
    createdBy: (row.created_by as string) ?? null,
  };
}

/** Ordine statico per la UI — include tutti i dipartimenti noti */
export const DEPT_ORDER: Department[] = [...KNOWN_DEPARTMENTS];
