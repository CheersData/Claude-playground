"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Building2,
  Shield,
  User,
  RefreshCw,
  AlertCircle,
  Search,
  ChevronRight,
  Lock,
  Hash,
  Sparkles,
  X,
  FolderOpen,
} from "lucide-react";
import { useCreator } from "../layout";

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
  agents: unknown[] | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

type FilterMode = "all" | "mine" | "system";

// ─── Icon mapping (matches dashboard) ────────────────────────────────────────

const DEPT_ICONS: Record<
  string,
  {
    icon: React.ComponentType<{
      className?: string;
      style?: React.CSSProperties;
    }>;
    color: string;
    bg: string;
  }
> = {
  "ufficio-legale": { icon: Shield, color: "#6366F1", bg: "#EEF2FF" },
  trading: { icon: Hash, color: "#059669", bg: "#ECFDF5" },
  integration: { icon: Sparkles, color: "#0891B2", bg: "#ECFEFF" },
  music: { icon: Sparkles, color: "#D946EF", bg: "#FDF4FF" },
  architecture: { icon: Building2, color: "#EA580C", bg: "#FFF7ED" },
  "data-engineering": { icon: Hash, color: "#2563EB", bg: "#EFF6FF" },
  "quality-assurance": { icon: Shield, color: "#16A34A", bg: "#F0FDF4" },
  finance: { icon: Hash, color: "#CA8A04", bg: "#FEFCE8" },
  operations: { icon: Sparkles, color: "#DC2626", bg: "#FEF2F2" },
  security: { icon: Lock, color: "#7C3AED", bg: "#F5F3FF" },
  strategy: { icon: Sparkles, color: "#0D9488", bg: "#F0FDFA" },
  marketing: { icon: Sparkles, color: "#E11D48", bg: "#FFF1F2" },
  protocols: { icon: Shield, color: "#4F46E5", bg: "#EEF2FF" },
  "ux-ui": { icon: Sparkles, color: "#F59E0B", bg: "#FFFBEB" },
  acceleration: { icon: Sparkles, color: "#FF6B35", bg: "#FFF0EB" },
};

function getDeptStyle(name: string) {
  return (
    DEPT_ICONS[name] || { icon: Building2, color: "#6B7280", bg: "#F3F4F6" }
  );
}

// ─── Filter pill config ──────────────────────────────────────────────────────

const FILTER_BUTTONS: { id: FilterMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "all", label: "Tutti", icon: Building2 },
  { id: "mine", label: "I miei", icon: User },
  { id: "system", label: "Sistema", icon: Shield },
];

// ─── Animations ──────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DepartmentsListPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");

  const router = useRouter();
  const { userId } = useCreator();

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem("creator-token");
      const res = await fetch("/api/admin/departments", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDepartments(data.departments || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nel caricamento"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const filtered = departments.filter((d) => {
    if (filter === "mine" && d.created_by !== userId) return false;
    if (filter === "system" && !d.protected) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.display_name.toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">

        {/* ── Header ────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8"
        >
          <div>
            <h1
              className="text-2xl md:text-3xl text-gray-900 tracking-tight"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Dipartimenti
            </h1>
            <p
              className="text-sm text-gray-400 mt-1"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Visualizza, filtra e gestisci tutti i dipartimenti.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={fetchDepartments}
              disabled={loading}
              className="p-2.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all"
              whileTap={{ scale: 0.9 }}
              aria-label="Aggiorna"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </motion.button>
            <motion.button
              onClick={() => router.push("/creator/departments/new")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-[#FF6B35] text-white shadow-sm shadow-orange-200/50 hover:shadow-md hover:shadow-orange-200/50 hover:bg-[#FF8C61] transition-all"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nuovo Dipartimento</span>
              <span className="sm:hidden">Nuovo</span>
            </motion.button>
          </div>
        </motion.div>

        {/* ── Search bar (glassmorphism) ─────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3 }}
          className="sticky top-14 md:top-0 z-10 pb-5 -mx-4 px-4 md:mx-0 md:px-0"
          style={{ background: "linear-gradient(to bottom, #F9FAFB 80%, transparent)" }}
        >
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/60 shadow-sm p-1.5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca per nome, slug o descrizione..."
                  className="w-full pl-10 pr-9 py-3 rounded-xl bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-gray-50/50 transition-colors"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                />
                {/* Clear search */}
                <AnimatePresence>
                  {search && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Divider (desktop only) */}
              <div className="hidden sm:block w-px h-6 bg-gray-200/80" />

              {/* Filter pills */}
              <div className="flex items-center gap-1 px-1 overflow-x-auto">
                {FILTER_BUTTONS.map((fb) => {
                  const isActive = filter === fb.id;
                  const Icon = fb.icon;
                  return (
                    <motion.button
                      key={fb.id}
                      onClick={() => setFilter(fb.id)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                        isActive
                          ? "bg-[#FF6B35] text-white shadow-sm shadow-orange-200/40"
                          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }`}
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                      whileTap={{ scale: 0.95 }}
                      layout
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {fb.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Result count ───────────────────────────────────── */}
        {!loading && !error && departments.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-between mb-3 px-1"
          >
            <p
              className="text-xs text-gray-400"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {filtered.length === departments.length
                ? `${departments.length} dipartiment${departments.length === 1 ? "o" : "i"}`
                : `${filtered.length} di ${departments.length} dipartiment${departments.length === 1 ? "o" : "i"}`}
            </p>
          </motion.div>
        )}

        {/* ── Error ──────────────────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 p-4 rounded-2xl border border-red-100 bg-red-50 mb-6"
            >
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-red-700">
                  Errore nel caricamento
                </p>
                <p className="text-xs text-red-500 mt-0.5">{error}</p>
              </div>
              <motion.button
                onClick={() => fetchDepartments()}
                className="text-xs px-3 py-1.5 rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50 transition-colors flex-shrink-0"
                whileTap={{ scale: 0.95 }}
              >
                Riprova
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Loading skeleton ────────────────────────────────── */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse flex items-center gap-4"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="w-11 h-11 rounded-xl bg-gray-100 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded-lg w-1/3" />
                  <div className="h-3 bg-gray-50 rounded-lg w-2/3" />
                </div>
                <div className="w-16 h-3 bg-gray-50 rounded-lg hidden sm:block" />
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {!loading && filtered.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="w-20 h-20 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center justify-center mb-5">
                {search ? (
                  <Search className="w-9 h-9 text-gray-200" />
                ) : (
                  <FolderOpen className="w-9 h-9 text-gray-200" />
                )}
              </div>
              <h3
                className="text-lg text-gray-900 mb-1.5"
                style={{ fontFamily: "'Instrument Serif', serif" }}
              >
                {search
                  ? "Nessun risultato"
                  : filter === "mine"
                    ? "Nessun dipartimento tuo"
                    : "Nessun dipartimento"}
              </h3>
              <p
                className="text-sm text-gray-400 max-w-xs mb-6"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {search
                  ? `Nessun dipartimento corrisponde a "${search}".`
                  : filter === "mine"
                    ? "Non hai ancora creato un dipartimento."
                    : "Nessun dipartimento trovato con questo filtro."}
              </p>
              {search ? (
                <motion.button
                  onClick={() => setSearch("")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                  whileTap={{ scale: 0.97 }}
                >
                  <X className="w-3.5 h-3.5" />
                  Cancella ricerca
                </motion.button>
              ) : (
                <motion.button
                  onClick={() => router.push("/creator/departments/new")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-[#FF6B35] text-white shadow-sm shadow-orange-200/50 hover:bg-[#FF8C61] transition-all"
                  whileTap={{ scale: 0.97 }}
                >
                  <Plus className="w-4 h-4" />
                  Crea Dipartimento
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Department list ──────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {!loading && filtered.length > 0 && (
            <motion.div
              key={`${filter}-${search}`}
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {filtered.map((dept) => {
                const style = getDeptStyle(dept.name);
                const Icon = style.icon;
                const isOwn = dept.created_by === userId;
                const agentCount =
                  dept.agents && dept.agents.length > 0
                    ? dept.agents.length
                    : 0;

                return (
                  <motion.button
                    key={dept.id}
                    onClick={() =>
                      router.push(`/creator/departments/${dept.name}`)
                    }
                    variants={rowVariants}
                    className="w-full flex items-center gap-4 p-4 md:p-5 rounded-2xl bg-white border border-gray-100 text-left cursor-pointer group hover:border-gray-200 hover:shadow-md transition-all"
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Icon */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                      style={{ backgroundColor: style.bg }}
                    >
                      <Icon
                        className="w-5 h-5"
                        style={{ color: style.color }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#FF6B35] transition-colors"
                          style={{ fontFamily: "'DM Sans', sans-serif" }}
                        >
                          {dept.display_name}
                        </span>
                        <span className="text-[11px] font-mono text-gray-300 hidden sm:inline">
                          {dept.name}
                        </span>
                      </div>
                      {dept.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5 leading-relaxed">
                          {dept.description}
                        </p>
                      )}
                    </div>

                    {/* Badges + meta */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {dept.protected && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-500 font-medium items-center gap-1 hidden sm:flex">
                          <Lock className="w-2.5 h-2.5" />
                          sistema
                        </span>
                      )}
                      {isOwn && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFF0EB] text-[#FF6B35] font-medium items-center gap-1 hidden sm:flex">
                          <User className="w-2.5 h-2.5" />
                          tuo
                        </span>
                      )}
                      {agentCount > 0 && (
                        <span className="text-[10px] text-gray-400 tabular-nums hidden md:inline">
                          {agentCount} agent{agentCount > 1 ? "i" : "e"}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-300 tabular-nums hidden lg:inline">
                        {new Date(dept.updated_at).toLocaleDateString("it-IT")}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#FF6B35] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
