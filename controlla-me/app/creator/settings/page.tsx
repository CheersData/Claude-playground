"use client";

import { motion } from "framer-motion";
import {
  User,
  Shield,
  Calendar,
  Sun,
  Info,
  ExternalLink,
  Sparkles,
  Heart,
  Code2,
  Palette,
  Check,
} from "lucide-react";
import { useCreator } from "../layout";

// ─── Animation variants ─────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
};

// ─── Setting Row ─────────────────────────────────────────────────────────────

function SettingRow({
  icon: Icon,
  label,
  value,
  muted,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-50/80 last:border-0">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          accent
            ? "bg-[#FFF0EB]"
            : "bg-gray-50"
        }`}
      >
        <Icon
          className={`w-[18px] h-[18px] ${
            accent ? "text-[#FF6B35]" : "text-gray-400"
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>
      <p
        className={`text-sm font-medium truncate max-w-[200px] ${
          muted ? "text-gray-400" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <Icon className="w-3.5 h-3.5 text-gray-300" />
      <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
        {title}
      </h2>
    </div>
  );
}

// ─── Initials helper ─────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ─── Role badge color ────────────────────────────────────────────────────────

function getRoleBadge(role: string): { bg: string; text: string; dot: string } {
  switch (role.toLowerCase()) {
    case "admin":
      return { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400" };
    case "creator":
      return { bg: "bg-[#FFF0EB]", text: "text-[#FF6B35]", dot: "bg-[#FF6B35]" };
    case "operator":
      return { bg: "bg-violet-50", text: "text-violet-600", dot: "bg-violet-400" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
  }
}

// ─── About Link ──────────────────────────────────────────────────────────────

function AboutLink({
  label,
  href,
  icon: Icon,
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 py-3.5 border-b border-gray-50/80 last:border-0 transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-gray-50 group-hover:bg-[#FFF0EB] flex items-center justify-center flex-shrink-0 transition-colors duration-200">
        <Icon className="w-[18px] h-[18px] text-gray-400 group-hover:text-[#FF6B35] transition-colors duration-200" />
      </div>
      <span className="flex-1 text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">
        {label}
      </span>
      <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-[#FF6B35] transition-colors duration-200" />
    </a>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CreatorSettingsPage() {
  const { userName, userRole, userEmail } = useCreator();

  const createdDate = new Date().toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const roleBadge = getRoleBadge(userRole);
  const initials = getInitials(userName);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Page title */}
        <motion.div variants={cardVariants} className="mb-8">
          <h1 className="text-2xl md:text-3xl font-serif text-gray-900 tracking-tight mb-1">
            Impostazioni
          </h1>
          <p className="text-sm text-gray-400">
            Profilo e preferenze della tua Creator Console.
          </p>
        </motion.div>

        {/* ── Profile Section ──────────────────────────────────────────────── */}
        <motion.div variants={cardVariants} className="mb-6">
          <SectionHeader icon={User} title="Profilo" />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Hero profile area */}
            <div className="relative px-6 pt-8 pb-6">
              {/* Decorative gradient strip */}
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-[#FF6B35]/5 via-[#FF8C61]/3 to-transparent" />

              <div className="relative flex flex-col items-center text-center">
                {/* Large avatar circle */}
                <motion.div
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#FF8C61] flex items-center justify-center shadow-lg shadow-[#FF6B35]/15 ring-4 ring-white"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  <span className="text-white text-2xl font-semibold tracking-tight">
                    {initials}
                  </span>
                </motion.div>

                {/* Name */}
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  {userName}
                </h3>

                {/* Email */}
                <p className="text-sm text-gray-400 mt-0.5">
                  {userEmail || "nessuna email"}
                </p>

                {/* Role badge */}
                <div
                  className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${roleBadge.bg} ${roleBadge.text}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${roleBadge.dot}`} />
                  {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                </div>
              </div>
            </div>

            {/* Detail rows */}
            <div className="px-6 border-t border-gray-50">
              <SettingRow
                icon={Shield}
                label="Ruolo"
                value={userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                accent
              />
              <SettingRow
                icon={Calendar}
                label="Membro dal"
                value={createdDate}
                muted
              />
            </div>
          </div>
        </motion.div>

        {/* ── Appearance Section ───────────────────────────────────────────── */}
        <motion.div variants={cardVariants} className="mb-6">
          <SectionHeader icon={Palette} title="Aspetto" />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6">
            <div className="flex items-center gap-4 py-5">
              <div className="w-10 h-10 rounded-xl bg-[#FFF0EB] flex items-center justify-center flex-shrink-0">
                <Sun className="w-[18px] h-[18px] text-[#FF6B35]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Tema</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Personalizza l&apos;aspetto della console
                </p>
              </div>
              {/* Theme selector pill */}
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl p-1">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white shadow-sm border border-gray-100 text-sm font-medium text-gray-900 transition-all">
                  <Check className="w-3.5 h-3.5 text-[#FF6B35]" />
                  Chiaro
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── About Section ────────────────────────────────────────────────── */}
        <motion.div variants={cardVariants} className="mb-6">
          <SectionHeader icon={Info} title="Info" />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* App identity */}
            <div className="px-6 py-5 flex items-center gap-4 border-b border-gray-50">
              <div className="w-12 h-12 rounded-2xl bg-[#FF6B35] flex items-center justify-center flex-shrink-0 shadow-md shadow-[#FF6B35]/15">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-gray-900">
                  Poimandres Creator Console
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  v1.0.0 &middot; La Mente Collettiva
                </p>
              </div>
            </div>

            {/* Links */}
            <div className="px-6">
              <AboutLink
                icon={Code2}
                label="Documentazione"
                href="https://github.com/poimandres"
              />
              <AboutLink
                icon={Heart}
                label="Segnala un problema"
                href="https://github.com/poimandres/issues"
              />
            </div>
          </div>
        </motion.div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <motion.div
          variants={cardVariants}
          className="text-center py-6"
        >
          <p className="text-[11px] text-gray-300 font-medium">
            Poimandres &middot; Costruito con cura
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
