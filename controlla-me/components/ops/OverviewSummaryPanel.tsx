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
  ok:      { dot: "bg-green-400",  badge: "text-green-400" },
  warning: { dot: "bg-yellow-400", badge: "text-yellow-400" },
  critical:{ dot: "bg-red-400",    badge: "text-red-400" },
  unknown: { dot: "bg-zinc-500",   badge: "text-zinc-500" },
};

function healthStyle(health: string) {
  return HEALTH_STYLES[health] ?? HEALTH_STYLES.unknown;
}

function healthEmoji(health: string) {
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
  const colors = { critical: "bg-red-400", high: "bg-orange-400", medium: "bg-yellow-400" };
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${colors[priority]}`} />;
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
    idle:    "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200",
    loading: "bg-zinc-800 text-zinc-500 cursor-wait",
    done:    "bg-green-500/20 text-green-400 border border-green-500/30",
    error:   "bg-red-500/20 text-red-400 border border-red-500/30",
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
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors shrink-0 ${styles[status]}`}
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
    <div className="border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-900/30">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800/30 transition-colors text-left"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${hs.dot}`} />
        <span className="text-xs font-medium text-zinc-200 shrink-0">{label}</span>
        <span className="text-xs text-zinc-500 flex-1 truncate min-w-0">{report.summary.slice(0, 90)}{report.summary.length > 90 ? "…" : ""}</span>
        <span className="text-[10px] text-zinc-600 shrink-0 hidden sm:block">{fmtTimestamp(report.lastUpdated)}</span>
        {hasContent && (
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
        {!hasContent && <span className="w-3.5 h-3.5 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-zinc-800/60 space-y-2.5">
          {/* Summary completo */}
          <p className="text-xs text-zinc-400 leading-relaxed">{report.summary}</p>

          {/* Gaps */}
          {report.gaps.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-yellow-500 uppercase tracking-wider">Gap</span>
              {report.gaps.map((g) => (
                <div key={g.id} className="flex items-start gap-1.5 text-xs text-zinc-400">
                  <span className="text-zinc-600 shrink-0 font-mono">{g.id}</span>
                  <span>{g.description}</span>
                  {g.severity && g.severity !== "low" && (
                    <span className={`shrink-0 text-[10px] px-1 rounded ${g.severity === "high" ? "text-red-400 bg-red-500/10" : "text-yellow-400 bg-yellow-500/10"}`}>
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
              <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Blockers</span>
              {report.blockers.map((b, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-red-300">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-red-400" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          )}

          {/* Next actions */}
          {report.nextActions.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Next actions</span>
              {report.nextActions.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-zinc-400">
                  <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 text-zinc-600" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {report.notes && (
            <p className="text-xs text-zinc-500 italic border-t border-zinc-800/60 pt-2">{report.notes}</p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 text-[10px] text-zinc-600 border-t border-zinc-800/60 pt-2">
            <Clock className="w-3 h-3" />
            <span>Aggiornato {fmtTimestamp(report.lastUpdated)}</span>
            {report.updatedBy && <span>da <span className="text-zinc-500">{report.updatedBy}</span></span>}
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
      <div className="flex items-center gap-2 text-xs text-zinc-500 py-3">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Zap className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Focus del giorno</span>
            {data.planUpdated && (
              <span className="text-[10px] text-zinc-600">— {fmtTimestamp(data.planUpdated)}</span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {/* Genera piano */}
              <button
                onClick={generatePlan}
                disabled={generating}
                className="flex items-center gap-1 px-2 py-1 bg-[#FF6B35]/15 hover:bg-[#FF6B35]/25 text-[#FF6B35] rounded text-[10px] font-medium transition-colors disabled:opacity-50"
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
                className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400 transition-colors"
                title="Aggiorna"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {data.focus && (
            <p className="text-xs text-zinc-400 leading-relaxed">{data.focus}</p>
          )}
          {!data.planExists && (
            <p className="text-[10px] text-zinc-600 mt-1">
              Nessun piano per oggi — usa &quot;Genera piano&quot; o esegui dal terminale:{" "}
              <code className="text-zinc-500">npx tsx scripts/daily-standup.ts</code>
            </p>
          )}
          {generateMsg && (
            <p className="text-[10px] mt-2 text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded px-2 py-1">
              {generateMsg}
            </p>
          )}
        </div>

        {/* Prossime azioni con "Crea task" */}
        {data.nextActions.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Prossime azioni ({data.nextActions.length})
              </span>
            </div>
            <div className="space-y-2">
              {data.nextActions.map((action, i) => (
                <div key={i} className="flex items-start gap-2">
                  <PriorityDot priority={action.priority} />
                  <span className="text-xs text-zinc-400 flex-1 leading-snug">{action.text}</span>
                  <span className="text-[10px] text-zinc-600 shrink-0">{action.dept}</span>
                  <CreateTaskButton action={action} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Report dipartimenti espandibili */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Report Dipartimenti
            </span>
            {data.masterExists && data.masterUpdated && (
              <span className="ml-auto text-[10px] text-zinc-600 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                master {fmtTimestamp(data.masterUpdated)}
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
              <Lightbulb className="w-5 h-5 text-zinc-600 mx-auto mb-1" />
              <p className="text-xs text-zinc-500">
                Nessun status.json trovato nei dipartimenti.
              </p>
            </div>
          )}
        </div>

        {/* Empty state globale */}
        {!data.masterExists && data.nextActions.length === 0 && data.deptReports.length === 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-center">
            <Lightbulb className="w-5 h-5 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">Nessun report disponibile per oggi.</p>
          </div>
        )}
      </div>

      {/* ── Col 2: Note manuali ────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <NotebookPen className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Note & Priorità</span>
          {notesSaved && (
            <span className="ml-auto text-[10px] text-teal-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Salvato
            </span>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder={"Scrivi qui priorità, decisioni, note per la sessione...\n\nEs:\n• Chiamare avvocato per DPA\n• Review backtest results\n• Decidere verticale Q2"}
          className="flex-1 min-h-[160px] bg-zinc-950 border border-zinc-700 rounded-md p-2.5 text-xs text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500 transition-colors font-mono leading-relaxed"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-zinc-600">
            <Clock className="w-3 h-3 inline mr-1" />
            Salvataggio automatico al click fuori
          </span>
          <button
            onClick={saveNotes}
            className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
