"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  TrendingUp,
  ClipboardList,
  FlaskConical,
  BarChart2,
  Cpu,
} from "lucide-react";
import { DEPT_ICONS } from "@/lib/company/dept-icons";
import type { Department, Task, TaskPriority } from "@/lib/company/types";
import type { DepartmentMeta } from "@/lib/company/departments";
import type { DepartmentAnalysis } from "@/lib/company/department-analyses";
import { TradingDashboard } from "@/components/ops/TradingDashboard";
import { TradingSlopePanel } from "@/components/ops/TradingSlopePanel";
import { QALegalPanel } from "@/components/ops/QALegalPanel";
import { QASuitePanel } from "@/components/ops/QASuitePanel";
import { QAReportPanel } from "@/components/ops/QAReportPanel";
import { LegalQATestPanel } from "@/components/ops/LegalQATestPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeptPanelData {
  meta: DepartmentMeta;
  departmentMd: string | null;
  activeTasks: Task[];
  doneTasks: Task[];
  analysis: DepartmentAnalysis | null;
}

type Section = "overview" | "tasks" | "done" | "create" | "live" | "slope" | "qa" | "suite" | "qareport" | "qatest";

interface DepartmentDetailPanelProps {
  department: Department;
  onBack: () => void;
  onSelectTask: (task: Task) => void;
}

// ─── Costanti UI ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open:        "bg-[var(--info)]/20 text-[var(--info)]",
  in_progress: "bg-[var(--identity-gold)]/20 text-[var(--identity-gold)]",
  review:      "bg-[var(--identity-violet)]/20 text-[var(--identity-violet)]",
  done:        "bg-[var(--success)]/20 text-[var(--success)]",
  blocked:     "bg-[var(--error)]/20 text-[var(--error)]",
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
  critical: "bg-[var(--error)]",
  high:     "bg-[var(--accent)]",
  medium:   "bg-[var(--identity-gold)]",
  low:      "bg-[var(--fg-invisible)]",
};

const ANALYSIS_BADGE: Record<string, { bg: string; text: string; label: string; icon: typeof CheckCircle2 }> = {
  "on-track": { bg: "bg-[var(--success)]/15",     text: "text-[var(--success)]",     label: "On track",  icon: CheckCircle2 },
  "at-risk":  { bg: "bg-[var(--identity-gold)]/15",   text: "text-[var(--identity-gold)]",  label: "A rischio", icon: AlertCircle },
  "idle":     { bg: "bg-[var(--bg-overlay)]",     text: "text-[var(--fg-secondary)]", label: "Idle",      icon: Clock },
  "blocked":  { bg: "bg-[var(--error)]/15",      text: "text-[var(--error)]",    label: "Bloccato",  icon: Ban },
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
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-overlay)]/60 transition-colors text-left group rounded-lg"
    >
      <span
        className={`mt-2 w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] ?? "bg-[var(--fg-invisible)]"}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--fg-primary)] truncate group-hover:text-[var(--fg-primary)] transition-colors">
          {task.title}
        </p>
        {task.assignedTo && (
          <p className="text-xs text-[var(--fg-invisible)] mt-0.5">→ {task.assignedTo}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status] ?? "bg-[var(--bg-raised)] text-[var(--fg-secondary)]"}`}
        >
          {STATUS_LABEL[task.status] ?? task.status}
        </span>
        <ChevronRight className="w-4 h-4 text-[var(--border-dark)] group-hover:text-[var(--fg-secondary)] transition-colors" />
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
      <div className="bg-[var(--bg-raised)] rounded-xl border border-[var(--border-dark-subtle)] flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-[var(--fg-invisible)]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Caricamento dipartimento...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-[var(--bg-raised)] rounded-xl border border-[var(--border-dark-subtle)] flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-[var(--fg-invisible)] text-sm">Impossibile caricare i dati del dipartimento.</p>
        <button onClick={onBack} className="text-[var(--accent)] text-sm hover:underline">
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

  const tabs: { key: Section; label: React.ReactNode; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "tasks",    label: "Task",       count: activeTasks.length },
    { key: "done",     label: "Completati", count: doneTasks.length },
    { key: "create",   label: "+ Nuovo" },
    ...(department === "trading" ? [{ key: "live" as Section, label: <span className="flex items-center gap-1"><TrendingUp className="w-4 h-4" />Live</span> }] : []),
    ...(department === "trading" ? [{ key: "slope" as Section, label: <span className="flex items-center gap-1"><BarChart2 className="w-4 h-4" />Slope</span> }] : []),
    ...(department === "ufficio-legale" ? [{ key: "qa" as Section, label: <span className="flex items-center gap-1"><ClipboardList className="w-4 h-4" />QA Report</span> }] : []),
    ...(department === "ufficio-legale" ? [{ key: "qatest" as Section, label: <span className="flex items-center gap-1"><Cpu className="w-4 h-4" />Q&amp;A Test</span> }] : []),
    ...(department === "quality-assurance" ? [{ key: "suite" as Section, label: <span className="flex items-center gap-1"><FlaskConical className="w-4 h-4" />Suite</span> }] : []),
    ...(department === "quality-assurance" ? [{ key: "qareport" as Section, label: <span className="flex items-center gap-1"><BarChart2 className="w-4 h-4" />QA Report</span> }] : []),
  ];

  return (
    <>
      <motion.div
        key={department}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="bg-[var(--bg-raised)] rounded-xl border border-[var(--border-dark-subtle)] overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[var(--border-dark-subtle)]">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs text-[var(--fg-invisible)] hover:text-[var(--fg-primary)] transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Torna al Board
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {(() => {
                const DeptIcon = DEPT_ICONS[department];
                return DeptIcon ? (
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex-shrink-0">
                    <DeptIcon className="w-5 h-5 text-[var(--accent)]" />
                  </span>
                ) : null;
              })()}
              <div>
                <h2 className="text-lg font-semibold text-[var(--fg-primary)]">{meta.label}</h2>
                <p className="text-xs text-[var(--fg-invisible)] mt-0.5">
                  {activeTasks.length} attivi · {doneTasks.length} completati
                </p>
              </div>
            </div>
            {/* Status badge */}
            <span
              className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full font-medium ${badge.bg} ${badge.text}`}
            >
              <BadgeIcon className="w-4 h-4" />
              {badge.label}
            </span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[var(--border-dark-subtle)] px-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
                activeSection === tab.key
                  ? "text-[var(--fg-primary)]"
                  : "text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)]"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    activeSection === tab.key
                      ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                      : "bg-[var(--bg-overlay)] text-[var(--fg-secondary)]"
                  }`}
                >
                  {tab.count}
                </span>
              )}
              {activeSection === tab.key && (
                <motion.div
                  layoutId="dept-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]"
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
                {/* Vision */}
                {meta.vision && (
                  <div className="border-l-2 border-[var(--accent)]/60 pl-4 py-1">
                    <p className="text-xs text-[var(--fg-secondary)] uppercase tracking-widest mb-1 font-medium">
                      Vision
                    </p>
                    <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">{meta.vision}</p>
                  </div>
                )}

                {/* Missione */}
                <div className={`border-l-2 ${meta.vision ? "border-[var(--border-dark)]" : "border-[var(--accent)]/60"} pl-4 py-1`}>
                  <p className="text-xs text-[var(--fg-secondary)] uppercase tracking-widest mb-1 font-medium">
                    Missione
                  </p>
                  <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">{meta.mission}</p>
                </div>

                {/* Priorities */}
                {meta.priorities && meta.priorities.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--fg-invisible)] uppercase tracking-widest mb-2 font-medium">Priorita</p>
                    <div className="space-y-2">
                      {meta.priorities.map((p, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold flex-shrink-0 ${
                            i === 0 ? "bg-[var(--accent)]/20 text-[var(--accent)]" :
                            i === 1 ? "bg-[var(--bg-overlay)] text-[var(--fg-secondary)]" :
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

                {/* KPI */}
                {meta.kpis.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--fg-invisible)] uppercase tracking-widest mb-2 font-medium">KPI</p>
                    <div className="flex flex-wrap gap-2">
                      {meta.kpis.map((kpi, i) => (
                        <span
                          key={i}
                          className="text-xs bg-[var(--bg-overlay)] text-[var(--fg-secondary)] px-3 py-1 rounded-full"
                        >
                          {kpi}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Analisi performance */}
                <div className="bg-[var(--bg-overlay)]/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--fg-secondary)] uppercase tracking-widest font-medium">
                      Analisi performance
                    </p>
                    {analysis ? (
                      <span className="text-xs text-[var(--fg-invisible)]">
                        {fmtDate(analysis.date)}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--fg-invisible)]">Nessuna analisi — live</span>
                    )}
                  </div>

                  {analysis ? (
                    <>
                      <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">{analysis.summary}</p>
                      {analysis.keyPoints.length > 0 && (
                        <ul className="space-y-1">
                          {analysis.keyPoints.map((pt, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[var(--fg-secondary)]">
                              <span className="text-[var(--accent)] mt-0.5 flex-shrink-0">·</span>
                              {pt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-[var(--fg-invisible)] italic">
                      Analisi AI non ancora generata. Esegui{" "}
                      <code className="bg-[var(--bg-overlay)] px-1 rounded text-[var(--fg-secondary)]">
                        npx tsx scripts/daily-standup.ts
                      </code>{" "}
                      dal terminale esterno per generarla.
                    </p>
                  )}

                  {/* Metriche live */}
                  <div className="flex gap-4 pt-1 border-t border-[var(--border-dark-subtle)]">
                    <div className="text-center">
                      <p className="text-lg font-bold text-[var(--identity-gold)]">
                        {analysis?.inProgressCount ?? inProgressTasks.length}
                      </p>
                      <p className="text-xs text-[var(--fg-invisible)]">in corso</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-[var(--info)]">
                        {analysis?.openCount ??
                          activeTasks.filter((t) => t.status === "open").length}
                      </p>
                      <p className="text-xs text-[var(--fg-invisible)]">aperti</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-[var(--error)]">
                        {analysis?.blockedCount ??
                          activeTasks.filter((t) => t.status === "blocked").length}
                      </p>
                      <p className="text-xs text-[var(--fg-invisible)]">bloccati</p>
                    </div>
                  </div>
                </div>

                {/* Agenti */}
                {meta.agents.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--fg-invisible)] uppercase tracking-widest mb-2 font-medium flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      Agenti
                    </p>
                    <div className="space-y-1">
                      {meta.agents.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => openFile(agent.filePath, agent.label)}
                          disabled={drawerLoading}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[var(--bg-overlay)] transition-colors text-left group"
                        >
                          <FileText className="w-4 h-4 text-[var(--fg-invisible)] group-hover:text-[var(--fg-secondary)] flex-shrink-0" />
                          <span className="text-sm text-[var(--fg-secondary)] flex-1 group-hover:text-[var(--fg-primary)] transition-colors">
                            {agent.label}
                          </span>
                          <ChevronRight className="w-4 h-4 text-[var(--fg-invisible)] group-hover:text-[var(--fg-invisible)]" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Runbook */}
                {meta.runbooks.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--fg-invisible)] uppercase tracking-widest mb-2 font-medium flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Runbook
                    </p>
                    <div className="space-y-1">
                      {meta.runbooks.map((rb) => (
                        <button
                          key={rb.id}
                          onClick={() => openFile(rb.filePath, rb.label)}
                          disabled={drawerLoading}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[var(--bg-overlay)] transition-colors text-left group"
                        >
                          <FileText className="w-4 h-4 text-[var(--fg-invisible)] group-hover:text-[var(--fg-secondary)] flex-shrink-0" />
                          <span className="text-sm text-[var(--fg-secondary)] flex-1 group-hover:text-[var(--fg-primary)] transition-colors">
                            {rb.label}
                          </span>
                          <ChevronRight className="w-4 h-4 text-[var(--fg-invisible)] group-hover:text-[var(--fg-invisible)]" />
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
                  <div className="text-center py-12 text-[var(--fg-invisible)]">
                    <p className="text-sm">Nessun task attivo.</p>
                    <button
                      onClick={() => setActiveSection("create")}
                      className="mt-3 text-xs text-[var(--accent)] hover:underline"
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
                  <p className="text-sm text-[var(--fg-invisible)] text-center py-12">
                    Nessun task completato.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {doneTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onSelectTask(task)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-overlay)]/60 transition-colors text-left group rounded-lg"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[var(--success)]/60 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--fg-secondary)] truncate group-hover:text-[var(--fg-primary)] transition-colors line-through decoration-[var(--fg-invisible)]">
                            {task.title}
                          </p>
                          {task.resultSummary && (
                            <p className="text-xs text-[var(--fg-invisible)] mt-0.5 truncate">
                              {task.resultSummary.slice(0, 80)}
                              {task.resultSummary.length > 80 ? "…" : ""}
                            </p>
                          )}
                          <p className="text-xs text-[var(--fg-invisible)] mt-0.5">
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
                    <label className="block text-xs text-[var(--fg-secondary)] mb-2 font-medium">
                      Titolo <span className="text-[var(--accent)]">*</span>
                    </label>
                    <input
                      type="text"
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      required
                      placeholder="Cosa deve fare questo task?"
                      className="w-full bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-3 text-sm text-[var(--fg-primary)] placeholder-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--fg-secondary)] mb-2 font-medium">
                      Descrizione
                    </label>
                    <textarea
                      value={createDesc}
                      onChange={(e) => setCreateDesc(e.target.value)}
                      placeholder="Cosa fare e perché. Appare nel board per dare contesto a chi legge."
                      rows={3}
                      className="w-full bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-3 text-sm text-[var(--fg-primary)] placeholder-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] transition-colors resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--fg-secondary)] mb-2 font-medium">
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
                                ? "bg-[var(--error)]/20 border-[var(--error)]/50 text-[var(--error)]"
                                : p === "high"
                                ? "bg-[var(--accent)]/20 border-[var(--accent)]/50 text-[var(--accent)]"
                                : p === "medium"
                                ? "bg-[var(--identity-gold)]/20 border-[var(--identity-gold)]/50 text-[var(--identity-gold)]"
                                : "bg-[var(--bg-overlay)] border-[var(--border-dark)] text-[var(--fg-secondary)]"
                              : "bg-[var(--bg-overlay)]/50 border-[var(--border-dark-subtle)] text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)]"
                          }`}
                        >
                          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                            p === "critical" ? "bg-[var(--error)]" :
                            p === "high" ? "bg-[var(--accent)]" :
                            p === "medium" ? "bg-[var(--identity-gold)]" :
                            "bg-[var(--fg-secondary)]"
                          }`} />
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {createError && (
                    <p className="text-xs text-[var(--error)] bg-[var(--error)]/10 rounded-lg px-3 py-2">
                      {createError}
                    </p>
                  )}

                  {createSuccess && (
                    <p className="text-xs text-[var(--success)] bg-[var(--success)]/10 rounded-lg px-3 py-2 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Task creato con successo.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={createLoading || !createTitle.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--accent)] hover:bg-[var(--accent)]/80 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--fg-primary)] font-medium rounded-lg text-sm transition-colors"
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
            {activeSection === "live" && department === "trading" && (
              <motion.div
                key="live"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                <TradingDashboard />
              </motion.div>
            )}
            {activeSection === "slope" && department === "trading" && (
              <motion.div
                key="slope"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                <TradingSlopePanel />
              </motion.div>
            )}
            {activeSection === "qa" && department === "ufficio-legale" && (
              <motion.div
                key="qa"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                <QALegalPanel />
              </motion.div>
            )}
            {activeSection === "suite" && department === "quality-assurance" && (
              <motion.div
                key="suite"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                <QASuitePanel />
              </motion.div>
            )}
            {activeSection === "qareport" && department === "quality-assurance" && (
              <motion.div
                key="qareport"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                <QAReportPanel />
              </motion.div>
            )}
            {activeSection === "qatest" && department === "ufficio-legale" && (
              <motion.div
                key="qatest"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12 }}
              >
                <LegalQATestPanel />
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
              className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-[var(--bg-base)] border-l border-[var(--border-dark-subtle)] overflow-y-auto z-50 flex flex-col"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-dark-subtle)] flex-shrink-0 sticky top-0 bg-[var(--bg-base)]">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-[var(--accent)]" />
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">{drawerContent.title}</h3>
                </div>
                <button
                  onClick={() => setDrawerContent(null)}
                  className="p-2 rounded-lg hover:bg-[var(--bg-overlay)] transition-colors text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Drawer content */}
              <div className="flex-1 px-6 py-5 overflow-y-auto">
                <pre className="text-xs text-[var(--fg-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
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
