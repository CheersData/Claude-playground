"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Lock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

// ─── Types ───

export type ConnectorStatus = "connected" | "not_connected" | "error" | "coming_soon" | "syncing";

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
  { label: string; dotColor: string; textColor: string; pulse?: boolean }
> = {
  connected: {
    label: "Connesso",
    dotColor: "var(--success)",
    textColor: "var(--success)",
  },
  syncing: {
    label: "Sincronizzazione...",
    dotColor: "var(--info-bright)",
    textColor: "var(--info-bright)",
    pulse: true,
  },
  not_connected: {
    label: "Non configurato",
    dotColor: "var(--fg-muted)",
    textColor: "var(--fg-muted)",
  },
  error: {
    label: "Errore",
    dotColor: "var(--error)",
    textColor: "var(--error)",
  },
  coming_soon: {
    label: "In arrivo",
    dotColor: "var(--caution)",
    textColor: "var(--caution)",
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  all: "Tutti",
  crm: "CRM",
  erp: "ERP",
  storage: "Cloud Storage",
  payment: "Pagamenti",
  fatturazione: "Fatturazione",
  marketing: "Marketing",
  hr: "HR",
  legal: "Legale",
  custom: "Custom",
};

// ─── Brand identity for each connector ───

interface ConnectorBrand {
  color: string;        // Primary brand color
  bgGlow: string;       // Subtle background glow on hover
  benefit: string;      // One-line benefit for Italian SMEs
  setupMinutes: number; // Estimated setup time
}

const CONNECTOR_BRANDS: Record<string, ConnectorBrand> = {
  salesforce: {
    color: "#00A1E0",
    bgGlow: "rgba(0, 161, 224, 0.08)",
    benefit: "Tieni sotto controllo pipeline, clienti e trattative in un unico posto",
    setupMinutes: 5,
  },
  hubspot: {
    color: "#FF7A59",
    bgGlow: "rgba(255, 122, 89, 0.08)",
    benefit: "Centralizza contatti, deal e marketing per analisi automatica",
    setupMinutes: 3,
  },
  sap: {
    color: "#0FAAFF",
    bgGlow: "rgba(15, 170, 255, 0.08)",
    benefit: "Integra ordini, fatture e contabilita dal tuo gestionale",
    setupMinutes: 10,
  },
  odoo: {
    color: "#714B67",
    bgGlow: "rgba(113, 75, 103, 0.08)",
    benefit: "Connetti vendite, acquisti e magazzino dal tuo ERP open source",
    setupMinutes: 7,
  },
  "google-drive": {
    color: "#4285F4",
    bgGlow: "rgba(66, 133, 244, 0.08)",
    benefit: "Importa contratti e documenti da Drive per analisi AI automatica",
    setupMinutes: 2,
  },
  stripe: {
    color: "#635BFF",
    bgGlow: "rgba(99, 91, 255, 0.08)",
    benefit: "Monitora pagamenti, fatture e abbonamenti con analisi intelligente",
    setupMinutes: 3,
  },
  "fatture-in-cloud": {
    color: "#1CA7EC",
    bgGlow: "rgba(28, 167, 236, 0.08)",
    benefit: "Importa fatture e analizza automaticamente clausole e rischi",
    setupMinutes: 5,
  },
  mailchimp: {
    color: "#FFE01B",
    bgGlow: "rgba(255, 224, 27, 0.06)",
    benefit: "Analizza i tuoi contatti marketing e campagne email",
    setupMinutes: 3,
  },
  sendgrid: {
    color: "#1A82E2",
    bgGlow: "rgba(26, 130, 226, 0.08)",
    benefit: "Monitora email transazionali e deliverability",
    setupMinutes: 5,
  },
  normattiva: {
    color: "#A78BFA",
    bgGlow: "rgba(167, 139, 250, 0.08)",
    benefit: "Accedi al corpus legislativo italiano per ricerche legali",
    setupMinutes: 2,
  },
  eurlex: {
    color: "#003399",
    bgGlow: "rgba(0, 51, 153, 0.10)",
    benefit: "Consulta regolamenti e direttive UE aggiornati",
    setupMinutes: 2,
  },
  personio: {
    color: "#0F5CFA",
    bgGlow: "rgba(15, 92, 250, 0.08)",
    benefit: "Gestisci dipendenti, buste paga e assenze in un click",
    setupMinutes: 5,
  },
  bamboohr: {
    color: "#73C41D",
    bgGlow: "rgba(115, 196, 29, 0.08)",
    benefit: "Centralizza anagrafiche HR e documenti del personale",
    setupMinutes: 5,
  },
};

const DEFAULT_BRAND: ConnectorBrand = {
  color: "var(--fg-secondary)",
  bgGlow: "rgba(255, 107, 53, 0.05)",
  benefit: "",
  setupMinutes: 5,
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
  /** When false, setup/configure actions are disabled with a login hint */
  isAuthenticated?: boolean;
  /** Called when unauthenticated user clicks "Configura" — triggers login form */
  onRequestLogin?: () => void;
}

export default function ConnectorCard({ connector, index, isAuthenticated = true, onRequestLogin }: ConnectorCardProps) {
  const router = useRouter();
  const IconComponent = ICON_MAP[connector.icon] || Plug;
  const statusConfig = STATUS_CONFIG[connector.status];
  const isConnected = connector.status === "connected";
  const isSyncing = connector.status === "syncing";
  const isError = connector.status === "error";
  const isComingSoon = connector.status === "coming_soon";
  const brand = CONNECTOR_BRANDS[connector.id] || DEFAULT_BRAND;

  const cardContent = (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="group relative flex flex-col rounded-xl p-6 transition-all cursor-pointer overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: isConnected
          ? "1px solid rgba(93, 228, 199, 0.2)"
          : isError
            ? "1px solid rgba(229, 141, 120, 0.2)"
            : "1px solid var(--border-dark-subtle)",
        opacity: isComingSoon ? 0.6 : 1,
      }}
      whileHover={
        !isComingSoon
          ? {
              y: -2,
              boxShadow: `0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px var(--border-dark), inset 0 1px 0 rgba(255,255,255,0.03)`,
            }
          : undefined
      }
    >
      {/* Hover glow overlay — uses brand color */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${brand.bgGlow}, transparent 70%)`,
        }}
      />

      {/* Connected top accent line */}
      {isConnected && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: "linear-gradient(90deg, transparent, var(--success), transparent)",
          }}
        />
      )}

      {/* ─── Row 1: Icon + status badges ─── */}
      <div className="relative flex items-start justify-between mb-4">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${brand.color}18, ${brand.color}08)`,
            border: `1px solid ${brand.color}25`,
          }}
        >
          <IconComponent
            className="w-6 h-6 transition-colors duration-300"
            style={{ color: brand.color }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end">
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
          {isSyncing && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold animate-pulse"
              style={{
                background: "rgba(137, 221, 255, 0.15)",
                color: "var(--info-bright)",
              }}
            >
              Sync...
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

      {/* ─── Row 2: Name + category ─── */}
      <div className="relative mb-2">
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

      {/* ─── Row 3: Benefit description (brand-specific) or fallback to generic ─── */}
      <p
        className="relative text-[13px] leading-relaxed flex-1 mb-3"
        style={{ color: "var(--fg-secondary)" }}
      >
        {brand.benefit || connector.description}
      </p>

      {/* ─── Row 4: Setup time + Trust badges ─── */}
      {!isComingSoon && !isConnected && (
        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3">
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--fg-muted)" }}
          >
            <Clock className="w-3 h-3" />
            Setup ~{brand.setupMinutes} min
          </span>
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--success)" }}
          >
            <Lock className="w-3 h-3" />
            Dati criptati
          </span>
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--info)" }}
          >
            <ShieldCheck className="w-3 h-3" />
            GDPR
          </span>
        </div>
      )}

      {/* ─── Row 5: Status indicator ─── */}
      <div className="relative flex items-center gap-2 mb-4">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: statusConfig.dotColor,
            boxShadow: statusConfig.pulse ? `0 0 6px ${statusConfig.dotColor}` : undefined,
            animation: statusConfig.pulse ? "studio-dot-pulse 1.5s ease-in-out infinite" : undefined,
          }}
        />
        <span className="text-xs" style={{ color: statusConfig.textColor }}>
          {statusConfig.label}
        </span>

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

      {/* ─── Row 6: CTA buttons ─── */}
      <div className="relative flex gap-2">
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
        ) : !isAuthenticated ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRequestLogin?.();
            }}
            className="w-full rounded-xl py-3 px-6 text-sm font-medium text-center transition-all hover:scale-[1.02] hover:shadow-md"
            style={{
              background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
              color: "white",
            }}
            aria-label="Accedi per configurare questo connettore"
          >
            <span className="flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5" />
              Accedi per configurare
            </span>
          </button>
        ) : isConnected ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                router.push(`/integrazione/${connector.id}?tab=sync`);
              }}
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
              className="rounded-xl py-2.5 px-4 text-sm transition-all hover-bg-error-subtle"
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
            >
              Disconnetti
            </button>
          </>
        ) : (
          <span
            className="block w-full rounded-xl py-3 px-6 text-sm font-semibold text-white text-center transition-all group-hover:shadow-lg"
            style={{
              background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
              boxShadow: "0 2px 8px rgba(255, 107, 53, 0.15)",
            }}
          >
            Configura
          </span>
        )}
      </div>
    </motion.div>
  );

  // Coming soon cards are not clickable to detail page
  // All other cards are browsable by everyone — auth is checked only when clicking "Configura"
  if (isComingSoon) {
    return cardContent;
  }

  return (
    <Link href={`/integrazione/${connector.id}`} className="block outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-xl">
      {cardContent}
    </Link>
  );
}
