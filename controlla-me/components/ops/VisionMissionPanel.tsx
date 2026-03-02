"use client";

import { useState, useEffect, useCallback } from "react";
import { Target, Save, Plus, X, Loader2, RefreshCw, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";

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

const PLAN_STATUS_STYLES: Record<string, string> = {
  pending:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  approved:  "bg-green-500/15 text-green-400 border-green-500/30",
  modified:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cancelled: "bg-zinc-700/60 text-zinc-400 border-zinc-600",
};

const PLAN_STATUS_LABELS: Record<string, string> = {
  pending:   "In attesa",
  approved:  "Approvato",
  modified:  "Modificato",
  cancelled: "Annullato",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function VisionMissionPanel() {
  const [vision, setVision] = useState<VisionData | null>(null);
  const [latestPlan, setLatestPlan] = useState<SchedulerPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  // Edit state
  const [editVision, setEditVision] = useState("");
  const [editMission, setEditMission] = useState("");
  const [editPriorities, setEditPriorities] = useState<string[]>([]);
  const [newPriority, setNewPriority] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/vision", { headers: getConsoleAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        const v: VisionData | null = json.vision;
        setVision(v);
        setLatestPlan(json.latestPlan ?? null);
        if (v) {
          setEditVision(v.vision);
          setEditMission(v.mission);
          setEditPriorities(v.priorities ?? []);
        }
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

  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vision & Mission editor */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-[#FF6B35]" />
            Vision & Mission
          </h2>
          {vision && (
            <span className="text-[10px] text-zinc-600 font-mono">
              Aggiornato {formatDateTime(vision.updated_at)} da {vision.updated_by}
            </span>
          )}
        </div>

        {!vision && (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-xs text-yellow-400 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Vision/Mission non ancora configurata. Compila il form e salva.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] text-zinc-500 font-semibold uppercase tracking-wide mb-1.5">
              Vision — dove vogliamo essere tra 3-5 anni
            </label>
            <textarea
              value={editVision}
              onChange={(e) => setEditVision(e.target.value)}
              rows={3}
              placeholder="Es: Diventare la piattaforma leader in Europa per l'analisi legale AI accessibile alle PMI..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 font-semibold uppercase tracking-wide mb-1.5">
              Mission — cosa facciamo oggi e perché
            </label>
            <textarea
              value={editMission}
              onChange={(e) => setEditMission(e.target.value)}
              rows={3}
              placeholder="Es: Rendere l'analisi legale accessibile alle PMI italiane attraverso agenti AI specializzati..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 font-semibold uppercase tracking-wide mb-1.5">
              Priorità strategiche (guidano i piani dello scheduler)
            </label>
            <div className="space-y-1.5 mb-2">
              {editPriorities.map((p, i) => (
                <div key={i} className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-zinc-500 font-mono w-4">{i + 1}.</span>
                  <span className="text-sm text-zinc-300 flex-1">{p}</span>
                  <button
                    onClick={() => removePriority(i)}
                    className="cursor-pointer text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
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
                placeholder="Aggiungi priorità..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={addPriority}
                disabled={!newPriority.trim()}
                className="cursor-pointer px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded-lg text-zinc-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {saveError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
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
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Salvato
            </span>
          )}
          {isDirty && !saving && (
            <button
              onClick={fetchData}
              className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Annulla modifiche
            </button>
          )}
        </div>
      </div>

      {/* Scheduler Status */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            Scheduler Status
          </h2>
          <button
            onClick={fetchData}
            disabled={loading}
            className="cursor-pointer p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {!latestPlan ? (
          <p className="text-sm text-zinc-500">Nessun piano generato ancora.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-zinc-300 font-medium">
                Piano #{latestPlan.plan_number}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${PLAN_STATUS_STYLES[latestPlan.status] ?? ""}`}>
                {PLAN_STATUS_LABELS[latestPlan.status] ?? latestPlan.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-zinc-600 block">Generato il</span>
                <span className="text-zinc-300">{formatDateTime(latestPlan.created_at)}</span>
              </div>
              {latestPlan.approved_at && (
                <div>
                  <span className="text-zinc-600 block">Approvato il</span>
                  <span className="text-green-400">{formatDateTime(latestPlan.approved_at)}</span>
                </div>
              )}
            </div>

            {(latestPlan.plan_content?.tasks ?? []).length > 0 && (
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2.5">
                <p className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wide mb-2">
                  Task proposti ({latestPlan.plan_content.tasks!.length})
                </p>
                <ul className="space-y-1">
                  {latestPlan.plan_content.tasks!.slice(0, 5).map((t, i) => (
                    <li key={i} className="text-xs text-zinc-400">
                      <span className="text-zinc-600">[{t.dept}]</span> {t.title}
                    </li>
                  ))}
                  {latestPlan.plan_content.tasks!.length > 5 && (
                    <li className="text-xs text-zinc-600">+{latestPlan.plan_content.tasks!.length - 5} altri...</li>
                  )}
                </ul>
              </div>
            )}

            {(latestPlan.recommendations ?? []).length > 0 && (
              <div>
                <p className="text-[11px] text-zinc-600 font-semibold uppercase tracking-wide mb-1.5">
                  Raccomandazioni per il prossimo piano
                </p>
                <ul className="space-y-1">
                  {(latestPlan.recommendations ?? []).map((r, i) => (
                    <li key={i} className="text-xs text-zinc-400 flex items-start gap-1.5">
                      <span className="text-zinc-600 flex-shrink-0">{i + 1}.</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800/60">
          <p className="text-[11px] text-zinc-600">
            Lo scheduler verifica il board ogni 5 minuti (via AVVIA_SCHEDULER.ps1).
            Quando il board è vuoto, genera un piano allineato alla vision e lo invia su Telegram per approvazione.
          </p>
        </div>
      </div>
    </div>
  );
}
