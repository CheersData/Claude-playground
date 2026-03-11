"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Terminal } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Cmd {
  label: string;
  cmd: string;
  note?: string;
}

interface Section {
  id: string;
  icon: string;
  title: string;
  commands: Cmd[];
}

// ── Command catalog ────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: "root",
    icon: "📂",
    title: "Radice Progetto",
    commands: [
      { label: "Naviga alla radice", cmd: "cd C:\\Users\\crist\\Claude-playground\\controlla-me", note: "esegui prima di tutto" },
    ],
  },
  {
    id: "server",
    icon: "🖥️",
    title: "Dev Server",
    commands: [
      { label: "Avvia dev",    cmd: "npm run dev",   note: "localhost:3000" },
      { label: "Build prod",   cmd: "npm run build" },
      { label: "Start prod",   cmd: "npm run start" },
    ],
  },
  {
    id: "daemon",
    icon: "🤖",
    title: "Daemon Autonomo",
    commands: [
      { label: "Avvia loop",    cmd: "npx tsx scripts/company-scheduler-daemon.ts",              note: "loop 2h" },
      { label: "Esecuzione singola", cmd: "npx tsx scripts/company-scheduler-daemon.ts --check-once" },
      { label: "Setup Telegram", cmd: "npx tsx scripts/company-scheduler-daemon.ts --setup" },
      { label: "Test notifica", cmd: "npx tsx scripts/company-scheduler-daemon.ts --test" },
    ],
  },
  {
    id: "tasks",
    icon: "📋",
    title: "Task Board",
    commands: [
      { label: "Board",         cmd: "npx tsx scripts/company-tasks.ts board" },
      { label: "Lista open",    cmd: "npx tsx scripts/company-tasks.ts list --dept trading --status open" },
      { label: "Exec task",     cmd: "npx tsx scripts/company-tasks.ts exec <id>",    note: "sostituisci <id>" },
      { label: "Done task",     cmd: 'npx tsx scripts/company-tasks.ts done <id> --summary "..."' },
    ],
  },
  {
    id: "standup",
    icon: "📅",
    title: "Daily Standup",
    commands: [
      { label: "Genera piano",  cmd: "npx tsx scripts/daily-standup.ts" },
      { label: "Visualizza",    cmd: "npx tsx scripts/daily-standup.ts --view" },
      { label: "Lista piani",   cmd: "npx tsx scripts/daily-standup.ts --list" },
    ],
  },
  {
    id: "depts",
    icon: "🏢",
    title: "Dipartimenti",
    commands: [
      { label: "Contesto dept", cmd: "npx tsx scripts/dept-context.ts trading",       note: "o altro dept" },
      { label: "Tutti i dept",  cmd: "npx tsx scripts/dept-context.ts --all" },
      { label: "Stato tutti",   cmd: "npx tsx scripts/update-dept-status.ts --view --all" },
    ],
  },
  {
    id: "trading",
    icon: "📈",
    title: "Trading",
    commands: [
      { label: "Scheduler",     cmd: "cd trading && python -m src.scheduler",         note: "pipeline intraday + daily" },
      { label: "Report P&L",    cmd: "cd trading && python report.py" },
      { label: "Market scanner",cmd: "cd trading && python -m src.agents.market_scanner" },
      { label: "Test modelli",  cmd: "cd trading && python -m pytest tests/ -v" },
    ],
  },
  {
    id: "corpus",
    icon: "📚",
    title: "Corpus Legislativo",
    commands: [
      { label: "Stato sorgenti", cmd: "npx tsx scripts/data-connector.ts status" },
      { label: "Connetti tutto", cmd: "npx tsx scripts/data-connector.ts connect all" },
      { label: "Carica tutto",   cmd: "npx tsx scripts/data-connector.ts load all" },
    ],
  },
  {
    id: "models",
    icon: "🧠",
    title: "Modelli AI",
    commands: [
      { label: "Census modelli", cmd: "npx tsx scripts/model-census-agent.ts",        note: "verifica disponibilità provider" },
    ],
  },
];

// ── CopyButton ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`flex-shrink-0 p-1 rounded transition-colors ${
        copied
          ? "text-emerald-500"
          : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
      }`}
      title="Copia comando"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── CommandRow ─────────────────────────────────────────────────────────────────

function CommandRow({ cmd }: { cmd: Cmd }) {
  return (
    <div className="flex items-start gap-2 py-1.5 group">
      <code className="flex-1 min-w-0 text-[11px] font-mono text-gray-700 bg-gray-50 rounded px-2 py-1 leading-relaxed break-all">
        {cmd.cmd}
      </code>
      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
        {cmd.note && (
          <span className="text-[10px] text-gray-400 italic hidden group-hover:inline">
            {cmd.note}
          </span>
        )}
        <CopyButton text={cmd.cmd} />
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function SectionBlock({ section }: { section: Section }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm">{section.icon}</span>
        <span className="text-xs font-semibold text-gray-700 flex-1">{section.title}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-gray-400 text-xs"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-1.5 space-y-0.5">
              {section.commands.map((cmd, i) => (
                <div key={i}>
                  <div className="text-[10px] text-gray-400 mb-0.5 mt-1 font-medium uppercase tracking-wide">
                    {cmd.label}
                  </div>
                  <CommandRow cmd={cmd} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface ShellPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function ShellPanel({ open, onClose }: ShellPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
        className="relative w-[420px] max-w-[92vw] h-full bg-white flex flex-col shadow-2xl border-l border-gray-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-900">Shell Commands</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Note demo */}
        <div className="mx-4 mt-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
          <p className="text-[11px] text-amber-700">
            ⚠️ Eseguire dal <strong>terminale esterno</strong> (non dentro sessione Claude Code).
            In demo: daemon e task-runner non funzionano senza crediti API.
          </p>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {SECTIONS.map(section => (
            <SectionBlock key={section.id} section={section} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-center">
            Clicca{" "}
            <Copy className="inline w-2.5 h-2.5 mb-0.5" />
            {" "}per copiare il comando negli appunti
          </p>
        </div>
      </motion.aside>
    </div>
  );
}
