/**
 * Department Registry — Metadati statici per i 9 dipartimenti della virtual company.
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
  mission: string;       // 1-2 frasi estratte da department.md
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
    mission:
      "Gestione e ottimizzazione dei 7 agenti runtime che analizzano documenti legali per i cittadini. Punto di vista: sempre dalla parte debole — consumatore, conduttore, lavoratore.",
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

  "data-engineering": {
    id: "data-engineering",
    label: "Data Engineering",
    emoji: "🔌",
    mission:
      "Gestione pipeline dati legislativi: connessione a fonti esterne, parsing, validazione e caricamento nel corpus. Obiettivo: corpus completo e aggiornato delle leggi italiane ed europee.",
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
    mission:
      "Validazione continua del sistema: type check, lint, test manuali e testbook. Garantisce che ogni modifica non rompa nulla e che la qualità del codice rimanga alta.",
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
    mission:
      "Progettazione soluzioni tecniche scalabili e cost-aware. Ogni proposta include stima costi API, complessità e impatto sugli altri dipartimenti. Nessun refactoring senza ADR.",
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
    mission:
      "Monitoraggio costi API in tempo reale. Alert quando i costi superano le soglie stabilite. Obiettivo: massimo valore al minimo costo, con visibilità completa sulla spesa per provider e agente.",
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
    mission:
      "Monitoring e dashboard della virtual company. Visibilità completa sullo stato di tutti i dipartimenti, agenti e pipeline. Il punto di controllo è /ops.",
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
    mission:
      "Proteggere Controlla.me e i suoi utenti. App legale = dati sensibili. Audit periodici, zero vulnerabilità critiche aperte, RLS su tutti i dati utente.",
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
    mission:
      "Scansiona continuamente mercato, competitor e tecnologie AI emergenti per identificare opportunità di business, nuovi domini e nuovi agenti. Risponde a: \"Dove dovremmo andare che nessun altro ancora vede?\"",
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
    mission:
      "Radar del mercato. Ascolta la domanda reale, valida le opportunità identificate da Strategy e trasforma i segnali utenti in insight azionabili per la direzione.",
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
};

export function getDepartmentMeta(dept: Department): DepartmentMeta | null {
  return DEPARTMENTS[dept] ?? null;
}

export const DEPT_ORDER: Department[] = [
  "ufficio-legale",
  "data-engineering",
  "quality-assurance",
  "architecture",
  "security",
  "finance",
  "operations",
  "strategy",
  "marketing",
];
