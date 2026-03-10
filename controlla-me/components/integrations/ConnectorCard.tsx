"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  CreditCard,
  Users,
  HardDrive,
  Building2,
  RefreshCw,
  Settings,
  Plug,
  Clock,
  BarChart3,
  Mail,
  FileText,
  Shield,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

// ─── Types ───

export type ConnectorStatus = "connected" | "not_connected" | "error" | "coming_soon";

export interface ConnectorInfo {
  id: string;
  name: string;
  category: string;
  status: ConnectorStatus;
  description: string;
  icon: string;
  entityCount: number;
  lastSync: string | null;
  popular?: boolean;
}

// ─── Constants ───

export const ICON_MAP: Record<string, LucideIcon> = {
  CreditCard,
  Users,
  HardDrive,
  Building2,
  BarChart3,
  Mail,
  FileText,
  Shield,
  Briefcase,
  Clock,
};

const STATUS_CONFIG: Record<
  ConnectorStatus,
  { label: string; dotColor: string; textColor: string }
> = {
  connected: {
    label: "Connesso",
    dotColor: "bg-[var(--success)]",
    textColor: "text-[var(--success)]",
  },
  not_connected: {
    label: "Non configurato",
    dotColor: "bg-[var(--fg-muted)]",
    textColor: "text-[var(--fg-muted)]",
  },
  error: {
    label: "Errore",
    dotColor: "bg-[var(--error)]",
    textColor: "text-[var(--error)]",
  },
  coming_soon: {
    label: "In arrivo",
    dotColor: "bg-[var(--caution)]",
    textColor: "text-[var(--caution)]",
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  all: "Tutti",
  crm: "CRM",
  erp: "ERP",
  storage: "Cloud Storage",
  payment: "Pagamenti",
  marketing: "Marketing",
  hr: "HR",
  legal: "Legale",
  custom: "Custom",
};

// ─── Helpers ───

function formatLastSync(lastSync: string | null): string | null {
  if (!lastSync) return null;
  const diff = Date.now() - new Date(lastSync).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "meno di 1h fa";
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

// ─── Component ───

interface ConnectorCardProps {
  connector: ConnectorInfo;
  index: number;
}

export default function ConnectorCard({ connector, index }: ConnectorCardProps) {
  const IconComponent = ICON_MAP[connector.icon] || Plug;
  const statusConfig = STATUS_CONFIG[connector.status];
  const isConnected = connector.status === "connected";
  const isError = connector.status === "error";
  const isComingSoon = connector.status === "coming_soon";

  const cardContent = (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="group relative flex flex-col gap-4 rounded-xl p-6 transition-all cursor-pointer"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
        opacity: isComingSoon ? 0.6 : 1,
      }}
      whileHover={
        !isComingSoon
          ? {
              borderColor: "var(--border-dark)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }
          : undefined
      }
    >
      {/* Icon + badges row */}
      <div className="flex items-start justify-between">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-lg"
          style={{ background: "var(--bg-overlay)" }}
        >
          <IconComponent className="w-6 h-6" style={{ color: "var(--fg-secondary)" }} />
        </div>
        <div className="flex gap-1.5">
          {connector.popular && !isComingSoon && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{
                background: "rgba(255, 107, 53, 0.15)",
                color: "var(--accent)",
              }}
            >
              Popolare
            </span>
          )}
          {isConnected && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                background: "rgba(93, 228, 199, 0.15)",
                color: "var(--success)",
              }}
            >
              Attivo
            </span>
          )}
          {isComingSoon && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{
                background: "rgba(255, 250, 194, 0.15)",
                color: "var(--caution)",
              }}
            >
              Prossimamente
            </span>
          )}
        </div>
      </div>

      {/* Name + category */}
      <div>
        <h3 className="text-base font-semibold" style={{ color: "var(--fg-primary)" }}>
          {connector.name}
        </h3>
        <span
          className="inline-block mt-1 rounded-full px-2.5 py-0.5 text-xs"
          style={{
            background: "var(--bg-overlay)",
            color: "var(--fg-muted)",
          }}
        >
          {CATEGORY_LABELS[connector.category] || connector.category}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--fg-secondary)" }}>
        {connector.description}
      </p>

      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dotColor}`} />
        <span className={`text-xs ${statusConfig.textColor}`}>{statusConfig.label}</span>

        {isConnected && connector.entityCount > 0 && (
          <>
            <span style={{ color: "var(--fg-invisible)" }}>|</span>
            <span className="text-xs" style={{ color: "var(--info-bright)" }}>
              {connector.entityCount.toLocaleString("it-IT")} record
            </span>
          </>
        )}

        {isConnected && connector.lastSync && (
          <>
            <span style={{ color: "var(--fg-invisible)" }}>|</span>
            <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {formatLastSync(connector.lastSync)}
            </span>
          </>
        )}

        {isError && (
          <>
            <span style={{ color: "var(--fg-invisible)" }}>|</span>
            <RefreshCw className="w-3 h-3" style={{ color: "var(--error)" }} />
          </>
        )}
      </div>

      {/* CTA buttons */}
      <div className="flex gap-2">
        {isComingSoon ? (
          <button
            disabled
            className="w-full rounded-xl py-3 px-6 text-sm font-medium cursor-not-allowed"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-muted)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            In arrivo
          </button>
        ) : isConnected ? (
          <>
            <button
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-sm font-medium transition-all hover:scale-[1.02]"
              style={{
                background: "var(--bg-overlay)",
                color: "var(--fg-secondary)",
                border: "1px solid var(--border-dark)",
              }}
            >
              <Settings className="w-3.5 h-3.5" />
              Gestisci
            </button>
            <button
              className="rounded-xl py-2.5 px-4 text-sm transition-all"
              style={{ color: "var(--error)" }}
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!confirm(`Disconnettere ${connector.name}? I dati sincronizzati verranno mantenuti.`)) return;
                try {
                  const res = await fetch(`/api/integrations?connectorId=${connector.id}`, { method: "DELETE" });
                  if (res.ok) window.location.reload();
                  else alert("Errore durante la disconnessione");
                } catch {
                  alert("Errore di rete");
                }
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(229, 141, 120, 0.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              Disconnetti
            </button>
          </>
        ) : (
          <button
            className="w-full rounded-xl py-3 px-6 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg"
            style={{
              background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
            }}
          >
            Configura
          </button>
        )}
      </div>
    </motion.div>
  );

  // Coming soon cards are not clickable to detail page
  if (isComingSoon) {
    return cardContent;
  }

  return (
    <Link href={`/integrazione/${connector.id}`} className="block outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-xl">
      {cardContent}
    </Link>
  );
}
