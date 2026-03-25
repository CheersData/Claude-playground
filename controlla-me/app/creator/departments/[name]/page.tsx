"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  User,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  Clock,
  Bot,
  BookOpen,
  Target,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Settings,
  Lock,
  Building2,
  Hash,
  Sparkles,
  Users,
  FileText,
  Zap,
} from "lucide-react";
import { useCreator } from "../../layout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Department {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  mission: string | null;
  protected: boolean;
  created_by: string | null;
  owner_id: string | null;
  config: Record<string, unknown> | null;
  agents: Array<{
    name?: string;
    role?: string;
    description?: string;
  }> | null;
  runbooks: Array<{
    name?: string;
    title?: string;
    description?: string;
  }> | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Dept Icon + Emoji Mapping (matches dashboard) ──────────────────────────

const DEPT_ICONS: Record<
  string,
  {
    icon: React.ComponentType<{
      className?: string;
      style?: React.CSSProperties;
    }>;
    color: string;
    bg: string;
    emoji: string;
    gradient: string;
  }
> = {
  "ufficio-legale": {
    icon: Shield,
    color: "#6366F1",
    bg: "#EEF2FF",
    emoji: "\u2696\uFE0F",
    gradient: "from-indigo-500/10 to-indigo-500/5",
  },
  trading: {
    icon: Hash,
    color: "#059669",
    bg: "#ECFDF5",
    emoji: "\uD83D\uDCC8",
    gradient: "from-emerald-500/10 to-emerald-500/5",
  },
  integration: {
    icon: Sparkles,
    color: "#0891B2",
    bg: "#ECFEFF",
    emoji: "\uD83D\uDD17",
    gradient: "from-cyan-500/10 to-cyan-500/5",
  },
  music: {
    icon: Sparkles,
    color: "#D946EF",
    bg: "#FDF4FF",
    emoji: "\uD83C\uDFB5",
    gradient: "from-fuchsia-500/10 to-fuchsia-500/5",
  },
  architecture: {
    icon: Building2,
    color: "#EA580C",
    bg: "#FFF7ED",
    emoji: "\uD83C\uDFDB\uFE0F",
    gradient: "from-orange-500/10 to-orange-500/5",
  },
  "data-engineering": {
    icon: Hash,
    color: "#2563EB",
    bg: "#EFF6FF",
    emoji: "\uD83D\uDD2C",
    gradient: "from-blue-500/10 to-blue-500/5",
  },
  "quality-assurance": {
    icon: Shield,
    color: "#16A34A",
    bg: "#F0FDF4",
    emoji: "\u2705",
    gradient: "from-green-500/10 to-green-500/5",
  },
  finance: {
    icon: Hash,
    color: "#CA8A04",
    bg: "#FEFCE8",
    emoji: "\uD83D\uDCB0",
    gradient: "from-yellow-500/10 to-yellow-500/5",
  },
  operations: {
    icon: Sparkles,
    color: "#DC2626",
    bg: "#FEF2F2",
    emoji: "\u2699\uFE0F",
    gradient: "from-red-500/10 to-red-500/5",
  },
  security: {
    icon: Lock,
    color: "#7C3AED",
    bg: "#F5F3FF",
    emoji: "\uD83D\uDEE1\uFE0F",
    gradient: "from-violet-500/10 to-violet-500/5",
  },
  strategy: {
    icon: Sparkles,
    color: "#0D9488",
    bg: "#F0FDFA",
    emoji: "\uD83E\uDDED",
    gradient: "from-teal-500/10 to-teal-500/5",
  },
  marketing: {
    icon: Sparkles,
    color: "#E11D48",
    bg: "#FFF1F2",
    emoji: "\uD83D\uDCE3",
    gradient: "from-rose-500/10 to-rose-500/5",
  },
  protocols: {
    icon: Shield,
    color: "#4F46E5",
    bg: "#EEF2FF",
    emoji: "\uD83D\uDCCB",
    gradient: "from-indigo-500/10 to-indigo-500/5",
  },
  "ux-ui": {
    icon: Sparkles,
    color: "#F59E0B",
    bg: "#FFFBEB",
    emoji: "\uD83C\uDFA8",
    gradient: "from-amber-500/10 to-amber-500/5",
  },
  acceleration: {
    icon: Sparkles,
    color: "#FF6B35",
    bg: "#FFF0EB",
    emoji: "\uD83D\uDE80",
    gradient: "from-orange-500/10 to-orange-500/5",
  },
};

function getDeptStyle(name: string) {
  return (
    DEPT_ICONS[name] || {
      icon: Building2,
      color: "#6B7280",
      bg: "#F3F4F6",
      emoji: "\uD83C\uDFE2",
      gradient: "from-gray-500/10 to-gray-500/5",
    }
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteConfirmation({
  deptName,
  displayName,
  onConfirm,
  onCancel,
  deleting,
}: {
  deptName: string;
  displayName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end md:items-center justify-center"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 350 }}
        className="w-full md:max-w-[400px] bg-white rounded-t-3xl md:rounded-3xl p-7 md:mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="md:hidden w-10 h-1 rounded-full bg-gray-200 mx-auto mb-6" />

        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
          <Trash2 className="w-6 h-6 text-red-500" />
        </div>
        <h3
          className="text-xl text-gray-900 text-center mb-2"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Elimina dipartimento
        </h3>
        <p
          className="text-sm text-gray-500 text-center mb-2 leading-relaxed"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Stai per eliminare definitivamente:
        </p>
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-sm font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2">
            {displayName}
          </span>
        </div>
        <p
          className="text-xs text-gray-400 text-center mb-7"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Questa azione non puo essere annullata. Tutti gli agenti e runbook associati verranno rimossi.
        </p>
        <div className="flex flex-col gap-2.5">
          <motion.button
            onClick={onConfirm}
            disabled={deleting}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 shadow-sm shadow-red-200/50"
            whileTap={{ scale: 0.97 }}
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {deleting ? "Eliminazione..." : "Conferma eliminazione"}
          </motion.button>
          <motion.button
            onClick={onCancel}
            disabled={deleting}
            className="w-full px-5 py-3.5 rounded-2xl text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100"
            whileTap={{ scale: 0.97 }}
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Annulla
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Inline Edit Field ────────────────────────────────────────────────────────

function InlineEditField({
  value,
  fieldName,
  deptName,
  multiline,
  onUpdated,
  onCancel,
}: {
  value: string | null;
  fieldName: string;
  deptName: string;
  multiline?: boolean;
  onUpdated: (newValue: string) => void;
  onCancel: () => void;
}) {
  const [editValue, setEditValue] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = sessionStorage.getItem("creator-token");
      const res = await fetch("/api/admin/departments", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": window.location.origin,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          name: deptName,
          [fieldName]: editValue.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onUpdated(editValue.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      handleSave();
    }
  };

  const InputTag = multiline ? "textarea" : "input";

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      <InputTag
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/20 focus:border-[#FF6B35] transition-all placeholder:text-gray-400 shadow-sm"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
        rows={multiline ? 4 : undefined}
        placeholder={`Inserisci ${fieldName === "description" ? "descrizione" : "missione"}...`}
        autoFocus
      />
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <motion.button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-[#FF6B35] text-white hover:bg-[#FF5722] transition-colors shadow-sm shadow-orange-200/50 disabled:opacity-50"
          whileTap={{ scale: 0.95 }}
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Salva
        </motion.button>
        <motion.button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100"
          whileTap={{ scale: 0.95 }}
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          <X className="w-3.5 h-3.5" />
          Annulla
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function CollapsibleSection({
  icon: Icon,
  label,
  count,
  defaultOpen,
  onEdit,
  canEdit,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  defaultOpen?: boolean;
  onEdit?: () => void;
  canEdit?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3.5 px-6 py-5 text-left hover:bg-gray-50/40 transition-colors group"
      >
        <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-100 transition-colors">
          <Icon className="w-4 h-4 text-gray-400" />
        </div>
        <span
          className="text-sm font-semibold text-gray-700 flex-1"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          {label}
          {count !== undefined && (
            <span className="ml-2 text-xs font-normal text-gray-300">
              {count}
            </span>
          )}
        </span>
        {canEdit && onEdit && (
          <motion.span
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-2 rounded-xl text-gray-300 hover:text-[#FF6B35] hover:bg-[#FFF0EB] transition-all"
            whileTap={{ scale: 0.9 }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </motion.span>
        )}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <ChevronDown className="w-4 h-4 text-gray-300" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 border-t border-gray-50 pt-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500" },
    inactive: { bg: "bg-gray-50", text: "text-gray-500", dot: "bg-gray-400" },
    maintenance: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500" },
  };
  const c = colors[status.toLowerCase()] || colors.active;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DepartmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const name = params.name as string;
  const { userId } = useCreator();

  const [dept, setDept] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  const fetchDepartment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/departments/${encodeURIComponent(name)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDept(data.department);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nel caricamento"
      );
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    fetchDepartment();
  }, [fetchDepartment]);

  const isOwn = dept?.created_by === userId;
  const canEdit = isOwn && !dept?.protected;

  const handleDelete = async () => {
    if (!dept) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/departments?name=${encodeURIComponent(dept.name)}`,
        {
          method: "DELETE",
          headers: { "x-csrf-token": window.location.origin },
          credentials: "include",
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.push("/creator");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nell'eliminazione"
      );
      setShowDeleteModal(false);
      setDeleting(false);
    }
  };

  const handleFieldUpdate = (field: string, newValue: string) => {
    if (dept) {
      setDept({ ...dept, [field]: newValue || null });
    }
    setEditingField(null);
  };

  const style = dept ? getDeptStyle(dept.name) : getDeptStyle("");

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB]">
        <div className="p-5 md:p-8 lg:p-10 max-w-4xl mx-auto">
          {/* Breadcrumb skeleton */}
          <div className="flex items-center gap-2 mb-8">
            <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-3 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-3 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
          </div>
          {/* Header skeleton */}
          <div className="bg-white rounded-3xl border border-gray-100 p-8 mb-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 animate-pulse" />
              <div className="flex-1 space-y-3">
                <div className="h-7 w-2/5 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-4 w-1/4 bg-gray-50 rounded animate-pulse" />
              </div>
            </div>
          </div>
          {/* Section skeletons */}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-100" />
                  <div className="h-4 w-28 bg-gray-100 rounded" />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full bg-gray-50 rounded" />
                  <div className="h-3 w-3/4 bg-gray-50 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !dept) {
    return (
      <div className="min-h-screen bg-[#F9FAFB]">
        <div className="p-5 md:p-8 lg:p-10 max-w-4xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm mb-8">
            <motion.button
              onClick={() => router.push("/creator")}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
              whileTap={{ scale: 0.97 }}
            >
              Dashboard
            </motion.button>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-gray-600 font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Errore
            </span>
          </div>
          {/* Error card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl border border-red-100 p-8 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <h2
              className="text-xl text-gray-900 mb-2"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Impossibile caricare
            </h2>
            <p
              className="text-sm text-gray-500 mb-6 max-w-sm mx-auto"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {error}
            </p>
            <div className="flex items-center justify-center gap-3">
              <motion.button
                onClick={() => router.push("/creator")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all"
                whileTap={{ scale: 0.97 }}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                <ArrowLeft className="w-4 h-4" />
                Torna alla dashboard
              </motion.button>
              <motion.button
                onClick={fetchDepartment}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-[#FF6B35] hover:bg-[#FF5722] transition-all shadow-sm shadow-orange-200/50"
                whileTap={{ scale: 0.97 }}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                Riprova
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (!dept) return null;

  const agentCount = dept.agents?.length ?? 0;
  const runbookCount = dept.runbooks?.length ?? 0;

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="p-5 md:p-8 lg:p-10 max-w-4xl mx-auto">
        {/* ── Breadcrumb ───────────────────────────────────────── */}
        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-1.5 text-sm mb-8"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          <motion.button
            onClick={() => router.push("/creator")}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            whileTap={{ scale: 0.97 }}
          >
            Dashboard
          </motion.button>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <motion.button
            onClick={() => router.push("/creator/departments")}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            whileTap={{ scale: 0.97 }}
          >
            Dipartimenti
          </motion.button>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-gray-700 font-medium truncate max-w-[200px]">
            {dept.display_name}
          </span>
        </motion.nav>

        {/* ── Header Card ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative bg-white rounded-3xl border border-gray-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.02)] p-7 md:p-8 mb-6 overflow-hidden"
        >
          {/* Background gradient orb */}
          <div
            className={`absolute -top-20 -right-20 w-56 h-56 rounded-full opacity-30 blur-3xl pointer-events-none bg-gradient-to-br ${style.gradient}`}
          />

          <div className="relative">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
              <div className="flex items-start gap-5">
                {/* Department emoji icon */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
                  className="w-16 h-16 md:w-18 md:h-18 rounded-2xl flex items-center justify-center text-3xl md:text-4xl flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: style.bg }}
                >
                  {style.emoji}
                </motion.div>

                <div className="min-w-0 pt-1">
                  <h1
                    className="text-2xl md:text-3xl text-gray-900 tracking-tight leading-tight"
                    style={{ fontFamily: "'Instrument Serif', serif" }}
                  >
                    {dept.display_name}
                  </h1>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span
                      className="text-xs font-mono text-gray-300 tracking-wide"
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {dept.name}
                    </span>
                    {dept.protected && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-indigo-50/80 text-indigo-500 font-medium ring-1 ring-indigo-100/50">
                        <Lock className="w-2.5 h-2.5" />
                        Sistema
                      </span>
                    )}
                    {isOwn && !dept.protected && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-[#FFF0EB] text-[#FF6B35] font-semibold ring-1 ring-[#FF6B35]/10">
                        <User className="w-2.5 h-2.5" />
                        Tuo
                      </span>
                    )}
                    {dept.status && <StatusBadge status={dept.status} />}
                  </div>
                </div>
              </div>

              {/* Actions */}
              {canEdit && (
                <motion.button
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 border border-red-100/50 transition-all self-start"
                  whileTap={{ scale: 0.97 }}
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Elimina
                </motion.button>
              )}
            </div>

            {/* Quick stats row */}
            {(agentCount > 0 || runbookCount > 0) && (
              <div className="flex items-center gap-4 mt-6 pt-5 border-t border-gray-50">
                {agentCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <span style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      <span className="font-semibold text-gray-900">{agentCount}</span>{" "}
                      {agentCount === 1 ? "agente" : "agenti"}
                    </span>
                  </div>
                )}
                {runbookCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                      <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <span style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      <span className="font-semibold text-gray-900">{runbookCount}</span>{" "}
                      {runbookCount === 1 ? "runbook" : "runbook"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Error Banner ─────────────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4"
            >
              <div className="flex items-center gap-3 p-4 rounded-2xl border border-red-100/80 bg-gradient-to-r from-red-50/80 to-white text-sm">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <span className="text-red-600 flex-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {error}
                </span>
                <motion.button
                  onClick={() => setError(null)}
                  className="p-1.5 rounded-lg text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Content Sections ─────────────────────────────────── */}
        <div className="space-y-4">
          {/* Description */}
          <CollapsibleSection
            icon={FileText}
            label="Descrizione"
            defaultOpen
            canEdit={canEdit}
            onEdit={() =>
              setEditingField(
                editingField === "description" ? null : "description"
              )
            }
          >
            {editingField === "description" && canEdit ? (
              <InlineEditField
                value={dept.description}
                fieldName="description"
                deptName={dept.name}
                multiline
                onUpdated={(v) => handleFieldUpdate("description", v)}
                onCancel={() => setEditingField(null)}
              />
            ) : (
              <p
                className={`text-sm leading-relaxed ${
                  dept.description ? "text-gray-600" : "text-gray-400 italic"
                }`}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {dept.description || "Nessuna descrizione."}
              </p>
            )}
          </CollapsibleSection>

          {/* Mission */}
          <CollapsibleSection
            icon={Target}
            label="Missione"
            defaultOpen
            canEdit={canEdit}
            onEdit={() =>
              setEditingField(
                editingField === "mission" ? null : "mission"
              )
            }
          >
            {editingField === "mission" && canEdit ? (
              <InlineEditField
                value={dept.mission}
                fieldName="mission"
                deptName={dept.name}
                multiline
                onUpdated={(v) => handleFieldUpdate("mission", v)}
                onCancel={() => setEditingField(null)}
              />
            ) : (
              <p
                className={`text-sm leading-relaxed whitespace-pre-wrap ${
                  dept.mission ? "text-gray-600" : "text-gray-400 italic"
                }`}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {dept.mission || "Nessuna missione definita."}
              </p>
            )}
          </CollapsibleSection>

          {/* Agents */}
          {dept.agents && dept.agents.length > 0 && (
            <CollapsibleSection
              icon={Bot}
              label="Agenti"
              count={dept.agents.length}
              defaultOpen
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {dept.agents.map((agent, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className="relative p-5 rounded-2xl bg-gradient-to-br from-gray-50/80 to-white border border-gray-100/80 group hover:border-gray-200 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: style.bg }}
                      >
                        <Bot className="w-5 h-5" style={{ color: style.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-semibold text-gray-900 truncate"
                          style={{ fontFamily: "'DM Sans', sans-serif" }}
                        >
                          {agent.name || `Agente ${i + 1}`}
                        </p>
                        {agent.role && (
                          <p
                            className="text-xs font-medium mt-0.5"
                            style={{ color: style.color, fontFamily: "'DM Sans', sans-serif" }}
                          >
                            {agent.role}
                          </p>
                        )}
                        {agent.description && (
                          <p
                            className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-3"
                            style={{ fontFamily: "'DM Sans', sans-serif" }}
                          >
                            {agent.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Runbooks */}
          {dept.runbooks && dept.runbooks.length > 0 && (
            <CollapsibleSection
              icon={BookOpen}
              label="Runbook"
              count={dept.runbooks.length}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {dept.runbooks.map((rb, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25 }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-gray-50/60 border border-gray-100/60 hover:bg-gray-50 hover:border-gray-200/60 transition-all cursor-default group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <FileText className="w-4 h-4 text-gray-400 group-hover:text-[#FF6B35] transition-colors" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-medium text-gray-900 truncate"
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      >
                        {rb.title || rb.name || `Runbook ${i + 1}`}
                      </p>
                      {rb.description && (
                        <p
                          className="text-xs text-gray-500 mt-0.5 truncate leading-relaxed"
                          style={{ fontFamily: "'DM Sans', sans-serif" }}
                        >
                          {rb.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </motion.div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Metadata */}
          <CollapsibleSection
            icon={Clock}
            label="Informazioni"
            defaultOpen={false}
          >
            <div className="space-y-4">
              {[
                {
                  label: "Creato il",
                  value: new Date(dept.created_at).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                },
                {
                  label: "Aggiornato il",
                  value: new Date(dept.updated_at).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                },
                ...(dept.status
                  ? [{ label: "Stato", value: dept.status, isBadge: true }]
                  : []),
                {
                  label: "Protetto",
                  value: dept.protected ? "Si" : "No",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0"
                >
                  <span
                    className="text-sm text-gray-500"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {item.label}
                  </span>
                  {"isBadge" in item ? (
                    <StatusBadge status={item.value} />
                  ) : (
                    <span
                      className="text-sm text-gray-900 tabular-nums"
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {item.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Config */}
          {dept.config && Object.keys(dept.config).length > 0 && (
            <CollapsibleSection
              icon={Settings}
              label="Configurazione"
              defaultOpen={false}
            >
              <pre
                className="text-xs whitespace-pre-wrap overflow-x-auto text-gray-600 bg-gray-50 rounded-xl p-4 border border-gray-100/60 leading-relaxed"
                style={{ fontFamily: "'DM Mono', 'SF Mono', 'Fira Code', monospace" }}
              >
                {JSON.stringify(dept.config, null, 2)}
              </pre>
            </CollapsibleSection>
          )}
        </div>

        {/* Bottom padding for mobile */}
        <div className="h-8" />
      </div>

      {/* ── Delete Confirmation Modal ─────────────────────────── */}
      <AnimatePresence>
        {showDeleteModal && (
          <DeleteConfirmation
            deptName={dept.name}
            displayName={dept.display_name}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteModal(false)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
