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

import { useState, useCallback, useMemo, useEffect } from "react";
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
  type LucideIcon,
} from "lucide-react";

import EntitySelect, { type EntityOption } from "@/components/integrations/wizard/EntitySelect";
import AuthStep, { type AuthMode } from "@/components/integrations/wizard/AuthStep";
import FieldMappingStep, {
  type EntityMappings,
} from "@/components/integrations/wizard/FieldMappingStep";
import FrequencyStep, { type SyncFrequency } from "@/components/integrations/wizard/FrequencyStep";
import ReviewStep from "@/components/integrations/wizard/ReviewStep";

// ─── Types ───

interface ConnectorConfig {
  id: string;
  name: string;
  category: string;
  icon: string;
  authMode: AuthMode;
  oauthPermissions: { label: string }[];
  apiKeyLabel?: string;
  secretKeyLabel?: string;
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
] as const;

type TabId = (typeof TABS)[number]["id"];

const ICON_MAP: Record<string, LucideIcon> = {
  CreditCard,
  Users,
  HardDrive,
  Building2,
};

const STEPS = [
  { id: "entities", label: "Dati" },
  { id: "auth", label: "Auth" },
  { id: "mapping", label: "Mapping" },
  { id: "frequency", label: "Frequenza" },
  { id: "review", label: "Attiva" },
] as const;

// ─── Demo connector configs ───

const CONNECTOR_CONFIGS: Record<string, ConnectorConfig> = {
  salesforce: {
    id: "salesforce",
    name: "Salesforce",
    category: "CRM",
    icon: "Users",
    authMode: "oauth",
    oauthPermissions: [
      { label: "Lettura contatti" },
      { label: "Lettura opportunita" },
      { label: "Lettura pipeline" },
    ],
    entities: [
      {
        id: "contacts",
        name: "Contatti",
        recordCount: 12450,
        lastUpdated: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
        fields: ["Nome", "Email", "Telefono", "Azienda", "Ruolo"],
      },
      {
        id: "opportunities",
        name: "Opportunita",
        recordCount: 3210,
        lastUpdated: new Date(Date.now() - 30 * 60_000).toISOString(),
        fields: ["Titolo", "Valore", "Fase", "Probabilita"],
      },
      {
        id: "pipeline",
        name: "Pipeline",
        recordCount: 8,
        lastUpdated: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
        fields: ["Nome", "Fasi", "Probabilita default"],
      },
      {
        id: "activities",
        name: "Attivita",
        recordCount: 8920,
        lastUpdated: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
        fields: ["Tipo", "Data", "Oggetto", "Contatto"],
      },
      {
        id: "notes",
        name: "Note",
        recordCount: 2100,
        lastUpdated: new Date(Date.now() - 12 * 60 * 60_000).toISOString(),
        fields: ["Testo", "Data", "Autore"],
      },
      {
        id: "reports",
        name: "Report",
        recordCount: 45,
        lastUpdated: new Date(Date.now() - 48 * 60 * 60_000).toISOString(),
        fields: ["Nome", "Tipo", "Ultima esecuzione"],
      },
    ],
    targetFields: [
      "nome",
      "cognome",
      "email",
      "telefono",
      "azienda",
      "ruolo",
      "indirizzo",
      "titolo",
      "valore",
      "fase",
      "probabilita",
      "data_creazione",
      "data_modifica",
      "note",
      "tipo",
      "oggetto",
      "stato",
    ],
  },
  hubspot: {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM / Marketing",
    icon: "Users",
    authMode: "oauth",
    oauthPermissions: [
      { label: "Lettura contatti" },
      { label: "Lettura deal" },
      { label: "Lettura campagne" },
    ],
    entities: [
      {
        id: "contacts",
        name: "Contatti",
        recordCount: 8200,
        lastUpdated: new Date(Date.now() - 60 * 60_000).toISOString(),
        fields: ["Nome", "Email", "Azienda", "Lifecycle stage"],
      },
      {
        id: "deals",
        name: "Deal",
        recordCount: 1450,
        lastUpdated: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
        fields: ["Nome", "Valore", "Pipeline", "Stage"],
      },
      {
        id: "campaigns",
        name: "Campagne",
        recordCount: 120,
        lastUpdated: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
        fields: ["Nome", "Tipo", "Budget", "Risultati"],
      },
    ],
    targetFields: [
      "nome",
      "cognome",
      "email",
      "azienda",
      "ruolo",
      "valore",
      "pipeline",
      "stage",
      "budget",
      "tipo_campagna",
      "risultati",
      "lifecycle_stage",
    ],
  },
  stripe: {
    id: "stripe",
    name: "Stripe",
    category: "Pagamenti",
    icon: "CreditCard",
    authMode: "api_key",
    oauthPermissions: [],
    apiKeyLabel: "API Key",
    secretKeyLabel: "Webhook Secret (opzionale)",
    helpText: "Trova le tue chiavi API in Stripe Dashboard > Developers > API Keys",
    entities: [
      {
        id: "invoices",
        name: "Fatture",
        recordCount: 3200,
        lastUpdated: new Date(Date.now() - 60 * 60_000).toISOString(),
        fields: ["Numero", "Importo", "Stato", "Cliente", "Data"],
      },
      {
        id: "subscriptions",
        name: "Abbonamenti",
        recordCount: 890,
        lastUpdated: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
        fields: ["Piano", "Stato", "Cliente", "Rinnovo"],
      },
      {
        id: "payments",
        name: "Pagamenti",
        recordCount: 12400,
        lastUpdated: new Date(Date.now() - 30 * 60_000).toISOString(),
        fields: ["Importo", "Metodo", "Stato", "Data"],
      },
    ],
    targetFields: [
      "numero_fattura",
      "importo",
      "stato",
      "cliente",
      "data",
      "piano",
      "rinnovo",
      "metodo_pagamento",
      "valuta",
    ],
  },
  "google-drive": {
    id: "google-drive",
    name: "Google Drive",
    category: "Storage",
    icon: "HardDrive",
    authMode: "oauth",
    oauthPermissions: [
      { label: "Lettura file e cartelle" },
      { label: "Lettura metadati" },
    ],
    entities: [
      {
        id: "files",
        name: "File",
        recordCount: 2500,
        lastUpdated: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
        fields: ["Nome", "Tipo", "Dimensione", "Proprietario", "Data modifica"],
      },
      {
        id: "folders",
        name: "Cartelle",
        recordCount: 180,
        lastUpdated: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
        fields: ["Nome", "Percorso", "Proprietario"],
      },
    ],
    targetFields: [
      "nome_file",
      "tipo_file",
      "dimensione",
      "proprietario",
      "percorso",
      "data_modifica",
      "data_creazione",
    ],
  },
};

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

  // Resolve config
  const config = CONNECTOR_CONFIGS[connectorId ?? ""] ?? null;
  const ConnectorIcon = config ? ICON_MAP[config.icon] || Plug : Plug;

  // ─── Tab state ───
  const [activeTab, setActiveTab] = useState<TabId>("setup");

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

  // Step 5: activate
  const [activateStatus, setActivateStatus] = useState<"idle" | "activating" | "success" | "error">("idle");

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
      setVerifyStatus("error");
      setVerifyMessage(`Errore OAuth: ${params.get("oauth_error_desc") || params.get("oauth_error")}`);
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
    try {
      // 1. Create connection
      const connRes = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId,
          connectorName: config?.name || connectorId,
          frequency,
          selectedEntities,
        }),
      });

      if (!connRes.ok && connRes.status !== 409) {
        throw new Error("Errore nella creazione della connessione");
      }

      // 2. Save mappings
      if (entityMappings.length > 0) {
        await fetch(`/api/integrations/${connectorId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mappings: entityMappings }),
        });
      }

      // 3. Trigger first sync
      const syncRes = await fetch(`/api/integrations/${connectorId}/sync`, {
        method: "POST",
      });

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        console.log(`[Activate] Sync completed: ${syncData.itemCount} items`);
      }

      setActivateStatus("success");
    } catch (err) {
      console.error("[Activate] Error:", err);
      setActivateStatus("error");
    }
  }, [connectorId, config, frequency, selectedEntities, entityMappings]);

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
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--fg-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-overlay)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
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
                          oauthPermissions={config.oauthPermissions}
                          apiKeyLabel={config.apiKeyLabel}
                          secretKeyLabel={config.secretKeyLabel}
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
                      className="flex items-center gap-2 text-sm transition-colors"
                      style={{ color: "var(--fg-secondary)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "var(--fg-primary)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "var(--fg-secondary)";
                      }}
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
  connectorName: _connectorName,
}: {
  connectorId: string;
  connectorName: string;
}) {
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

  // Load real connection data from API
  const loadConnectionData = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/${connectorId}`);
      if (!res.ok) {
        // No data yet — keep defaults (empty arrays, disconnected)
        setLoading(false);
        return;
      }
      const data = await res.json();

      // Map API response to ConnectorSyncData
      const history: SyncHistoryDay[] = (data.syncHistory || []).map(
        (h: { date: string; records?: number; errors?: number }) => ({
          date: h.date,
          success: h.records ?? 0,
          failed: h.errors ?? 0,
        })
      );

      const errors: SyncErrorEntry[] = (data.errors || []).map(
        (e: { id?: string; message: string; timestamp: string; details?: string }) => ({
          id: e.id || crypto.randomUUID(),
          timestamp: e.timestamp,
          message: e.message,
          affectedRecords: 0,
          details: e.details,
        })
      );

      const conn = data.connection || {};
      const statusMap: Record<string, ConnectorSyncData["status"]> = {
        active: "synced",
        error: "error",
        syncing: "syncing",
        paused: "paused",
      };

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncData({
        status: statusMap[conn.status] || "disconnected",
        lastSync: conn.lastSync || null,
        nextSync: conn.nextSync || null,
        totalRecords: conn.syncItems ?? 0,
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

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/integrations/${connectorId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Errore durante la sincronizzazione");
      } else {
        // Refresh the sync data after successful sync
        await loadConnectionData();
      }
    } catch {
      setSyncError("Errore di rete");
    } finally {
      setSyncing(false);
    }
  }, [connectorId, loadConnectionData]);

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
  const _sc = statusConfig[syncData.status] || statusConfig.disconnected;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--fg-muted)" }} />
        <span className="ml-3 text-sm" style={{ color: "var(--fg-muted)" }}>Caricamento dati...</span>
      </div>
    );
  }

  return (
    <div>
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
          className="rounded-xl p-8 text-center mb-6"
          style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dark-subtle)" }}
        >
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Nessuno storico disponibile. Configura il connettore e avvia la prima sincronizzazione.
          </p>
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

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/integrations/${config.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: entityMappings }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
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
                    className="w-full text-sm px-3 py-2 rounded-lg outline-none cursor-pointer appearance-none"
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
