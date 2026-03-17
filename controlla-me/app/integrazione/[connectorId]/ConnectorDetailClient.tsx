"use client";

/**
 * ConnectorDetailClient — Connector setup wizard + sync dashboard + mapping UI
 *
 * Three-tab layout:
 *   1. Setup             — 5-step wizard (Entita, Auth, Mapping, Frequenza, Attiva)
 *   2. Sincronizzazione  — Sync status cards, 7-day bar chart, error log
 *   3. Mappatura         — Full mapping editor with AI suggestions + save
 *
 * Design: Poimandres dark theme (--bg-base, --bg-raised, --bg-overlay)
 * Accent: #FF6B35
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Users,
  HardDrive,
  Building2,
  Plug,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Save,
  FileText,
  Pause,
  Play,
  Download,
  Search,
  Eye,
  Database,
  Send,
  type LucideIcon,
} from "lucide-react";

import EntitySelect, { type EntityOption } from "@/components/integrations/wizard/EntitySelect";
import AuthStep, { type AuthMode } from "@/components/integrations/wizard/AuthStep";
import FieldMappingStep, {
  type EntityMappings,
} from "@/components/integrations/wizard/FieldMappingStep";
import FrequencyStep, { type SyncFrequency } from "@/components/integrations/wizard/FrequencyStep";
import ReviewStep from "@/components/integrations/wizard/ReviewStep";
import SyncProgress, { type SyncProgressData, type SupervisorMessage } from "@/components/integrations/SyncProgress";
import IntegrationAgentChat from "@/components/integrations/IntegrationAgentChat";
import { ConnectorSyncSkeleton } from "@/components/integrations/Skeletons";
import ErrorState from "@/components/integrations/ErrorStates";
import { NoSyncHistory, NoRecords } from "@/components/integrations/EmptyStates";
import { useToast } from "@/components/integrations/Toast";

// ─── Types ───

interface ConnectorConfig {
  id: string;
  name: string;
  category: string;
  icon: string;
  authMode: AuthMode;
  supportsApiKey?: boolean;
  oauthAvailable?: boolean;
  oauthPermissions: { label: string }[];
  apiKeyLabel?: string;
  secretKeyLabel?: string;
  apiKeyPlaceholder?: string;
  secretKeyPlaceholder?: string;
  helpText?: string;
  entities: EntityOption[];
  targetFields: string[];
}

interface SyncHistoryDay {
  date: string;
  success: number;
  failed: number;
}

interface SyncErrorEntry {
  id: string;
  timestamp: string;
  message: string;
  affectedRecords: number;
  details?: string;
}

interface ConnectorSyncData {
  status: "synced" | "error" | "syncing" | "paused" | "disconnected";
  lastSync: string | null;
  nextSync: string | null;
  totalRecords: number;
  history: SyncHistoryDay[];
  errors: SyncErrorEntry[];
}

// ─── Constants ───

const TABS = [
  { id: "setup", label: "Setup" },
  { id: "sync", label: "Sincronizzazione" },
  { id: "mapping", label: "Mappatura" },
  { id: "dati", label: "Dati" },
  { id: "assistente", label: "Assistente AI" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ICON_MAP: Record<string, LucideIcon> = {
  CreditCard,
  Users,
  HardDrive,
  Building2,
  FileText,
};

const STEPS = [
  { id: "entities", label: "Dati" },
  { id: "auth", label: "Auth" },
  { id: "mapping", label: "Mapping" },
  { id: "frequency", label: "Frequenza" },
  { id: "review", label: "Attiva" },
] as const;

// ─── API response → ConnectorConfig mapper ───
// Connector metadata is fetched from GET /api/integrations/[connectorId].
// This function maps the API response to the ConnectorConfig shape used by the wizard.

interface ConnectorApiResponse {
  id: string;
  name: string;
  category: string;
  icon: string;
  authMode: "oauth" | "api_key";
  supportsApiKey?: boolean;
  oauthAvailable?: boolean;
  oauthPermissions: { label: string }[];
  apiKeyLabel?: string | null;
  secretKeyLabel?: string | null;
  apiKeyPlaceholder?: string | null;
  secretKeyPlaceholder?: string | null;
  helpText?: string | null;
  targetFields: string[];
  entities: {
    id: string;
    name: string;
    fields: string[];
    recordCount: number;
    lastUpdated: string | null;
  }[];
  // Dynamic data (sync status, history, etc.)
  status?: string;
  lastSync?: string | null;
  nextSync?: string | null;
  totalRecords?: number;
  syncHistory?: unknown[];
  errors?: unknown[];
  mappings?: unknown[];
}

function mapApiResponseToConfig(data: ConnectorApiResponse): ConnectorConfig {
  return {
    id: data.id,
    name: data.name,
    category: data.category,
    icon: data.icon,
    authMode: data.authMode,
    supportsApiKey: data.supportsApiKey,
    oauthAvailable: data.oauthAvailable,
    oauthPermissions: data.oauthPermissions ?? [],
    apiKeyLabel: data.apiKeyLabel ?? undefined,
    secretKeyLabel: data.secretKeyLabel ?? undefined,
    apiKeyPlaceholder: data.apiKeyPlaceholder ?? undefined,
    secretKeyPlaceholder: data.secretKeyPlaceholder ?? undefined,
    helpText: data.helpText ?? undefined,
    entities: data.entities.map((e) => ({
      id: e.id,
      name: e.name,
      recordCount: e.recordCount ?? 0,
      lastUpdated: e.lastUpdated ?? null,
      fields: e.fields,
    })),
    targetFields: data.targetFields,
  };
}

// ─── Auto-mapping generator ───

function generateAutoMapping(entities: EntityOption[], targetFields: string[]): EntityMappings[] {
  return entities.map((entity) => ({
    entityId: entity.id,
    entityName: entity.name,
    mappings: entity.fields.map((field) => {
      const fieldLower = field.toLowerCase();
      const match = targetFields.find(
        (tf) =>
          tf.toLowerCase().includes(fieldLower) ||
          fieldLower.includes(tf.toLowerCase()) ||
          tf.toLowerCase().replace(/_/g, " ") === fieldLower
      );
      return {
        sourceField: field.toLowerCase().replace(/ /g, "_"),
        targetField: match ?? "-- Ignora --",
        confidence: match ? 80 + Math.floor(Math.random() * 19) : 0,
        autoMapped: !!match,
      };
    }),
  }));
}

// ─── Helpers ───

function formatDateTime(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function confidenceColor(pct: number): string {
  if (pct >= 90) return "var(--success)";
  if (pct >= 70) return "var(--caution)";
  return "var(--error)";
}

// ─── Stepper ───

function WizardStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all"
                style={{
                  background: isCompleted
                    ? "var(--success)"
                    : isCurrent
                      ? "var(--accent)"
                      : "var(--bg-overlay)",
                  color: isCompleted || isCurrent ? "white" : "var(--fg-muted)",
                  border: isFuture ? "1px solid var(--border-dark)" : "none",
                  boxShadow: isCurrent ? "0 0 0 4px rgba(255, 107, 53, 0.2)" : "none",
                }}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className="text-xs mt-2 hidden sm:block"
                style={{
                  color: isCurrent ? "var(--fg-primary)" : "var(--fg-muted)",
                  fontWeight: isCurrent ? 600 : 400,
                }}
              >
                {step.label}
              </span>
            </div>

            {i < STEPS.length - 1 && (
              <div
                className="h-0.5 w-8 sm:w-12 mx-1 sm:mx-2 rounded-full"
                style={{
                  background: isCompleted ? "var(--success)" : "var(--border-dark)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function ConnectorDetailClient() {
  const { connectorId } = useParams<{ connectorId: string }>();
  const router = useRouter();
  const toast = useToast();

  // ─── Fetch connector metadata from API ───
  const [config, setConfig] = useState<ConnectorConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!connectorId) return;
    let cancelled = false;

    async function fetchMetadata() {
      setConfigLoading(true);
      setConfigError(null);
      try {
        const res = await fetch(`/api/integrations/${connectorId}`);
        if (!res.ok) {
          if (res.status === 404) {
            // Connector not found in registry
            setConfig(null);
            setConfigLoading(false);
            return;
          }
          if (res.status === 401) {
            setConfigError("Autenticazione richiesta. Effettua il login per configurare i connettori.");
            setConfigLoading(false);
            return;
          }
          throw new Error(`Errore ${res.status}`);
        }
        const data: ConnectorApiResponse = await res.json();
        if (!cancelled) {
          setConfig(mapApiResponseToConfig(data));

          // If there's an existing connection (status not "disconnected"), hydrate wizard state.
          // The API returns status at top level: "connected", "error", "syncing", "disconnected".
          const isConnected = data.status && data.status !== "disconnected";
          if (isConnected) {
            // Mark auth as successful (user already authorized)
            setVerifyStatus("success");
            setVerifyMessage("Account gia autorizzato");

            // Load saved mappings from API if available
            // API returns: [{ entityId, fields: [{ source, target, confidence, aiSuggested }] }]
            const savedMappings = data.mappings as {
              entityId: string;
              fields: {
                source: string;
                target: string;
                confidence?: number;
                aiSuggested?: boolean;
              }[];
            }[] | undefined;

            if (savedMappings && savedMappings.length > 0) {
              const hydratedMappings: EntityMappings[] = savedMappings.map((sm) => {
                // Find entity name from config entities
                const entityMeta = data.entities?.find((e) => e.id === sm.entityId);
                return {
                  entityId: sm.entityId,
                  entityName: entityMeta?.name ?? sm.entityId,
                  mappings: sm.fields.map((f) => ({
                    sourceField: f.source,
                    targetField: f.target,
                    confidence: f.confidence ?? 0,
                    autoMapped: f.aiSuggested ?? false,
                  })),
                };
              });
              setEntityMappings(hydratedMappings);
              setSelectedEntities(savedMappings.map((m) => m.entityId));
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setConfigError(
            err instanceof Error
              ? err.message
              : "Errore nel caricamento della configurazione del connettore"
          );
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false);
        }
      }
    }

    fetchMetadata();
    return () => { cancelled = true; };
  }, [connectorId]);

  const ConnectorIcon = config ? ICON_MAP[config.icon] || Plug : Plug;

  // ─── Tab state ───
  // Initialize tab from URL query param (e.g. ?tab=sync from ConnectorCard "Gestisci")
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "sync" || tabParam === "mapping" || tabParam === "dati" || tabParam === "assistente") return tabParam;
    }
    return "setup";
  });

  // ─── Wizard state ───
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  // Step 1: entities
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);

  // Step 2: auth
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [verifyMessage, setVerifyMessage] = useState("");

  // Step 3: mapping
  const [entityMappings, setEntityMappings] = useState<EntityMappings[]>([]);

  // Step 4: frequency
  const [frequency, setFrequency] = useState<SyncFrequency>("hourly");

  // Page-level OAuth error banner (visible regardless of tab/step)
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);

  // Step 5: activate
  const [activateStatus, setActivateStatus] = useState<"idle" | "activating" | "success" | "error">("idle");
  const [activateError, setActivateError] = useState<string | null>(null);

  // ─── Derived data ───

  const selectedEntityData = useMemo(() => {
    if (!config) return [];
    return config.entities.filter((e) => selectedEntities.includes(e.id));
  }, [config, selectedEntities]);

  // Auto-generate mappings when entities change (intentional: user can edit after auto-generation)
  useEffect(() => {
    if (!config || selectedEntityData.length === 0) return;
    const newMappings = generateAutoMapping(selectedEntityData, config.targetFields);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntityMappings((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(newMappings)) return prev;
      return newMappings;
    });
  }, [config, selectedEntityData]);

  // Check URL params for OAuth callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("setup") === "complete") {
      // OAuth callback successful — update auth step status
      setVerifyStatus("success");
      setVerifyMessage("Account autorizzato con successo");
      // If we're on the auth step, auto-advance to next step
      if (step === 1) {
        setTimeout(() => goNext(), 800);
      }
    }
    if (params.get("oauth_error")) {
      const errorCode = params.get("oauth_error");
      const errorDesc = params.get("oauth_error_desc");

      // Map known error codes to user-friendly Italian messages
      const OAUTH_ERROR_MESSAGES: Record<string, string> = {
        not_authenticated: "Devi accedere prima di collegare un servizio.",
        invalid_state: "La sessione di autorizzazione è scaduta o non valida. Riprova.",
        token_exchange_failed: "Scambio token fallito. Riprova o contatta il supporto.",
        server_config: "OAuth non disponibile per questo connettore. Usa l'autenticazione via API Key.",
        expired_state: "Sessione scaduta. Riprova.",
        invalid_code: "Codice di autorizzazione scaduto. Riprova.",
        vault_unavailable: "Errore nel salvataggio credenziali. Riprova.",
        no_access_token: "Il provider non ha restituito un token. Riprova.",
      };

      const message = OAUTH_ERROR_MESSAGES[errorCode ?? ""] || errorDesc || `Errore OAuth: ${errorCode}`;

      // Show page-level banner (visible in all tabs)
      setOauthBanner(message);

      // Also update wizard auth step status for context
      setVerifyStatus("error");
      setVerifyMessage(message);
    }
    // Clean URL params
    if (params.has("setup") || params.has("oauth_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mapping stats
  const mappingStats = useMemo(() => {
    const allMappings = entityMappings.flatMap((e) => e.mappings);
    const mapped = allMappings.filter((m) => m.targetField !== "-- Ignora --");
    const auto = mapped.filter((m) => m.autoMapped);
    const manual = mapped.filter((m) => !m.autoMapped);
    const ignored = allMappings.filter((m) => m.targetField === "-- Ignora --");
    return { total: mapped.length, auto: auto.length, manual: manual.length, ignored: ignored.length };
  }, [entityMappings]);

  // ─── Handlers ───

  const handleToggleEntity = useCallback((entityId: string) => {
    setSelectedEntities((prev) =>
      prev.includes(entityId) ? prev.filter((e) => e !== entityId) : [...prev, entityId]
    );
  }, []);

  const handleToggleAll = useCallback(() => {
    if (!config) return;
    if (selectedEntities.length === config.entities.length) {
      setSelectedEntities([]);
    } else {
      setSelectedEntities(config.entities.map((e) => e.id));
    }
  }, [config, selectedEntities.length]);

  const handleVerify = useCallback(async () => {
    setVerifyStatus("verifying");
    setVerifyMessage("");
    try {
      const res = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorSource: connectorId,
          credentialType: "api_key",
          data: { api_key: apiKey, ...(secretKey ? { secret_key: secretKey } : {}) },
        }),
      });
      if (res.ok) {
        setVerifyStatus("success");
        setVerifyMessage("Connessione verificata con successo");
      } else {
        const data = await res.json().catch(() => ({}));
        setVerifyStatus("error");
        setVerifyMessage(data.error || "Verifica fallita. Controlla le credenziali.");
      }
    } catch {
      setVerifyStatus("error");
      setVerifyMessage("Errore di rete durante la verifica");
    }
  }, [connectorId, apiKey, secretKey]);

  const handleOAuthAuthorize = useCallback(() => {
    // Redirect to OAuth authorize endpoint
    window.location.href = `/api/integrations/${connectorId}/authorize`;
  }, [connectorId]);

  const handleUpdateMapping = useCallback(
    (entityId: string, sourceField: string, targetField: string) => {
      setEntityMappings((prev) =>
        prev.map((entity) =>
          entity.entityId === entityId
            ? {
                ...entity,
                mappings: entity.mappings.map((m) =>
                  m.sourceField === sourceField
                    ? { ...m, targetField, autoMapped: false, confidence: 100 }
                    : m
                ),
              }
            : entity
        )
      );
    },
    []
  );

  const handleActivate = useCallback(async () => {
    setActivateStatus("activating");
    setActivateError(null);
    try {
      // Use unified setup endpoint — creates connection + saves mappings + triggers sync
      const res = await fetch("/api/integrations/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId,
          connectorName: config?.name || connectorId,
          frequency,
          selectedEntities,
          mappings: entityMappings,
          triggerSync: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Errore nella configurazione del connettore");
      }

      const result = await res.json();
      console.log(
        `[Activate] ${result.connectorName} configured: ` +
          `${result.selectedEntities?.length} entities, ${result.mappingsCount} mappings`
      );

      setActivateStatus("success");
      toast.success(`${config?.name || "Connettore"} configurato con successo`);

      // Auto-switch to sync tab after successful activation
      setTimeout(() => {
        setActiveTab("sync");
      }, 1500);
    } catch (err) {
      console.error("[Activate] Error:", err);
      setActivateStatus("error");
      const errorMsg = err instanceof Error ? err.message : "Errore durante l'attivazione. Riprova.";
      setActivateError(errorMsg);
      toast.error(`Attivazione fallita: ${errorMsg}`);
    }
  }, [connectorId, config, frequency, selectedEntities, entityMappings, toast]);

  const goNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  }, [step]);

  const goToStep = useCallback(
    (targetStep: number) => {
      setDirection(targetStep > step ? 1 : -1);
      setStep(targetStep);
    },
    [step]
  );

  // ─── Can proceed? ───

  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        return selectedEntities.length > 0;
      case 1:
        return verifyStatus === "success";
      case 2:
        return entityMappings.length > 0;
      case 3:
        return true;
      case 4:
        return activateStatus !== "activating";
      default:
        return false;
    }
  }, [step, selectedEntities.length, verifyStatus, entityMappings.length, activateStatus]);

  // ─── Loading state ───

  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--accent)" }} />
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Caricamento configurazione connettore...
          </p>
        </div>
      </div>
    );
  }

  // ─── Error state ───

  if (configError) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--fg-primary)" }}>
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 pt-8">
          <Link
            href="/integrazione"
            className="inline-flex items-center gap-2 text-sm mb-6 transition-colors"
            style={{ color: "var(--fg-secondary)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Torna alle integrazioni
          </Link>
          <div
            className="flex items-center gap-3 p-4 rounded-xl text-sm"
            style={{
              background: "rgba(229, 141, 120, 0.1)",
              border: "1px solid rgba(229, 141, 120, 0.3)",
              color: "var(--error)",
            }}
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{configError}</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── Not found ───

  if (!config) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--fg-primary)" }}>
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 pt-8">
          <Link
            href="/integrazione"
            className="inline-flex items-center gap-2 text-sm mb-6 transition-colors"
            style={{ color: "var(--fg-secondary)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Torna alle integrazioni
          </Link>
          <h1 className="font-serif text-3xl" style={{ color: "var(--fg-primary)" }}>
            Connettore non trovato
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
            Il connettore &ldquo;{connectorId}&rdquo; non esiste.
          </p>
        </div>
      </div>
    );
  }

  // ─── Animation variants ───

  const slideVariants = {
    enter: (d: number) => ({
      x: d > 0 ? 40 : -40,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (d: number) => ({
      x: d > 0 ? -40 : 40,
      opacity: 0,
    }),
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-base)", color: "var(--fg-primary)" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b px-4 sm:px-6 py-4"
        style={{ background: "var(--bg-base)", borderColor: "var(--border-dark)" }}
      >
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link
            href="/integrazione"
            className="p-2 rounded-lg transition-colors hover-bg-overlay"
            style={{ color: "var(--fg-muted)" }}
            aria-label="Torna alle integrazioni"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
              style={{ background: "var(--bg-overlay)" }}
            >
              <ConnectorIcon className="w-4 h-4" style={{ color: "var(--fg-secondary)" }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate" style={{ color: "var(--fg-primary)" }}>
                {config.name}
              </h1>
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                {config.category}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* OAuth error banner */}
      <AnimatePresence>
        {oauthBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 sm:px-6"
            style={{ background: "var(--bg-base)" }}
          >
            <div
              className="max-w-5xl mx-auto mt-4 flex items-center gap-3 px-4 py-3 rounded-lg border"
              style={{
                background: "rgba(255, 107, 107, 0.08)",
                borderColor: "rgba(255, 107, 107, 0.25)",
              }}
            >
              <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: "#FF6B6B" }} />
              <p className="text-sm flex-1" style={{ color: "var(--fg-secondary)" }}>
                {oauthBanner}
              </p>
              <button
                onClick={() => setOauthBanner(null)}
                className="p-1 rounded transition-colors shrink-0 hover-color-primary"
                style={{ color: "var(--fg-muted)" }}
                aria-label="Chiudi"
              >
                &times;
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Bar */}
      <div className="border-b px-4 sm:px-6" style={{ borderColor: "var(--border-dark-subtle)" }}>
        <div className="max-w-5xl mx-auto flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-5 py-3.5 text-sm font-medium transition-colors"
              style={{
                color: activeTab === tab.id ? "var(--accent)" : "var(--fg-muted)",
              }}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="connector-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          {/* ═══ TAB 1: SETUP WIZARD ═══ */}
          {activeTab === "setup" && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="max-w-[680px] w-full mx-auto">
                {/* Stepper */}
                <WizardStepper currentStep={step} />

                {/* Step content */}
                <div
                  className="rounded-2xl p-6 sm:p-8"
                  style={{
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border-dark)",
                    minHeight: 400,
                  }}
                >
                  <AnimatePresence mode="wait" custom={direction}>
                    <motion.div
                      key={step}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {step === 0 && (
                        <EntitySelect
                          entities={config.entities}
                          selected={selectedEntities}
                          onToggle={handleToggleEntity}
                          onToggleAll={handleToggleAll}
                        />
                      )}

                      {step === 1 && (
                        <AuthStep
                          connectorName={config.name}
                          authMode={config.authMode}
                          supportsApiKey={config.supportsApiKey}
                          oauthAvailable={config.oauthAvailable}
                          oauthPermissions={config.oauthPermissions}
                          apiKeyLabel={config.apiKeyLabel}
                          secretKeyLabel={config.secretKeyLabel}
                          apiKeyPlaceholder={config.apiKeyPlaceholder}
                          secretKeyPlaceholder={config.secretKeyPlaceholder}
                          helpText={config.helpText}
                          apiKey={apiKey}
                          secretKey={secretKey}
                          onApiKeyChange={setApiKey}
                          onSecretKeyChange={setSecretKey}
                          onVerify={handleVerify}
                          verifyStatus={verifyStatus}
                          verifyMessage={verifyMessage}
                          onOAuthAuthorize={handleOAuthAuthorize}
                        />
                      )}

                      {step === 2 && (
                        <FieldMappingStep
                          entityMappings={entityMappings}
                          targetFieldOptions={config.targetFields}
                          onUpdateMapping={handleUpdateMapping}
                        />
                      )}

                      {step === 3 && (
                        <FrequencyStep selected={frequency} onChange={setFrequency} />
                      )}

                      {step === 4 && (
                        <ReviewStep
                          connectorName={config.name}
                          connectorCategory={config.category}
                          connectorIcon={ConnectorIcon}
                          selectedEntities={selectedEntityData}
                          mappedFieldsCount={mappingStats.total}
                          autoMappedCount={mappingStats.auto}
                          manualMappedCount={mappingStats.manual}
                          ignoredFieldsCount={mappingStats.ignored}
                          frequency={frequency}
                          activateStatus={activateStatus}
                          activateError={activateError}
                          onActivate={handleActivate}
                          onGoToStep={goToStep}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Navigation bar */}
                <div
                  className="flex items-center justify-between pt-6 mt-6"
                  style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
                >
                  {step > 0 ? (
                    <button
                      onClick={goBack}
                      className="flex items-center gap-2 text-sm transition-colors hover-color-primary"
                      style={{ color: "var(--fg-secondary)" }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Indietro
                    </button>
                  ) : (
                    <div />
                  )}

                  {step < STEPS.length - 1 && (
                    <button
                      onClick={goNext}
                      disabled={!canProceed}
                      className="flex items-center gap-2 rounded-xl py-2.5 px-6 text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                      style={{ background: "var(--accent)" }}
                    >
                      Avanti
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ TAB 2: SINCRONIZZAZIONE ═══ */}
          {activeTab === "sync" && (
            <motion.div
              key="sync"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ConnectorSyncTab connectorId={connectorId} connectorName={config.name} />
            </motion.div>
          )}

          {/* ═══ TAB 3: MAPPATURA ═══ */}
          {activeTab === "mapping" && (
            <motion.div
              key="mapping"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ConnectorMappingTab
                config={config}
                entityMappings={entityMappings}
                onUpdateMapping={handleUpdateMapping}
              />
            </motion.div>
          )}

          {/* ═══ TAB 4: DATI (Records Viewer) ═══ */}
          {activeTab === "dati" && (
            <motion.div
              key="dati"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ConnectorDataTab connectorId={connectorId} connectorName={config.name} />
            </motion.div>
          )}

          {/* ═══ TAB 5: ASSISTENTE AI ═══ */}
          {activeTab === "assistente" && (
            <motion.div
              key="assistente"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <IntegrationAgentChat
                connectorType={config.name}
                onConfigReady={(agentConfig) => {
                  console.log("[AgentChat] Config ready:", agentConfig);
                  // Switch to setup tab after config is ready
                  setActiveTab("setup");
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 2: SYNC DASHBOARD (per-connector)
// ═══════════════════════════════════════════════

function ConnectorSyncTab({
  connectorId,
  connectorName,
}: {
  connectorId: string;
  connectorName: string;
}) {
  const toast = useToast();
  const [syncData, setSyncData] = useState<ConnectorSyncData>({
    status: "disconnected",
    lastSync: null,
    nextSync: null,
    totalRecords: 0,
    history: [],
    errors: [],
  });
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [pauseLoading, setPauseLoading] = useState(false);
  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const [supervisorMessages, setSupervisorMessages] = useState<SupervisorMessage[]>([]);
  const [syncProgress, setSyncProgressData] = useState<Partial<SyncProgressData> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);

  // Load real connection data from API
  // The GET /api/integrations/[connectorId] returns fields at the top level
  // (status, lastSync, totalRecords, syncHistory, errors) — NOT nested inside "connection".
  const loadConnectionData = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/${connectorId}`);
      if (!res.ok) {
        // No data yet — keep defaults (empty arrays, disconnected)
        setLoading(false);
        return;
      }
      const data = await res.json();

      // Map API syncHistory response ({ date, success, failed }) to our SyncHistoryDay
      const history: SyncHistoryDay[] = (data.syncHistory || []).map(
        (h: { date: string; success?: number; failed?: number }) => ({
          date: h.date,
          success: h.success ?? 0,
          failed: h.failed ?? 0,
        })
      );

      const errors: SyncErrorEntry[] = (data.errors || []).map(
        (e: { id?: string; message: string; timestamp: string; details?: string; affectedRecords?: number }) => ({
          id: e.id || crypto.randomUUID(),
          timestamp: e.timestamp,
          message: e.message,
          affectedRecords: e.affectedRecords ?? 0,
          details: e.details,
        })
      );

      // API returns status at top level: "connected", "error", "syncing", "disconnected"
      const statusMap: Record<string, ConnectorSyncData["status"]> = {
        connected: "synced",
        active: "synced",
        error: "error",
        syncing: "syncing",
        paused: "paused",
      };

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncData({
        status: statusMap[data.status] || "disconnected",
        lastSync: data.lastSync || null,
        nextSync: data.nextSync || null,
        totalRecords: data.totalRecords ?? 0,
        history,
        errors,
      });
    } catch {
      // Network error — keep defaults
    } finally {
      setLoading(false);
    }
  }, [connectorId]);

  useEffect(() => {
    loadConnectionData();
  }, [loadConnectionData]);

  // Real-time polling: 3s during syncing, 30s otherwise
  useEffect(() => {
    const isSyncing = syncData.status === "syncing" || syncing;
    const interval = isSyncing ? 3000 : 30000;

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadConnectionData(), interval);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [syncData.status, syncing, loadConnectionData]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    setShowSyncProgress(true);
    setSupervisorMessages([]);
    setSyncProgressData(null);
    toast.info(`Sincronizzazione ${connectorName} avviata...`);

    // Abort any previous SSE connection
    if (sseAbortRef.current) {
      sseAbortRef.current.abort();
    }
    const abortController = new AbortController();
    sseAbortRef.current = abortController;

    try {
      const res = await fetch(`/api/integrations/${connectorId}/sync?stream=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        signal: abortController.signal,
      });

      // If the response is not a stream (no SSE support), fall back to JSON
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const data = await res.json();
        if (!res.ok) {
          let errorMsg = data.error || "Errore durante la sincronizzazione";
          if (errorMsg.includes("required scopes") || errorMsg.includes("granted all required scopes")) {
            errorMsg = "La Private App HubSpot non ha i permessi necessari. " +
              "Vai su HubSpot \u2192 Settings \u2192 Integrations \u2192 Private Apps \u2192 Scopes e abilita: " +
              "crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read. " +
              "Dopo il salvataggio, aggiorna il token nel wizard.";
          }
          setSyncError(errorMsg);
          setShowSyncProgress(false);
          toast.error(`Sync fallita: ${errorMsg.slice(0, 80)}${errorMsg.length > 80 ? "..." : ""}`);
        } else if (data.itemCount === 0) {
          const msg = "Sync completata ma 0 record trovati. Verifica che l'account abbia dati o che i permessi API siano corretti.";
          setSyncError(msg);
          setShowSyncProgress(false);
          toast.warning("Nessun record trovato nella sincronizzazione");
        } else {
          await loadConnectionData();
          toast.success(`Sync completata: ${data.itemCount?.toLocaleString("it-IT") ?? ""} documenti importati`);
        }
        setSyncing(false);
        return;
      }

      // SSE stream — parse events
      const reader = res.body?.getReader();
      if (!reader) {
        setSyncError("Errore: stream non disponibile");
        setShowSyncProgress(false);
        setSyncing(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          if (!block.trim()) continue;
          const eventMatch = block.match(/^event: (.+)$/m);
          const dataMatch = block.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const eventType = eventMatch[1];
          let eventData: Record<string, unknown>;
          try {
            eventData = JSON.parse(dataMatch[1]);
          } catch {
            continue;
          }

          if (eventType === "supervisor") {
            setSupervisorMessages((prev) => [
              ...prev,
              {
                message: (eventData.message as string) || "",
                severity: (eventData.severity as SupervisorMessage["severity"]) || "info",
                suggestion: eventData.suggestion as string | undefined,
                timestamp: new Date(),
              },
            ]);
          } else if (eventType === "progress") {
            setSyncProgressData({
              stage: (eventData.stage as SyncProgressData["stage"]) || "fetching",
              progress: (eventData.progress as number) || 0,
              recordsSynced: (eventData.recordsProcessed as number) || 0,
              recordsTotal: (eventData.recordsTotal as number) || 0,
            });
          } else if (eventType === "complete") {
            const itemsFetched = (eventData.itemsFetched as number) || 0;
            await loadConnectionData();
            if (itemsFetched > 0) {
              toast.success(`Sync completata: ${itemsFetched.toLocaleString("it-IT")} documenti importati`);
            } else {
              toast.warning("Sincronizzazione completata senza nuovi record");
            }
          } else if (eventType === "done") {
            setSyncing(false);
            setShowSyncProgress(false);
          }
        }
      }

      // Stream ended without a "done" event
      setSyncing(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — handled by handleSyncCancel
        return;
      }
      setSyncError("Errore di rete");
      setShowSyncProgress(false);
      toast.error("Errore di rete durante la sincronizzazione");
      setSyncing(false);
    }
  }, [connectorId, connectorName, loadConnectionData, toast]);

  const handleSyncComplete = useCallback((completedData: SyncProgressData) => {
    setShowSyncProgress(false);
    setSyncing(false);
    loadConnectionData();
    if (completedData.recordsSynced > 0) {
      toast.success(
        `Sync completata: ${completedData.recordsSynced.toLocaleString("it-IT")} documenti importati`
      );
    }
  }, [loadConnectionData, toast]);

  const handleSyncCancel = useCallback(() => {
    // Abort SSE stream if active
    if (sseAbortRef.current) {
      sseAbortRef.current.abort();
      sseAbortRef.current = null;
    }
    setShowSyncProgress(false);
    setSyncing(false);
    toast.warning("Sincronizzazione annullata");
  }, [toast]);

  const handlePauseResume = useCallback(async () => {
    setPauseLoading(true);
    setSyncError(null);
    const action = syncData.status === "paused" ? "resume" : "pause";
    try {
      const res = await fetch(`/api/integrations/${connectorId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error || `Errore durante ${action === "pause" ? "la pausa" : "la ripresa"}`;
        setSyncError(errorMsg);
        toast.error(errorMsg);
      } else {
        // Refresh sync data to reflect new status
        await loadConnectionData();
        toast.info(action === "pause"
          ? `${connectorName}: sincronizzazione in pausa`
          : `${connectorName}: sincronizzazione ripresa`
        );
      }
    } catch {
      setSyncError("Errore di rete");
      toast.error("Errore di rete");
    } finally {
      setPauseLoading(false);
    }
  }, [connectorId, connectorName, syncData.status, loadConnectionData, toast]);

  const toggleError = useCallback((id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const maxRecords = Math.max(...syncData.history.map((d) => d.success + d.failed), 1);

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    synced: { label: "Sincronizzato", color: "var(--success)", bg: "rgba(93, 228, 199, 0.15)" },
    disconnected: { label: "Non configurato", color: "var(--fg-muted)", bg: "var(--bg-overlay)" },
    error: { label: "Errore", color: "var(--error)", bg: "rgba(229, 141, 120, 0.15)" },
    syncing: { label: "In sync...", color: "var(--info-bright)", bg: "rgba(137, 221, 255, 0.15)" },
    paused: { label: "In pausa", color: "var(--caution)", bg: "rgba(255, 250, 194, 0.15)" },
  };
  const sc = statusConfig[syncData.status] || statusConfig.disconnected;

  if (loading) {
    return <ConnectorSyncSkeleton />;
  }

  return (
    <div>
      {/* SyncProgress — shown during active sync */}
      <AnimatePresence>
        {(showSyncProgress || syncData.status === "syncing") && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <SyncProgress
              connectorId={connectorId}
              active={showSyncProgress || syncData.status === "syncing"}
              onComplete={handleSyncComplete}
              onCancel={handleSyncCancel}
              initialData={syncProgress ?? undefined}
              supervisorMessages={supervisorMessages}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state — typed error handling */}
      {syncData.status === "error" && syncData.errors.length > 0 && !syncError && (
        <div className="mb-4">
          <ErrorState
            error={{
              type: syncData.errors[0]?.message?.includes("token") || syncData.errors[0]?.message?.includes("401")
                ? "auth_expired"
                : syncData.errors[0]?.message?.includes("429") || syncData.errors[0]?.message?.includes("rate")
                  ? "rate_limited"
                  : "sync_failed",
              message: syncData.errors[0]?.message,
              connectorId,
              retryAfterSeconds: syncData.errors[0]?.message?.includes("429") ? 300 : undefined,
            }}
            onRetry={handleSync}
            onReconnect={() => window.location.href = `/api/integrations/${connectorId}/authorize`}
            compact
          />
        </div>
      )}

      {/* Connection status badge */}
      <div className="flex items-center justify-between mb-4">
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium"
          style={{ background: sc.bg, color: sc.color }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: sc.color }} />
          {sc.label}
        </div>

        {/* Pause / Resume button — only visible when connection is active or paused */}
        {(syncData.status === "synced" || syncData.status === "paused") && (
          <button
            onClick={handlePauseResume}
            disabled={pauseLoading}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all hover:scale-[1.02] disabled:opacity-60"
            style={{
              background: syncData.status === "paused" ? "rgba(93, 228, 199, 0.15)" : "rgba(255, 250, 194, 0.15)",
              color: syncData.status === "paused" ? "var(--success)" : "var(--caution)",
              border: `1px solid ${syncData.status === "paused" ? "rgba(93, 228, 199, 0.3)" : "rgba(255, 250, 194, 0.3)"}`,
            }}
          >
            {pauseLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : syncData.status === "paused" ? (
              <Play className="w-4 h-4" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
            {syncData.status === "paused" ? "Riprendi" : "Pausa"}
          </button>
        )}
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Ultimo sync" value={formatDateTime(syncData.lastSync)} />
        <StatCard label="Prossimo sync" value={formatDateTime(syncData.nextSync)} />
        <StatCard
          label="Record sincronizzati"
          value={syncData.totalRecords.toLocaleString("it-IT")}
          highlight
        />
        <StatCard
          label="Errori"
          value={syncData.errors.length.toString()}
          isError={syncData.errors.length > 0}
        />
      </div>

      {/* Sync error banner */}
      {syncError && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl mb-4 text-sm"
          style={{
            background: "rgba(229, 141, 120, 0.15)",
            border: "1px solid rgba(229, 141, 120, 0.3)",
            color: "var(--error)",
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {/* Manual sync button + title */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold" style={{ color: "var(--fg-primary)" }}>
          Storico sincronizzazione
        </h3>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-70"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark, #E85A24))" }}
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizzazione..." : "Sincronizza Ora"}
        </button>
      </div>

      {/* Bar chart — last 7 days */}
      {syncData.history.length > 0 ? (
        <div
          className="rounded-xl p-5 mb-6"
          style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
        >
          <div className="flex items-end gap-2 h-40">
            {syncData.history.map((day, idx) => {
              const total = day.success + day.failed;
              const successPct = (day.success / maxRecords) * 100;
              const failedPct = (day.failed / maxRecords) * 100;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] font-mono" style={{ color: "var(--fg-invisible)" }}>
                    {total > 0 ? total.toLocaleString("it-IT") : ""}
                  </div>
                  <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                    {day.failed > 0 && (
                      <div
                        className="w-full rounded-t-sm mb-px"
                        style={{
                          height: `${Math.max(failedPct, 3)}%`,
                          background: "var(--error)",
                          opacity: 0.8,
                        }}
                      />
                    )}
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${Math.max(successPct, 3)}%`,
                        background: day.failed > 0 ? "var(--success)" : "var(--accent)",
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                    {formatDateShort(day.date)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: "1px solid var(--border-dark-subtle)" }}>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--fg-muted)" }}>
              <div className="w-3 h-3 rounded-sm" style={{ background: "var(--accent)", opacity: 0.8 }} />
              Completati
            </div>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--fg-muted)" }}>
              <div className="w-3 h-3 rounded-sm" style={{ background: "var(--error)", opacity: 0.8 }} />
              Falliti
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl mb-6"
          style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
        >
          <NoSyncHistory onStartSync={handleSync} />
        </div>
      )}

      {/* Error log */}
      <div>
        <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--fg-primary)" }}>
          Log Errori
          {syncData.errors.length > 0 && (
            <span
              className="ml-2 text-xs px-2 py-0.5 rounded-full"
              style={{ background: "rgba(229, 141, 120, 0.15)", color: "var(--error)" }}
            >
              {syncData.errors.length}
            </span>
          )}
        </h3>

        {syncData.errors.length === 0 ? (
          <div
            className="rounded-xl p-6 text-center"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
          >
            <CheckCircle className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--success)" }} />
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
              Nessun errore. Tutto funziona correttamente.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {syncData.errors.map((err) => {
              const isExpanded = expandedErrors.has(err.id);
              return (
                <div
                  key={err.id}
                  className="rounded-lg overflow-hidden"
                  style={{
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-dark-subtle)",
                  }}
                >
                  <button
                    onClick={() => toggleError(err.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "var(--error)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--fg-invisible)" }}>
                        <span className="font-mono">{formatDateTime(err.timestamp)}</span>
                        <span>&middot;</span>
                        <span>{err.affectedRecords} record</span>
                      </div>
                      <p className="text-sm mt-0.5 truncate" style={{ color: "var(--error)" }}>
                        {err.message}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "var(--fg-muted)" }} />
                    ) : (
                      <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--fg-muted)" }} />
                    )}
                  </button>

                  <AnimatePresence>
                    {isExpanded && err.details && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <pre
                          className="mx-4 mb-4 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap"
                          style={{
                            background: "var(--bg-base)",
                            border: "1px solid var(--border-dark-subtle)",
                            color: "var(--fg-muted)",
                            fontFamily: "monospace",
                          }}
                        >
                          {err.details}
                        </pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  isError,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  isError?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-4 text-center"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      <div
        className="text-xl font-bold"
        style={{
          color: isError ? "var(--error)" : highlight ? "var(--accent)" : "var(--fg-primary)",
        }}
      >
        {value}
      </div>
      <div className="text-[11px] mt-1" style={{ color: "var(--fg-muted)" }}>
        {label}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 3: MAPPING EDITOR (full page version)
// ═══════════════════════════════════════════════

function ConnectorMappingTab({
  config,
  entityMappings,
  onUpdateMapping,
}: {
  config: ConnectorConfig;
  entityMappings: EntityMappings[];
  onUpdateMapping: (entityId: string, sourceField: string, targetField: string) => void;
}) {
  const [activeEntity, setActiveEntity] = useState(entityMappings[0]?.entityId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const currentMapping = entityMappings.find((m) => m.entityId === activeEntity);

  const totalFields = entityMappings.reduce((sum, m) => sum + m.mappings.length, 0);
  const autoMapped = entityMappings.reduce(
    (sum, m) => sum + m.mappings.filter((f) => f.autoMapped && f.targetField !== "-- Ignora --").length,
    0
  );
  const avgConfidence = useMemo(() => {
    const fields = entityMappings.flatMap((m) => m.mappings.filter((f) => f.confidence > 0));
    if (fields.length === 0) return 0;
    return Math.round(fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length);
  }, [entityMappings]);

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Transform EntityMappings[] to the API-expected format:
      // { mappings: [{ entityId, fields: [{ source, target, confidence, aiSuggested }] }] }
      const apiMappings = entityMappings.map((em) => ({
        entityId: em.entityId,
        fields: em.mappings.map((m) => ({
          source: m.sourceField,
          target: m.targetField,
          confidence: m.confidence,
          aiSuggested: m.autoMapped,
        })),
      }));

      const res = await fetch(`/api/integrations/${config.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: apiMappings }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Errore nel salvataggio della mappatura");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Errore di rete durante il salvataggio");
    } finally {
      setSaving(false);
    }
  }, [config.id, entityMappings]);

  // If no mappings yet (entities not selected in wizard)
  if (entityMappings.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
      >
        <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--fg-muted)" }} />
        <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
          Seleziona le entita nel tab Setup per configurare la mappatura dei campi.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--fg-primary)" }}>
            Mappatura Campi
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--fg-secondary)" }}>
            {config.name} &rarr; Controlla.me
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-70"
          style={{
            background: saved
              ? "var(--success)"
              : "linear-gradient(135deg, var(--accent), var(--accent-dark, #E85A24))",
          }}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvataggio...
            </>
          ) : saved ? (
            <>
              <Check className="w-4 h-4" />
              Salvato
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salva
            </>
          )}
        </button>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl mb-4 text-sm"
          style={{
            background: "rgba(229, 141, 120, 0.1)",
            border: "1px solid rgba(229, 141, 120, 0.3)",
            color: "var(--error)",
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* AI banner */}
      <div
        className="flex items-center gap-3 p-4 rounded-xl mb-5 text-sm"
        style={{
          background: "rgba(173, 215, 255, 0.1)",
          border: "1px solid rgba(173, 215, 255, 0.2)",
          color: "var(--info)",
        }}
      >
        <Sparkles className="w-5 h-5 shrink-0" />
        <span>
          {autoMapped}/{totalFields} campi mappati automaticamente dall&apos;AI.
          Confidenza media: {avgConfidence}%. Verifica i campi evidenziati.
        </span>
      </div>

      {/* Entity tabs */}
      {entityMappings.length > 1 && (
        <div className="flex gap-0 mb-5 border-b" style={{ borderColor: "var(--border-dark-subtle)" }}>
          {entityMappings.map((m) => (
            <button
              key={m.entityId}
              onClick={() => setActiveEntity(m.entityId)}
              className="px-4 py-2.5 text-sm transition-colors relative"
              style={{
                color: activeEntity === m.entityId ? "var(--accent)" : "var(--fg-muted)",
                fontWeight: activeEntity === m.entityId ? 500 : 400,
              }}
            >
              {m.entityName} ({m.mappings.length})
              {activeEntity === m.entityId && (
                <motion.div
                  layoutId="full-mapping-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Two-column mapping table */}
      {currentMapping && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
        >
          {/* Column headers */}
          <div
            className="grid grid-cols-[1fr_32px_1fr_56px] gap-2 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              color: "var(--fg-invisible)",
              background: "var(--bg-overlay)",
              borderBottom: "1px solid var(--border-dark-subtle)",
            }}
          >
            <span>Campo Sorgente</span>
            <span />
            <span>Campo Destinazione</span>
            <span className="text-right">Conf.</span>
          </div>

          {/* Mapping rows */}
          {currentMapping.mappings.map((mapping, idx) => {
            const isIgnored = mapping.targetField === "-- Ignora --";
            const confColor = confidenceColor(mapping.confidence);

            return (
              <div
                key={mapping.sourceField}
                className="grid grid-cols-[1fr_32px_1fr_56px] gap-2 items-center px-5 py-3.5"
                style={{
                  opacity: isIgnored ? 0.5 : 1,
                  borderBottom:
                    idx < currentMapping.mappings.length - 1
                      ? "1px solid var(--border-dark-subtle)"
                      : "none",
                }}
              >
                {/* Source field block */}
                <div
                  className="rounded-lg px-3 py-2"
                  style={{
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-dark-subtle)",
                  }}
                >
                  <div className="text-sm font-mono truncate" style={{ color: "var(--fg-primary)" }}>
                    {mapping.sourceField}
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center">
                  <ArrowRight
                    className="w-4 h-4"
                    style={{
                      color: isIgnored
                        ? "var(--fg-invisible)"
                        : mapping.confidence >= 90
                        ? "var(--success)"
                        : mapping.confidence >= 70
                        ? "var(--caution)"
                        : "var(--error)",
                    }}
                  />
                </div>

                {/* Target dropdown */}
                <div className="relative">
                  <select
                    value={mapping.targetField}
                    onChange={(e) =>
                      onUpdateMapping(currentMapping.entityId, mapping.sourceField, e.target.value)
                    }
                    className="w-full text-sm px-3 py-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 cursor-pointer appearance-none"
                    style={{
                      background: "var(--bg-base)",
                      color: "var(--fg-primary)",
                      border: "1px solid var(--border-dark-subtle)",
                    }}
                  >
                    <option value="-- Ignora --">-- Ignora --</option>
                    <option value="-- Nuovo campo --">-- Nuovo campo --</option>
                    {config.targetFields.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {mapping.autoMapped && mapping.targetField !== "-- Ignora --" && (
                    <span
                      className="absolute -top-1.5 right-2 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: "rgba(173, 215, 255, 0.15)", color: "var(--info)" }}
                    >
                      AI
                    </span>
                  )}
                </div>

                {/* Confidence + status */}
                <div className="flex items-center justify-end gap-1">
                  {mapping.confidence > 0 ? (
                    <>
                      <span className="text-xs font-mono" style={{ color: confColor }}>
                        {mapping.confidence}%
                      </span>
                      {mapping.confidence >= 90 ? (
                        <CheckCircle className="w-3.5 h-3.5" style={{ color: confColor }} />
                      ) : mapping.confidence >= 70 ? (
                        <AlertCircle className="w-3.5 h-3.5" style={{ color: confColor }} />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" style={{ color: confColor }} />
                      )}
                    </>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--fg-invisible)" }}>
                      --
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 4: DATA VIEWER (records from crm_records)
// ═══════════════════════════════════════════════

interface CrmRecord {
  id: string;
  external_id: string;
  object_type: string;
  data: Record<string, unknown>;
  mapped_fields: Record<string, unknown>;
  synced_at: string;
}

interface RecordsApiResponse {
  records: CrmRecord[];
  total: number;
  page: number;
  pageSize: number;
  breakdown: Record<string, number>;
}

function ConnectorDataTab({
  connectorId,
  connectorName,
}: {
  connectorId: string;
  connectorName: string;
}) {
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [objectTypeFilter, setObjectTypeFilter] = useState<string | null>(null);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Push state
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushTarget, setPushTarget] = useState("");
  const [pushTargetEntity, setPushTargetEntity] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{
    success: boolean;
    created?: number;
    updated?: number;
    failed?: number;
    errors?: string[];
  } | null>(null);

  // Fetch records
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (objectTypeFilter) params.set("objectType", objectTypeFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/integrations/${connectorId}/records?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Errore ${res.status}`);
      }
      const data: RecordsApiResponse = await res.json();
      setRecords(data.records);
      setTotal(data.total);
      setBreakdown(data.breakdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dei record");
    } finally {
      setLoading(false);
    }
  }, [connectorId, page, pageSize, objectTypeFilter, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Search on Enter
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        setSearch(searchInput);
        setPage(1);
      }
    },
    [searchInput]
  );

  const handleSearchClear = useCallback(() => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, []);

  // Filter by entity type
  const handleFilterType = useCallback((type: string | null) => {
    setObjectTypeFilter(type);
    setPage(1);
  }, []);

  // Toggle record expansion
  const toggleRecord = useCallback((id: string) => {
    setExpandedRecord((prev) => (prev === id ? null : id));
  }, []);

  // CSV export
  const handleExportCsv = useCallback(async () => {
    setExporting(true);
    try {
      // Fetch ALL records (up to 10000) for export
      const params = new URLSearchParams({ page: "1", pageSize: "10000" });
      if (objectTypeFilter) params.set("objectType", objectTypeFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/integrations/${connectorId}/records?${params}`);
      if (!res.ok) throw new Error("Export fallito");
      const data: RecordsApiResponse = await res.json();

      if (data.records.length === 0) return;

      // Collect all unique data keys
      const allKeys = new Set<string>();
      data.records.forEach((r) => {
        Object.keys(r.data || {}).forEach((k) => allKeys.add(k));
      });
      const dataKeys = Array.from(allKeys).sort();

      // Build CSV
      const headers = ["external_id", "object_type", "synced_at", ...dataKeys];
      const csvRows = [headers.join(",")];

      data.records.forEach((r) => {
        const row = [
          csvEscape(r.external_id),
          csvEscape(r.object_type),
          csvEscape(r.synced_at),
          ...dataKeys.map((k) => csvEscape(String(r.data?.[k] ?? ""))),
        ];
        csvRows.push(row.join(","));
      });

      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${connectorId}-records-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Errore durante l'export CSV");
    } finally {
      setExporting(false);
    }
  }, [connectorId, objectTypeFilter, search]);

  // Toggle record selection
  const toggleRecordSelection = useCallback((id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedRecordIds.size === records.length) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(records.map((r) => r.id)));
    }
  }, [records, selectedRecordIds.size]);

  // Push handler
  const handlePush = useCallback(async () => {
    if (!pushTarget || selectedRecordIds.size === 0) return;
    setPushing(true);
    setPushResult(null);
    try {
      const res = await fetch(`/api/integrations/${pushTarget}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceConnectorId: connectorId,
          entityType: objectTypeFilter || records[0]?.object_type || "contact",
          targetEntityType: pushTargetEntity || undefined,
          recordIds: Array.from(selectedRecordIds),
        }),
      });
      const data = await res.json();
      setPushResult({
        success: data.success ?? false,
        created: data.pushResult?.created,
        updated: data.pushResult?.updated,
        failed: data.pushResult?.failed,
        errors: data.errors,
      });
    } catch {
      setPushResult({ success: false, errors: ["Errore di rete durante il push"] });
    } finally {
      setPushing(false);
    }
  }, [pushTarget, pushTargetEntity, selectedRecordIds, connectorId, objectTypeFilter, records]);

  const totalRecords = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const totalPages = Math.ceil(total / pageSize);

  // Extract display fields from a record's data
  const getDisplayValue = (data: Record<string, unknown>, key: string): string => {
    const val = data[key];
    if (val === null || val === undefined) return "--";
    if (typeof val === "object") return JSON.stringify(val).slice(0, 80);
    return String(val);
  };

  // Get primary display fields for table
  const primaryFields = useMemo(() => {
    const fieldCounts: Record<string, number> = {};
    records.forEach((r) => {
      Object.keys(r.data || {}).forEach((k) => {
        fieldCounts[k] = (fieldCounts[k] || 0) + 1;
      });
    });
    // Pick top 4 most common fields (skip very internal ones)
    return Object.entries(fieldCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)
      .filter((k) => !k.startsWith("hs_") && !k.startsWith("_"))
      .slice(0, 4);
  }, [records]);

  if (loading && records.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--fg-muted)" }} />
        <span className="ml-3 text-sm" style={{ color: "var(--fg-muted)" }}>Caricamento record...</span>
      </div>
    );
  }

  if (error && records.length === 0) {
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-xl text-sm"
        style={{
          background: "rgba(229, 141, 120, 0.1)",
          border: "1px solid rgba(229, 141, 120, 0.3)",
          color: "var(--error)",
        }}
      >
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div>
      {/* Header with total + export */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--fg-primary)" }}>
            Record Sincronizzati
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--fg-secondary)" }}>
            {totalRecords.toLocaleString("it-IT")} record da {connectorName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Push button — visible when records are selected */}
          {selectedRecordIds.size > 0 && (
            <button
              onClick={() => setShowPushModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02]"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark, #E85A24))" }}
            >
              <Send className="w-4 h-4" />
              Invia {selectedRecordIds.size} record...
            </button>
          )}
          <button
            onClick={handleExportCsv}
            disabled={exporting || totalRecords === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-secondary)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Esporta CSV
          </button>
        </div>
      </div>

      {/* Entity breakdown pills */}
      {Object.keys(breakdown).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleFilterType(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: !objectTypeFilter
                ? "rgba(255, 107, 53, 0.15)"
                : "var(--bg-overlay)",
              color: !objectTypeFilter ? "var(--accent)" : "var(--fg-muted)",
              border: `1px solid ${!objectTypeFilter ? "rgba(255, 107, 53, 0.3)" : "var(--border-dark-subtle)"}`,
            }}
          >
            <Database className="w-3 h-3" />
            Tutti ({totalRecords})
          </button>
          {Object.entries(breakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <button
                key={type}
                onClick={() => handleFilterType(objectTypeFilter === type ? null : type)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background:
                    objectTypeFilter === type
                      ? "rgba(255, 107, 53, 0.15)"
                      : "var(--bg-overlay)",
                  color: objectTypeFilter === type ? "var(--accent)" : "var(--fg-muted)",
                  border: `1px solid ${objectTypeFilter === type ? "rgba(255, 107, 53, 0.3)" : "var(--border-dark-subtle)"}`,
                }}
              >
                {entityTypeLabel(type)} ({count})
              </button>
            ))}
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: "var(--fg-muted)" }}
        />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Cerca per nome, email, azienda... (Invio per cercare)"
          className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
          style={{
            background: "var(--bg-raised)",
            color: "var(--fg-primary)",
            border: "1px solid var(--border-dark-subtle)",
          }}
        />
        {searchInput && (
          <button
            onClick={handleSearchClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded transition-colors"
            style={{ color: "var(--fg-muted)" }}
          >
            &times;
          </button>
        )}
      </div>

      {/* Error banner (for non-blocking errors) */}
      {error && (
        <div
          className="flex items-center gap-3 p-3 rounded-xl mb-4 text-sm"
          style={{
            background: "rgba(229, 141, 120, 0.1)",
            border: "1px solid rgba(229, 141, 120, 0.3)",
            color: "var(--error)",
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Records table */}
      {records.length === 0 ? (
        search ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
          >
            <Database className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--fg-muted)" }} />
            <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
              Nessun record trovato per &ldquo;{search}&rdquo;
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
          >
            <NoRecords />
          </div>
        )
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
        >
          {/* Table header */}
          <div
            className="grid gap-2 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider items-center"
            style={{
              gridTemplateColumns: `28px 40px 120px ${primaryFields.map(() => "1fr").join(" ")} 100px 40px`,
              color: "var(--fg-invisible)",
              background: "var(--bg-overlay)",
              borderBottom: "1px solid var(--border-dark-subtle)",
            }}
          >
            <input
              type="checkbox"
              checked={selectedRecordIds.size === records.length && records.length > 0}
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[#FF6B35]"
            />
            <span>#</span>
            <span>Tipo</span>
            {primaryFields.map((f) => (
              <span key={f} className="truncate">{f}</span>
            ))}
            <span>Sync</span>
            <span />
          </div>

          {/* Table rows */}
          {records.map((record, idx) => {
            const isExpanded = expandedRecord === record.id;
            return (
              <div key={record.id}>
                <div
                  className="w-full grid gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-overlay)] items-center cursor-pointer"
                  style={{
                    gridTemplateColumns: `28px 40px 120px ${primaryFields.map(() => "1fr").join(" ")} 100px 40px`,
                    borderBottom: isExpanded ? "none" : "1px solid var(--border-dark-subtle)",
                  }}
                  onClick={() => toggleRecord(record.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedRecordIds.has(record.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleRecordSelection(record.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-3.5 h-3.5 rounded cursor-pointer accent-[#FF6B35]"
                  />
                  <span className="text-xs font-mono" style={{ color: "var(--fg-invisible)" }}>
                    {(page - 1) * pageSize + idx + 1}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full truncate text-center"
                    style={{
                      background: entityTypeColor(record.object_type).bg,
                      color: entityTypeColor(record.object_type).fg,
                    }}
                  >
                    {entityTypeLabel(record.object_type)}
                  </span>
                  {primaryFields.map((f) => (
                    <span
                      key={f}
                      className="text-sm truncate"
                      style={{ color: "var(--fg-primary)" }}
                    >
                      {getDisplayValue(record.data, f)}
                    </span>
                  ))}
                  <span className="text-xs font-mono" style={{ color: "var(--fg-muted)" }}>
                    {formatDateTime(record.synced_at)}
                  </span>
                  <span className="flex justify-center">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" style={{ color: "var(--fg-muted)" }} />
                    ) : (
                      <Eye className="w-4 h-4" style={{ color: "var(--fg-muted)" }} />
                    )}
                  </span>
                </div>

                {/* Expanded record detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="mx-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                      >
                        {/* Raw data */}
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-muted)" }}>
                            Dati Originali
                          </h4>
                          <pre
                            className="p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto"
                            style={{
                              background: "var(--bg-base)",
                              border: "1px solid var(--border-dark-subtle)",
                              color: "var(--fg-secondary)",
                              fontFamily: "monospace",
                            }}
                          >
                            {JSON.stringify(record.data, null, 2)}
                          </pre>
                        </div>

                        {/* Mapped fields */}
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-muted)" }}>
                            Campi Mappati
                          </h4>
                          {Object.keys(record.mapped_fields || {}).length > 0 ? (
                            <pre
                              className="p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto"
                              style={{
                                background: "var(--bg-base)",
                                border: "1px solid var(--border-dark-subtle)",
                                color: "var(--fg-secondary)",
                                fontFamily: "monospace",
                              }}
                            >
                              {JSON.stringify(record.mapped_fields, null, 2)}
                            </pre>
                          ) : (
                            <div
                              className="p-4 rounded-lg text-xs text-center"
                              style={{
                                background: "var(--bg-base)",
                                border: "1px solid var(--border-dark-subtle)",
                                color: "var(--fg-muted)",
                              }}
                            >
                              Nessun campo mappato. Configura la mappatura nel tab Mapping.
                            </div>
                          )}

                          {/* Record metadata */}
                          <div className="mt-3 text-xs space-y-1" style={{ color: "var(--fg-muted)" }}>
                            <div><strong>ID esterno:</strong> {record.external_id}</div>
                            <div><strong>Tipo:</strong> {record.object_type}</div>
                            <div><strong>Ultimo sync:</strong> {new Date(record.synced_at).toLocaleString("it-IT")}</div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
            Pagina {page} di {totalPages} &middot; {total.toLocaleString("it-IT")} record
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-2 rounded-lg transition-colors disabled:opacity-30"
              style={{ background: "var(--bg-overlay)", color: "var(--fg-secondary)" }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-2 rounded-lg transition-colors disabled:opacity-30"
              style={{ background: "var(--bg-overlay)", color: "var(--fg-secondary)" }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Loading overlay for pagination */}
      {loading && records.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--fg-muted)" }} />
          <span className="ml-2 text-xs" style={{ color: "var(--fg-muted)" }}>Aggiornamento...</span>
        </div>
      )}

      {/* Push Modal */}
      <AnimatePresence>
        {showPushModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => !pushing && setShowPushModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl p-6"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--fg-primary)" }}>
                Invia {selectedRecordIds.size} record
              </h3>
              <p className="text-sm mb-5" style={{ color: "var(--fg-muted)" }}>
                Da {connectorName} verso un altro sistema
              </p>

              {/* Target connector selector */}
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-muted)" }}>
                Connettore di destinazione
              </label>
              <select
                value={pushTarget}
                onChange={(e) => setPushTarget(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm mb-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--fg-primary)",
                  border: "1px solid var(--border-dark-subtle)",
                }}
              >
                <option value="">Seleziona connettore...</option>
                <option value="hubspot">HubSpot CRM</option>
                <option value="salesforce">Salesforce</option>
                <option value="fatture-in-cloud">Fatture in Cloud</option>
                <option value="google-drive">Google Drive</option>
              </select>

              {/* Target entity type */}
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-muted)" }}>
                Tipo entita target (opzionale)
              </label>
              <select
                value={pushTargetEntity}
                onChange={(e) => setPushTargetEntity(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm mb-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--fg-primary)",
                  border: "1px solid var(--border-dark-subtle)",
                }}
              >
                <option value="">Stesso tipo sorgente</option>
                <option value="contacts">Contatti</option>
                <option value="companies">Aziende</option>
                <option value="deals">Affari</option>
                <option value="invoices">Fatture</option>
                <option value="tickets">Ticket</option>
                <option value="documents">Documenti</option>
              </select>

              {/* Push result */}
              {pushResult && (
                <div
                  className="flex items-center gap-3 p-4 rounded-xl mb-4 text-sm"
                  style={{
                    background: pushResult.success
                      ? "rgba(93, 228, 199, 0.1)"
                      : "rgba(229, 141, 120, 0.1)",
                    border: `1px solid ${pushResult.success ? "rgba(93, 228, 199, 0.3)" : "rgba(229, 141, 120, 0.3)"}`,
                    color: pushResult.success ? "var(--success)" : "var(--error)",
                  }}
                >
                  {pushResult.success ? (
                    <CheckCircle className="w-5 h-5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0" />
                  )}
                  <div>
                    {pushResult.success ? (
                      <span>
                        {pushResult.created ?? 0} creati, {pushResult.updated ?? 0} aggiornati
                        {(pushResult.failed ?? 0) > 0 && `, ${pushResult.failed} falliti`}
                      </span>
                    ) : (
                      <span>{pushResult.errors?.[0] || "Push fallito"}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowPushModal(false);
                    setPushResult(null);
                  }}
                  disabled={pushing}
                  className="px-4 py-2 rounded-xl text-sm transition-colors"
                  style={{ color: "var(--fg-secondary)" }}
                >
                  {pushResult ? "Chiudi" : "Annulla"}
                </button>
                {!pushResult && (
                  <button
                    onClick={handlePush}
                    disabled={pushing || !pushTarget}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark, #E85A24))" }}
                  >
                    {pushing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Invio in corso...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Invia {selectedRecordIds.size} record
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helpers for Data Tab ───

function entityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    contact: "Contatto",
    contacts: "Contatto",
    company: "Azienda",
    companies: "Azienda",
    deal: "Affare",
    deals: "Affare",
    ticket: "Ticket",
    tickets: "Ticket",
    invoice: "Fattura",
    invoices: "Fattura",
    document: "Documento",
    documents: "Documento",
  };
  return labels[type.toLowerCase()] || type;
}

function entityTypeColor(type: string): { bg: string; fg: string } {
  const colors: Record<string, { bg: string; fg: string }> = {
    contact: { bg: "rgba(78, 205, 196, 0.15)", fg: "#4ECDC4" },
    contacts: { bg: "rgba(78, 205, 196, 0.15)", fg: "#4ECDC4" },
    company: { bg: "rgba(167, 139, 250, 0.15)", fg: "#A78BFA" },
    companies: { bg: "rgba(167, 139, 250, 0.15)", fg: "#A78BFA" },
    deal: { bg: "rgba(255, 200, 50, 0.15)", fg: "#FFC832" },
    deals: { bg: "rgba(255, 200, 50, 0.15)", fg: "#FFC832" },
    ticket: { bg: "rgba(255, 107, 107, 0.15)", fg: "#FF6B6B" },
    tickets: { bg: "rgba(255, 107, 107, 0.15)", fg: "#FF6B6B" },
  };
  return colors[type.toLowerCase()] || { bg: "var(--bg-overlay)", fg: "var(--fg-muted)" };
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
