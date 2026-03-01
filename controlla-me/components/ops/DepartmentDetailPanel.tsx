"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";
import {
  ArrowLeft,
  Loader2,
  Plus,
  ChevronRight,
  X,
  FileText,
  Bot,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
} from "lucide-react";
import type { Department, Task, TaskPriority } from "@/lib/company/types";
import type { DepartmentMeta } from "@/lib/company/departments";
import type { DepartmentAnalysis } from "@/lib/company/department-analyses";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeptPanelData {
  meta: DepartmentMeta;
  departmentMd: string | null;
  activeTasks: Task[];
  doneTasks: Task[];
  analysis: DepartmentAnalysis | null;
}

type Section = "overview" | "tasks" | "done" | "create";

interface DepartmentDetailPanelProps {
  department: Department;
  onBack: () => void;
  onSelectTask: (task: Task) => void;
}

// ─── Costanti UI ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open:        "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  review:      "bg-purple-500/20 text-purple-400",
  done:        "bg-green-500/20 text-green-400",
  blocked:     "bg-red-500/20 text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  open:        "aperto",
  in_progress: "in corso",
  review:      "review",
  done:        "completato",
  blocked:     "bloccato",
};

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  review:      1,
  blocked:     2,
  open:        3,
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-yellow-500",
  low:      "bg-zinc-500",
};

const ANALYSIS_BADGE: Record<string, { bg: string; text: string; label: string; icon: typeof CheckCircle2 }> = {
  "on-track": { bg: "bg-green-500/15",  text: "text-green-400",  label: "On track",  icon: CheckCircle2 },
  "at-risk":  { bg: "bg-yellow-500/15", text: "text-yellow-400", label: "A rischio", icon: AlertCircle },
  "idle":     { bg: "bg-zinc-700",      text: "text-zinc-400",   label: "Idle",      icon: Clock },
  "blocked":  { bg: "bg-red-500/15",    text: "text-red-400",    label: "Bloccato",  icon: Ban },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function computeFallbackStatus(
  open: number,
  inProgress: number,
  blocked: number
): DepartmentAnalysis["statusLabel"] {
  if (blocked > 0) return "blocked";
  if (inProgress > 0 || open > 0) return "on-track";
  return "idle";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/60 transition-colors text-left group rounded-lg"
    >
      <span
        className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] ?? "bg-zinc-500"}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate group-hover:text-white transition-colors">
          {task.title}
        </p>
        {task.assignedTo && (
          <p className="text-xs text-zinc-500 mt-0.5">→ {task.assignedTo}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[task.status] ?? "bg-zinc-800 text-zinc-400"}`}
        >
          {STATUS_LABEL[task.status] ?? task.status}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DepartmentDetailPanel({
  department,
  onBack,
  onSelectTask,
}: DepartmentDetailPanelProps) {
  const [data, setData] = useState<DeptPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [drawerContent, setDrawerContent] = useState<{ title: string; content: string } | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Create form
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPriority, setCreatePriority] = useState<TaskPriority>("medium");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/company/departments/${department}`, {
        headers: getConsoleAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("DepartmentDetailPanel fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    fetchData();
    setActiveSection("overview");
    setDrawerContent(null);
    setCreateTitle("");
    setCreateDesc("");
    setCreatePriority("medium");
    setCreateError(null);
    setCreateSuccess(false);
  }, [department, fetchData]);

  const openFile = async (filePath: string, label: string) => {
    setDrawerLoading(true);
    try {
      const res = await fetch(`/api/company/files?path=${encodeURIComponent(filePath)}`, {
        headers: getConsoleAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setDrawerContent({ title: label, content: json.content });
      }
    } catch {
      // silente
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) return;
    setCreateLoading(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/company/tasks", {
        method: "POST",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({
          title: createTitle.trim(),
          description: createDesc.trim() || undefined,
          department,
          priority: createPriority,
          createdBy: "ops-panel",
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Errore creazione task");
      }

      setCreateTitle("");
      setCreateDesc("");
      setCreatePriority("medium");
      setCreateSuccess(true);
      setTimeout(() => setCreateSuccess(false), 2500);
      await fetchData();
      setActiveSection("tasks");
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Caricamento dipartimento...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-zinc-500 text-sm">Impossibile caricare i dati del dipartimento.</p>
        <button onClick={onBack} className="text-[#FF6B35] text-sm hover:underline">
          ← Torna al Board
        </button>
      </div>
    );
  }

  const { meta, analysis, activeTasks, doneTasks } = data;

  const inProgressTasks = activeTasks.filter((t) => t.status === "in_progress");
  const sortedActiveTasks = [...activeTasks].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );

  const fallbackStatus = computeFallbackStatus(
    activeTasks.filter((t) => t.status === "open").length,
    inProgressTasks.length,
    activeTasks.filter((t) => t.status === "blocked").length
  );

  const statusLabel = analysis?.statusLabel ?? fallbackStatus;
  const badge = ANALYSIS_BADGE[statusLabel] ?? ANALYSIS_BADGE["idle"];
  const BadgeIcon = badge.icon;

  const tabs: { key: Section; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "tasks",    label: "Task",       count: activeTasks.length },
    { key: "done",     label: "Completati", count: doneTasks.length },
    { key: "create",   label: "+ Nuovo" },
  ];

  return (
    <>
      <motion.div
        key={department}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-zinc-800">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Torna al Board
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl leading-none">{meta.emoji}</span>
              <div>
                <h2 className="text-lg font-semibold text-white">{meta.label}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {activeTasks.length} attivi · {doneTasks.length} completati
                </p>
              </div>
            </div>
            {/* Status badge */}
            <span
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${badge.bg} ${badge.text}`}
            >
              <BadgeIcon className="w-3.5 h-3.5" />
              {badge.label}
            </span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors relative flex items-center gap-1.5 ${
                activeSection === tab.key
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    activeSection === tab.key
                      ? "bg-[#FF6B35]/20 text-[#FF6B35]"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
              {activeSection === tab.key && (
                <motion.div
                  layoutId="dept-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6B35]"
                />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {activeSection === "overview" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
                className="space-y-6"
              >
                {/* Missione */}
                <div className="border-l-2 border-[#FF6B35]/60 pl-4 py-1">
                  <p className="text-xs text-zinc-400 uppercase tracking-widest mb-1 font-medium">
                    Missione
                  </p>
                  <p className="text-sm text-zinc-300 leading-relaxed">{meta.mission}</p>
                </div>

                {/* KPI */}
                {meta.kpis.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2 font-medium">KPI</p>
                    <div className="flex flex-wrap gap-2">
                      {meta.kpis.map((kpi, i) => (
                        <span
                          key={i}
                          className="text-xs bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full"
                        >
                          {kpi}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Analisi performance */}
                <div className="bg-zinc-800/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-400 uppercase tracking-widest font-medium">
                      Analisi performance
                    </p>
                    {analysis ? (
                      <span className="text-[10px] text-zinc-600">
                        {fmtDate(analysis.date)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600">Nessuna analisi — live</span>
                    )}
                  </div>

                  {analysis ? (
                    <>
                      <p className="text-sm text-zinc-300 leading-relaxed">{analysis.summary}</p>
                      {analysis.keyPoints.length > 0 && (
                        <ul className="space-y-1">
                          {analysis.keyPoints.map((pt, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                              <span className="text-[#FF6B35] mt-0.5 flex-shrink-0">·</span>
                              {pt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">
                      Analisi AI non ancora generata. Esegui{" "}
                      <code className="bg-zinc-700 px-1 rounded text-zinc-300">
                        npx tsx scripts/daily-standup.ts
                      </code>{" "}
                      dal terminale esterno per generarla.
                    </p>
                  )}

                  {/* Metriche live */}
                  <div className="flex gap-4 pt-1 border-t border-zinc-700/50">
                    <div className="text-center">
                      <p className="text-lg font-bold text-yellow-400">
                        {analysis?.inProgressCount ?? inProgressTasks.length}
                      </p>
                      <p className="text-[10px] text-zinc-500">in corso</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-400">
                        {analysis?.openCount ??
                          activeTasks.filter((t) => t.status === "open").length}
                      </p>
                      <p className="text-[10px] text-zinc-500">aperti</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-red-400">
                        {analysis?.blockedCount ??
                          activeTasks.filter((t) => t.status === "blocked").length}
                      </p>
                      <p className="text-[10px] text-zinc-500">bloccati</p>
                    </div>
                  </div>
                </div>

                {/* Agenti */}
                {meta.agents.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2 font-medium flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" />
                      Agenti
                    </p>
                    <div className="space-y-1">
                      {meta.agents.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => openFile(agent.filePath, agent.label)}
                          disabled={drawerLoading}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left group"
                        >
                          <FileText className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0" />
                          <span className="text-sm text-zinc-300 flex-1 group-hover:text-white transition-colors">
                            {agent.label}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Runbook */}
                {meta.runbooks.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2 font-medium flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      Runbook
                    </p>
                    <div className="space-y-1">
                      {meta.runbooks.map((rb) => (
                        <button
                          key={rb.id}
                          onClick={() => openFile(rb.filePath, rb.label)}
                          disabled={drawerLoading}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left group"
                        >
                          <FileText className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0" />
                          <span className="text-sm text-zinc-300 flex-1 group-hover:text-white transition-colors">
                            {rb.label}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeSection === "tasks" && (
              <motion.div
                key="tasks"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                {sortedActiveTasks.length === 0 ? (
                  <div className="text-center py-12 text-zinc-600">
                    <p className="text-sm">Nessun task attivo.</p>
                    <button
                      onClick={() => setActiveSection("create")}
                      className="mt-3 text-xs text-[#FF6B35] hover:underline"
                    >
                      + Crea il primo task
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sortedActiveTasks.map((task) => (
                      <TaskRow key={task.id} task={task} onClick={() => onSelectTask(task)} />
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeSection === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                {doneTasks.length === 0 ? (
                  <p className="text-sm text-zinc-600 text-center py-12">
                    Nessun task completato.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {doneTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onSelectTask(task)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/60 transition-colors text-left group rounded-lg"
                      >
                        <CheckCircle2 className="w-4 h-4 text-green-500/60 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-400 truncate group-hover:text-zinc-200 transition-colors line-through decoration-zinc-600">
                            {task.title}
                          </p>
                          {task.resultSummary && (
                            <p className="text-xs text-zinc-600 mt-0.5 truncate">
                              {task.resultSummary.slice(0, 80)}
                              {task.resultSummary.length > 80 ? "…" : ""}
                            </p>
                          )}
                          <p className="text-[10px] text-zinc-700 mt-0.5">
                            {fmtDate(task.completedAt)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeSection === "create" && (
              <motion.div
                key="create"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                      Titolo <span className="text-[#FF6B35]">*</span>
                    </label>
                    <input
                      type="text"
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      required
                      placeholder="Cosa deve fare questo task?"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF6B35]/50 focus:ring-1 focus:ring-[#FF6B35]/20 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                      Descrizione
                    </label>
                    <textarea
                      value={createDesc}
                      onChange={(e) => setCreateDesc(e.target.value)}
                      placeholder="Cosa fare e perché. Appare nel board per dare contesto a chi legge."
                      rows={3}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF6B35]/50 focus:ring-1 focus:ring-[#FF6B35]/20 transition-colors resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                      Priorità
                    </label>
                    <div className="flex gap-2">
                      {(["critical", "high", "medium", "low"] as TaskPriority[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCreatePriority(p)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                            createPriority === p
                              ? p === "critical"
                                ? "bg-red-500/20 border-red-500/50 text-red-400"
                                : p === "high"
                                ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                                : p === "medium"
                                ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
                                : "bg-zinc-700 border-zinc-600 text-zinc-300"
                              : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          {p === "critical" ? "🔴" : p === "high" ? "🟠" : p === "medium" ? "🟡" : "⚪"}{" "}
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {createError && (
                    <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                      {createError}
                    </p>
                  )}

                  {createSuccess && (
                    <p className="text-xs text-green-400 bg-green-500/10 rounded-lg px-3 py-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Task creato con successo.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={createLoading || !createTitle.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#FF6B35] hover:bg-[#e55a25] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
                  >
                    {createLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Crea Task
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Drawer: file viewer */}
      <AnimatePresence>
        {drawerContent && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerContent(null)}
              className="fixed inset-0 bg-black/40 z-40"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-zinc-950 border-l border-zinc-800 overflow-y-auto z-50 flex flex-col"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0 sticky top-0 bg-zinc-950">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-[#FF6B35]" />
                  <h3 className="text-sm font-semibold text-white">{drawerContent.title}</h3>
                </div>
                <button
                  onClick={() => setDrawerContent(null)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Drawer content */}
              <div className="flex-1 px-6 py-5 overflow-y-auto">
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {drawerContent.content}
                </pre>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
