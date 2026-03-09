"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  Save,
  Plus,
  X,
  Loader2,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Telescope,
  Building2,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VisionData {
  id: string;
  vision: string;
  mission: string;
  priorities: string[];
  updated_at: string;
  updated_by: string;
}

interface SchedulerPlanData {
  id: string;
  plan_number: number;
  status: "pending" | "approved" | "modified" | "cancelled";
  created_at: string;
  approved_at: string | null;
  plan_content: { planText?: string; tasks?: Array<{ dept: string; title: string }> };
  recommendations: string[];
}

interface DeptVision {
  id: string;
  label: string;
  emoji: string;
  type: "revenue" | "staff";
  mission: string;
  vision: string;
  priorities: string[];
  agentCount: number;
  kpis: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_STATUS_STYLES: Record<string, string> = {
  pending:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  approved:  "bg-green-500/15 text-green-400 border-green-500/30",
  modified:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cancelled: "bg-[var(--bg-overlay)]/60 text-[var(--fg-secondary)] border-[var(--border-dark)]",
};

const PLAN_STATUS_LABELS: Record<string, string> = {
  pending:   "In attesa",
  approved:  "Approvato",
  modified:  "Modificato",
  cancelled: "Annullato",
};

const TYPE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  revenue: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", label: "Revenue" },
  staff:   { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/20",    label: "Staff" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Department Card ──────────────────────────────────────────────────────────

function DeptCard({ dept, index }: { dept: DeptVision; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const typeStyle = TYPE_STYLES[dept.type] ?? TYPE_STYLES.staff;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="bg-[var(--bg-overlay)]/40 rounded-xl border border-[var(--border-dark-subtle)] hover:border-[var(--border-dark)] transition-all group"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-start gap-3 text-left cursor-pointer"
        aria-expanded={expanded}
        aria-label={`${dept.label} — ${expanded ? "comprimi" : "espandi"}`}
      >
        <span className="text-xl flex-shrink-0 mt-0.5">{dept.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-white truncate">{dept.label}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>
              {typeStyle.label}
            </span>
          </div>
          {/* Vision summary — sempre visibile */}
          <p className="text-xs text-[var(--fg-secondary)] leading-relaxed line-clamp-2">{dept.vision}</p>
        </div>
        <span className="text-[var(--fg-invisible)] group-hover:text-[var(--fg-secondary)] transition-colors mt-1 flex-shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 space-y-3 border-t border-[var(--border-dark-subtle)] pt-3">
              {/* Mission */}
              <div>
                <p className="text-xs text-[var(--fg-invisible)] uppercase tracking-widest font-semibold mb-1">Missione</p>
                <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">{dept.mission}</p>
              </div>

              {/* Priorities */}
              {dept.priorities.length > 0 && (
                <div>
                  <p className="text-xs text-[var(--fg-invisible)] uppercase tracking-widest font-semibold mb-2">Priorita</p>
                  <div className="space-y-1">
                    {dept.priorities.map((p, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold flex-shrink-0 ${
                          i === 0 ? "bg-[#FF6B35]/20 text-[#FF6B35]" :
                          i === 1 ? "bg-[var(--bg-hover)] text-[var(--fg-secondary)]" :
                                    "bg-[var(--bg-overlay)] text-[var(--fg-invisible)]"
                        }`}>
                          P{i}
                        </span>
                        <span className="text-xs text-[var(--fg-secondary)] leading-relaxed">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* KPIs */}
              {dept.kpis.length > 0 && (
                <div>
                  <p className="text-xs text-[var(--fg-invisible)] uppercase tracking-widest font-semibold mb-2">KPI</p>
                  <div className="flex flex-wrap gap-2">
                    {dept.kpis.map((kpi, i) => (
                      <span key={i} className="text-xs bg-[var(--bg-overlay)] text-[var(--fg-invisible)] px-2 py-0.5 rounded-full">
                        {kpi}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent count */}
              <div className="flex items-center gap-2 text-xs text-[var(--fg-invisible)]">
                <Sparkles className="w-3 h-3" />
                {dept.agentCount} {dept.agentCount === 1 ? "agente" : "agenti"}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VisionMissionPanel() {
  const [vision, setVision] = useState<VisionData | null>(null);
  const [latestPlan, setLatestPlan] = useState<SchedulerPlanData | null>(null);
  const [departments, setDepartments] = useState<DeptVision[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  // Edit state
  const [editVision, setEditVision] = useState("");
  const [editMission, setEditMission] = useState("");
  const [editPriorities, setEditPriorities] = useState<string[]>([]);
  const [newPriority, setNewPriority] = useState("");

  // Filter
  const [deptFilter, setDeptFilter] = useState<"all" | "revenue" | "staff">("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [visionRes, deptsRes] = await Promise.all([
        fetch("/api/company/vision", { headers: getConsoleAuthHeaders() }),
        fetch("/api/company/departments/visions", { headers: getConsoleAuthHeaders() }),
      ]);

      if (visionRes.ok) {
        const json = await visionRes.json();
        const v: VisionData | null = json.vision;
        setVision(v);
        setLatestPlan(json.latestPlan ?? null);
        if (v) {
          setEditVision(v.vision);
          setEditMission(v.mission);
          setEditPriorities(v.priorities ?? []);
        }
      }

      if (deptsRes.ok) {
        const json = await deptsRes.json();
        setDepartments(json.departments ?? []);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch("/api/company/vision", {
        method: "PUT",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({
          vision: editVision.trim(),
          mission: editMission.trim(),
          priorities: editPriorities.filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setVision(json.vision);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setSaving(false);
    }
  }

  function addPriority() {
    const p = newPriority.trim();
    if (!p) return;
    setEditPriorities((prev) => [...prev, p]);
    setNewPriority("");
  }

  function removePriority(idx: number) {
    setEditPriorities((prev) => prev.filter((_, i) => i !== idx));
  }

  const isDirty = vision
    ? editVision !== vision.vision || editMission !== vision.mission ||
      JSON.stringify(editPriorities) !== JSON.stringify(vision.priorities)
    : editVision !== "" || editMission !== "";

  const filteredDepts = departments.filter(
    (d) => deptFilter === "all" || d.type === deptFilter
  );

  const revenueCount = departments.filter((d) => d.type === "revenue").length;
  const staffCount = departments.filter((d) => d.type === "staff").length;

  if (loading) {
    return (
      <div className="bg-[var(--bg-raised)] rounded-xl border border-[var(--border-dark-subtle)] p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--fg-invisible)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══ Poimandres Vision ═══ */}
      <div className="bg-[var(--bg-raised)] rounded-xl border border-[var(--border-dark-subtle)] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-[#FF6B35]" />
            Poimandres — Vision & Mission
          </h2>
          <div className="flex items-center gap-3">
            {vision && (
              <span className="text-xs text-[var(--fg-invisible)] font-mono">
                Aggiornato {formatDateTime(vision.updated_at)} da {vision.updated_by}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="cursor-pointer p-2 rounded-lg text-[var(--fg-invisible)] hover:text-white hover:bg-[var(--bg-overlay)] transition-colors disabled:opacity-50"
              aria-label="Aggiorna"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {!vision && (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-xs text-yellow-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Vision/Mission non ancora configurata. Compila il form e salva.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--fg-invisible)] font-semibold uppercase tracking-wide mb-2">
              Vision — dove vogliamo arrivare
            </label>
            <textarea
              value={editVision}
              onChange={(e) => setEditVision(e.target.value)}
              rows={3}
              placeholder="Es: Diventare la prima e piu potente AGI..."
              className="w-full bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-3 text-sm text-white placeholder-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] resize-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--fg-invisible)] font-semibold uppercase tracking-wide mb-2">
              Mission — cosa facciamo oggi e perche
            </label>
            <textarea
              value={editMission}
              onChange={(e) => setEditMission(e.target.value)}
              rows={3}
              placeholder="Es: Costruiamo agenti AI autonomi che risolvono problemi complessi in domini specifici..."
              className="w-full bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-3 text-sm text-white placeholder-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] resize-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--fg-invisible)] font-semibold uppercase tracking-wide mb-2">
              Priorita strategiche (guidano i piani dello scheduler)
            </label>
            <div className="space-y-2 mb-2">
              {editPriorities.map((p, i) => (
                <div key={i} className="flex items-center gap-2 bg-[var(--bg-overlay)]/50 rounded-lg px-3 py-2">
                  <span className="text-xs text-[var(--fg-invisible)] font-mono w-4">{i + 1}.</span>
                  <span className="text-sm text-[var(--fg-secondary)] flex-1">{p}</span>
                  <button
                    onClick={() => removePriority(i)}
                    className="cursor-pointer text-[var(--fg-invisible)] hover:text-red-400 transition-colors"
                    aria-label={`Rimuovi priorita ${i + 1}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPriority()}
                placeholder="Aggiungi priorita..."
                className="flex-1 bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)]"
                aria-label="Nuova priorita strategica"
              />
              <button
                onClick={addPriority}
                disabled={!newPriority.trim()}
                className="cursor-pointer px-3 py-2 bg-[var(--bg-hover)] hover:bg-[var(--border-dark)] disabled:opacity-40 rounded-lg text-[var(--fg-secondary)] transition-colors"
                aria-label="Aggiungi"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {saveError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {saveError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-[#FF6B35] hover:bg-[#FF6B35]/90 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Salvataggio..." : "Salva"}
          </button>
          {saveOk && (
            <span className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              Salvato
            </span>
          )}
          {isDirty && !saving && (
            <button
              onClick={fetchData}
              className="cursor-pointer text-xs text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)] transition-colors"
            >
              Annulla modifiche
            </button>
          )}
        </div>
      </div>

      {/* ═══ Department Visions Grid ═══ */}
      <div className="bg-[var(--bg-raised)] rounded-xl border border-[var(--border-dark-subtle)] p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[var(--fg-secondary)]" />
            Visioni Dipartimentali
            <span className="text-xs text-[var(--fg-invisible)] font-normal ml-1">
              — allineate alla vision Poimandres
            </span>
          </h2>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-[var(--bg-overlay)]/60 rounded-lg p-0.5">
            {([
              { key: "all" as const, label: "Tutti", count: departments.length },
              { key: "revenue" as const, label: "Revenue", count: revenueCount },
              { key: "staff" as const, label: "Staff", count: staffCount },
            ]).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setDeptFilter(key)}
                className={`cursor-pointer px-3 py-2 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                  deptFilter === key
                    ? "bg-[var(--bg-hover)] text-white"
                    : "text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)]"
                }`}
              >
                {label}
                <span className={`text-xs ${deptFilter === key ? "text-[var(--fg-secondary)]" : "text-[var(--fg-invisible)]"}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Contribution note */}
        {vision && (
          <div className="rounded-lg bg-[#FF6B35]/5 border border-[#FF6B35]/15 px-4 py-3 flex items-start gap-3">
            <Telescope className="w-4 h-4 text-[#FF6B35] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">
                <span className="text-[#FF6B35] font-semibold">Vision Poimandres:</span>{" "}
                {vision.vision}
              </p>
              <p className="text-xs text-[var(--fg-invisible)] mt-1">
                Ogni dipartimento contribuisce a questa visione con le proprie priorita.
              </p>
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredDepts.map((dept, i) => (
            <DeptCard key={dept.id} dept={dept} index={i} />
          ))}
        </div>

        {filteredDepts.length === 0 && (
          <p className="text-sm text-[var(--fg-invisible)] text-center py-8">Nessun dipartimento trovato.</p>
        )}
      </div>

      {/* ═══ Scheduler Status ═══ */}
      <div className="bg-[var(--bg-raised)] rounded-xl border border-[var(--border-dark-subtle)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--fg-secondary)]" />
            Scheduler Status
          </h2>
        </div>

        {!latestPlan ? (
          <p className="text-sm text-[var(--fg-invisible)]">Nessun piano generato ancora.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-[var(--fg-secondary)] font-medium">
                Piano #{latestPlan.plan_number}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${PLAN_STATUS_STYLES[latestPlan.status] ?? ""}`}>
                {PLAN_STATUS_LABELS[latestPlan.status] ?? latestPlan.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[var(--fg-invisible)] block">Generato il</span>
                <span className="text-[var(--fg-secondary)]">{formatDateTime(latestPlan.created_at)}</span>
              </div>
              {latestPlan.approved_at && (
                <div>
                  <span className="text-[var(--fg-invisible)] block">Approvato il</span>
                  <span className="text-green-400">{formatDateTime(latestPlan.approved_at)}</span>
                </div>
              )}
            </div>

            {(latestPlan.plan_content?.tasks ?? []).length > 0 && (
              <div className="rounded-lg bg-[var(--bg-overlay)]/50 border border-[var(--border-dark-subtle)] px-3 py-3">
                <p className="text-xs text-[var(--fg-invisible)] font-semibold uppercase tracking-wide mb-2">
                  Task proposti ({latestPlan.plan_content.tasks!.length})
                </p>
                <ul className="space-y-1">
                  {latestPlan.plan_content.tasks!.slice(0, 5).map((t, i) => (
                    <li key={i} className="text-xs text-[var(--fg-secondary)]">
                      <span className="text-[var(--fg-invisible)]">[{t.dept}]</span> {t.title}
                    </li>
                  ))}
                  {latestPlan.plan_content.tasks!.length > 5 && (
                    <li className="text-xs text-[var(--fg-invisible)]">+{latestPlan.plan_content.tasks!.length - 5} altri...</li>
                  )}
                </ul>
              </div>
            )}

            {(latestPlan.recommendations ?? []).length > 0 && (
              <div>
                <p className="text-xs text-[var(--fg-invisible)] font-semibold uppercase tracking-wide mb-2">
                  Raccomandazioni per il prossimo piano
                </p>
                <ul className="space-y-1">
                  {(latestPlan.recommendations ?? []).map((r, i) => (
                    <li key={i} className="text-xs text-[var(--fg-secondary)] flex items-start gap-2">
                      <span className="text-[var(--fg-invisible)] flex-shrink-0">{i + 1}.</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-[var(--border-dark-subtle)]">
          <p className="text-xs text-[var(--fg-invisible)]">
            Lo scheduler verifica il board ogni 5 minuti (via AVVIA_SCHEDULER.ps1).
            Quando il board e vuoto, genera un piano allineato alla vision e lo invia su Telegram per approvazione.
          </p>
        </div>
      </div>
    </div>
  );
}
