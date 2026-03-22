"use client";

/**
 * OverviewSummaryPanel — Sintesi automatica + note manuali per l'overview.
 *
 * Mostra:
 *   - Focus del giorno (da daily plan) con bottone "Genera piano"
 *   - Prossime azioni consigliate con bottone "Crea task" inline
 *   - Report espandibili per ogni dipartimento (da status.json)
 *   - Box note manuale (persiste in localStorage)
 */

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  Clock,
  Lightbulb,
  NotebookPen,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Zap,
  Plus,
  FileText,
  AlertCircle,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface NextAction {
  dept: string;
  priority: "critical" | "high" | "medium";
  text: string;
}

interface DeptReport {
  dept: string;
  health: string;
  summary: string;
  lastUpdated: string | null;
  updatedBy: string | null;
  openTasks: string[];
  blockers: string[];
  gaps: Array<{ id: string; description: string; severity: string }>;
  nextActions: string[];
  notes: string;
}

interface SummaryData {
  date: string;
  focus: string;
  nextActions: NextAction[];
  deptReports: DeptReport[];
  masterExists: boolean;
  masterUpdated: string | null;
  planExists: boolean;
  planUpdated: string | null;
  /** Data effettiva del piano (può differire da date se fallback) */
  planDate: string | null;
  /** Data effettiva del master report (può differire da date se fallback) */
  masterDate: string | null;
  /** true se il piano o il master non sono di oggi */
  isStale: boolean;
}

const NOTES_KEY = "ops_overview_notes";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEPT_LABELS: Record<string, string> = {
  "trading":           "📈 Trading",
  "quality-assurance": "✅ QA",
  "data-engineering":  "🔧 Data Eng.",
  "architecture":      "🏗️ Architecture",
  "security":          "🛡️ Security",
  "finance":           "💰 Finance",
  "operations":        "📡 Operations",
  "strategy":          "🎯 Strategy",
  "marketing":         "📣 Marketing",
  "protocols":         "📋 Protocols",
  "ux-ui":             "🎨 UX/UI",
  "ufficio-legale":    "⚖️ Ufficio Legale",
  "acceleration":      "⚡ Acceleration",
};

const HEALTH_STYLES: Record<string, { dot: string; badge: string }> = {
  ok:      { dot: "bg-[var(--success)]",  badge: "text-[var(--success)]" },
  warning: { dot: "bg-[var(--identity-gold)]", badge: "text-[var(--identity-gold)]" },
  critical:{ dot: "bg-[var(--error)]",    badge: "text-[var(--error)]" },
  unknown: { dot: "bg-[var(--fg-invisible)]",   badge: "text-[var(--fg-invisible)]" },
};

function healthStyle(health: string) {
  return HEALTH_STYLES[health] ?? HEALTH_STYLES.unknown;
}

function _healthEmoji(health: string) {
  if (health === "ok") return "🟢";
  if (health === "warning") return "🟡";
  if (health === "critical") return "🔴";
  return "⚪";
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) +
    " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

/** Normalizza il nome dipartimento dal master report al key usato nei task */
function normalizeDept(display: string): string {
  const map: Record<string, string> = {
    "trading":            "trading",
    "data engineering":   "data-engineering",
    "data eng":           "data-engineering",
    "quality assurance":  "quality-assurance",
    "qa":                 "quality-assurance",
    "architecture":       "architecture",
    "security":           "security",
    "finance":            "finance",
    "operations":         "operations",
    "strategy":           "strategy",
    "marketing":          "marketing",
    "protocols":          "protocols",
    "ux/ui":              "ux-ui",
    "ux-ui":              "ux-ui",
    "ufficio legale":     "ufficio-legale",
    "ufficio-legale":     "ufficio-legale",
    "acceleration":       "acceleration",
  };
  const key = display.toLowerCase().trim();
  return map[key] ?? key.replace(/\s+/g, "-");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: NextAction["priority"] }) {
  const colors = { critical: "bg-[var(--error)]", high: "bg-[var(--accent)]", medium: "bg-[var(--identity-gold)]" };
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${colors[priority]}`} />;
}

function CreateTaskButton({ action }: { action: NextAction }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const create = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/company/tasks", {
        method: "POST",
        headers: { ...getConsoleAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: action.text,
          department: normalizeDept(action.dept),
          priority: action.priority,
          createdBy: "ops-panel",
          description: `Azione suggerita dall'overview panel (${action.priority}). Dipartimento: ${action.dept}.`,
        }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 3000);
  }, [action]);

  const styles = {
    idle:    "bg-[var(--bg-overlay)] hover:bg-[var(--border-dark)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]",
    loading: "bg-[var(--bg-overlay)] text-[var(--fg-invisible)] cursor-wait",
    done:    "bg-[rgba(93,228,199,0.12)] text-[var(--success)] border border-[rgba(93,228,199,0.2)]",
    error:   "bg-[rgba(229,141,120,0.12)] text-[var(--error)] border border-[rgba(229,141,120,0.2)]",
  };

  const labels = {
    idle: (<><Plus className="w-2.5 h-2.5" /> Crea task</>),
    loading: "...",
    done: "✓ Creato",
    error: "Errore",
  };

  return (
    <button
      onClick={create}
      disabled={status !== "idle"}
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors shrink-0 ${styles[status]}`}
    >
      {labels[status]}
    </button>
  );
}

function DeptReportCard({ report }: { report: DeptReport }) {
  const [expanded, setExpanded] = useState(false);
  const hs = healthStyle(report.health);
  const label = DEPT_LABELS[report.dept] ?? report.dept;
  const hasContent = report.gaps.length > 0 || report.blockers.length > 0 || report.nextActions.length > 0 || report.notes;

  return (
    <div className="border border-[var(--border-dark-subtle)] rounded-lg overflow-hidden bg-[var(--bg-base)]/60">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-3 py-2 flex items-center gap-3 hover:bg-[var(--bg-raised)]/30 transition-colors text-left"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${hs.dot}`} />
        <span className="text-xs font-medium text-[var(--fg-primary)] shrink-0">{label}</span>
        <span className="text-xs text-[var(--fg-secondary)] flex-1 truncate min-w-0">{report.summary.slice(0, 90)}{report.summary.length > 90 ? "…" : ""}</span>
        <span className="text-xs text-[var(--fg-invisible)] shrink-0 hidden sm:block">{fmtTimestamp(report.lastUpdated)}</span>
        {hasContent && (
          <ChevronDown className={`w-4 h-4 text-[var(--fg-invisible)] shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
        {!hasContent && <span className="w-4 h-4 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-[var(--border-dark-subtle)] space-y-2.5">
          {/* Summary completo */}
          <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">{report.summary}</p>

          {/* Gaps */}
          {report.gaps.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-[var(--identity-gold)] uppercase tracking-wider">Gap</span>
              {report.gaps.map((g) => (
                <div key={g.id} className="flex items-start gap-2 text-xs text-[var(--fg-secondary)]">
                  <span className="text-[var(--fg-invisible)] shrink-0 font-mono">{g.id}</span>
                  <span>{g.description}</span>
                  {g.severity && g.severity !== "low" && (
                    <span className={`shrink-0 text-xs px-1 rounded ${g.severity === "high" ? "text-[var(--error)] bg-[rgba(229,141,120,0.1)]" : "text-[var(--identity-gold)] bg-[rgba(255,199,50,0.1)]"}`}>
                      {g.severity}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Blockers */}
          {report.blockers.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-[var(--error)] uppercase tracking-wider">Blockers</span>
              {report.blockers.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-[rgba(229,141,120,0.85)]">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-[var(--error)]" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          )}

          {/* Next actions */}
          {report.nextActions.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-[var(--fg-invisible)] uppercase tracking-wider">Next actions</span>
              {report.nextActions.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-[var(--fg-secondary)]">
                  <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 text-[var(--fg-invisible)]" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {report.notes && (
            <p className="text-xs text-[var(--fg-invisible)] italic border-t border-[var(--border-dark-subtle)] pt-2">{report.notes}</p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 text-xs text-[var(--fg-invisible)] border-t border-[var(--border-dark-subtle)] pt-2">
            <Clock className="w-3 h-3" />
            <span>Aggiornato {fmtTimestamp(report.lastUpdated)}</span>
            {report.updatedBy && <span>da <span className="text-[var(--fg-secondary)]">{report.updatedBy}</span></span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OverviewSummaryPanel() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);

  // Load notes from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(NOTES_KEY) ?? "";
    setNotes(saved);
  }, []);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/summary", { headers: getConsoleAuthHeaders() });
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[OverviewSummaryPanel] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const generatePlan = useCallback(async () => {
    setGenerating(true);
    setGenerateMsg(null);
    try {
      const res = await fetch("/api/company/daily-plan", {
        method: "POST",
        headers: getConsoleAuthHeaders(),
      });
      const json = await res.json();
      setGenerateMsg(json.message ?? (json.ok ? "Piano generato." : json.error ?? "Errore"));
      if (json.ok || json.partial) {
        // Ricarica il summary con il nuovo piano
        await fetchSummary();
      }
    } catch {
      setGenerateMsg("Errore di rete. Prova dal terminale: npx tsx scripts/daily-standup.ts");
    } finally {
      setGenerating(false);
      setTimeout(() => setGenerateMsg(null), 6000);
    }
  }, [fetchSummary]);

  const saveNotes = useCallback(() => {
    localStorage.setItem(NOTES_KEY, notes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }, [notes]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--fg-secondary)] py-3">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Carico sintesi del giorno...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── Col 1: Focus + Azioni + Dipartimenti ───────────────────────── */}
      <div className="lg:col-span-2 space-y-3">

        {/* Focus del giorno */}
        <div className={`rounded-lg border bg-[var(--bg-raised)]/60 p-3 ${data.isStale ? "border-[rgba(229,141,120,0.3)]" : "border-[var(--border-dark-subtle)]"}`}>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Zap className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--fg-primary)] uppercase tracking-wider">Focus attivo</span>
            {data.planDate && data.planDate !== data.date && (
              <span className="text-xs px-2 py-0.5 rounded bg-[rgba(229,141,120,0.1)] text-[var(--error)] border border-[rgba(229,141,120,0.2)]">
                dal {new Date(data.planDate).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
              </span>
            )}
            {data.planUpdated && (
              <span className="text-xs text-[var(--fg-invisible)]">— {fmtTimestamp(data.planUpdated)}</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {/* Genera piano */}
              <button
                onClick={generatePlan}
                disabled={generating}
                className="flex items-center gap-1 px-2 py-1 bg-[#FF6B35]/15 hover:bg-[#FF6B35]/25 text-[#FF6B35] rounded text-xs font-medium transition-colors disabled:opacity-50"
                title="Genera piano giornaliero"
              >
                {generating
                  ? <><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Generando...</>
                  : <><FileText className="w-2.5 h-2.5" /> Genera piano</>
                }
              </button>
              {/* Refresh */}
              <button
                onClick={fetchSummary}
                className="p-1 rounded hover:bg-[var(--bg-overlay)] text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)] transition-colors"
                title="Aggiorna"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {data.focus && (
            <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">{data.focus}</p>
          )}
          {!data.planExists && (
            <p className="text-xs text-[var(--fg-invisible)] mt-1">
              Nessun piano disponibile — usa &quot;Genera piano&quot; o esegui dal terminale:{" "}
              <code className="text-[var(--fg-secondary)]">npx tsx scripts/daily-standup.ts</code>
            </p>
          )}
          {data.isStale && data.planExists && (
            <p className="text-xs text-[var(--error)] mt-2">
              ⚠ Ultimo piano generato il {data.planDate} — premi &quot;Genera piano&quot; per aggiornare a oggi
            </p>
          )}
          {generateMsg && (
            <p className="text-xs mt-2 text-[var(--error)] bg-[rgba(229,141,120,0.08)] border border-[rgba(229,141,120,0.15)] rounded px-2 py-1">
              {generateMsg}
            </p>
          )}
        </div>

        {/* Prossime azioni con "Crea task" */}
        {data.nextActions.length > 0 && (
          <div className="rounded-lg border border-[var(--border-dark-subtle)] bg-[var(--bg-raised)]/60 p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
              <span className="text-xs font-semibold text-[var(--fg-primary)] uppercase tracking-wider">
                Prossime azioni ({data.nextActions.length})
              </span>
            </div>
            <div className="space-y-2">
              {data.nextActions.map((action, i) => (
                <div key={i} className="flex items-start gap-2">
                  <PriorityDot priority={action.priority} />
                  <span className="text-xs text-[var(--fg-secondary)] flex-1 leading-snug">{action.text}</span>
                  <span className="text-xs text-[var(--fg-invisible)] shrink-0">{action.dept}</span>
                  <CreateTaskButton action={action} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Report dipartimenti espandibili */}
        <div className="rounded-lg border border-[var(--border-dark-subtle)] bg-[var(--bg-raised)]/60 p-3 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-[var(--fg-primary)] uppercase tracking-wider">
              Report Dipartimenti
            </span>
            {data.masterExists && data.masterUpdated && (
              <span className={`ml-auto text-xs flex items-center gap-1 ${data.masterDate && data.masterDate !== data.date ? "text-[var(--error)]" : "text-[var(--fg-invisible)]"}`}>
                <FileText className="w-3 h-3" />
                master {data.masterDate && data.masterDate !== data.date
                  ? `dal ${new Date(data.masterDate).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}`
                  : fmtTimestamp(data.masterUpdated)}
              </span>
            )}
          </div>

          {data.deptReports.length > 0 ? (
            <div className="space-y-1">
              {data.deptReports.map((report) => (
                <DeptReportCard key={report.dept} report={report} />
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <Lightbulb className="w-5 h-5 text-[var(--fg-invisible)] mx-auto mb-1" />
              <p className="text-xs text-[var(--fg-secondary)]">
                Nessun status.json trovato nei dipartimenti.
              </p>
            </div>
          )}
        </div>

        {/* Empty state globale */}
        {!data.masterExists && data.nextActions.length === 0 && data.deptReports.length === 0 && (
          <div className="rounded-lg border border-[var(--border-dark-subtle)] bg-[var(--bg-base)]/60 p-4 text-center">
            <Lightbulb className="w-5 h-5 text-[var(--fg-invisible)] mx-auto mb-2" />
            <p className="text-xs text-[var(--fg-secondary)]">Nessun report disponibile per oggi.</p>
          </div>
        )}
      </div>

      {/* ── Col 2: Note manuali ────────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--border-dark-subtle)] bg-[var(--bg-raised)]/60 p-3 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <NotebookPen className="w-4 h-4 text-[var(--identity-violet)]" />
          <span className="text-xs font-semibold text-[var(--fg-primary)] uppercase tracking-wider">Note & Priorità</span>
          {notesSaved && (
            <span className="ml-auto text-xs text-[var(--success)] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Salvato
            </span>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder={"Scrivi qui priorità, decisioni, note per la sessione...\n\nEs:\n• Chiamare avvocato per DPA\n• Review backtest results\n• Decidere verticale Q2"}
          className="flex-1 min-h-[80px] md:min-h-[160px] bg-[var(--bg-base)] border border-[var(--border-dark)] rounded-md p-3 text-xs text-[var(--fg-secondary)] placeholder:text-[var(--fg-muted)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] transition-colors font-mono leading-relaxed"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-[var(--fg-invisible)]">
            <Clock className="w-3 h-3 inline mr-1" />
            Salvataggio automatico al click fuori
          </span>
          <button
            onClick={saveNotes}
            className="text-xs px-2 py-1 rounded bg-[var(--bg-overlay)] hover:bg-[var(--border-dark)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors"
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
