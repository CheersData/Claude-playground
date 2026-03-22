"use client";

/**
 * SetupWizard — Unified multi-step setup wizard modal for connector configuration.
 *
 * 5-step flow:
 *   1. Seleziona entita   (EntitySelect)
 *   2. Autorizza           (AuthStep — OAuth or API Key)
 *   3. Mappa i campi       (FieldMappingStep)
 *   4. Frequenza sync      (FrequencyStep)
 *   5. Riepilogo e attiva  (ReviewStep)
 *
 * Design: Poimandres dark theme, framer-motion step transitions.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import EntitySelect, { type EntityOption } from "./wizard/EntitySelect";
import AuthStep, { type AuthMode } from "./wizard/AuthStep";
import FieldMappingStep, { type EntityMappings, type FieldMapping } from "./wizard/FieldMappingStep";
import FrequencyStep, { type SyncFrequency } from "./wizard/FrequencyStep";
import ReviewStep from "./wizard/ReviewStep";

// ─── Types ───

interface ConnectorWizardConfig {
  id: string;
  name: string;
  category: string;
  icon: LucideIcon;
  authMode: AuthMode;
  supportsApiKey?: boolean; // If true, user can choose between OAuth and API key
  oauthPermissions?: { label: string }[];
  apiKeyLabel?: string;
  secretKeyLabel?: string;
  helpText?: string;
  entities: EntityOption[];
  targetFieldOptions: string[];
}

interface SetupWizardProps {
  connector: ConnectorWizardConfig;
  open: boolean;
  onClose: () => void;
  onComplete: (config: WizardResult) => void;
}

export interface WizardResult {
  connectorId: string;
  selectedEntities: string[];
  apiKey?: string;
  secretKey?: string;
  mappings: EntityMappings[];
  frequency: SyncFrequency;
}

// ─── Step definitions ───

const STEPS = [
  { id: "entities", label: "Dati" },
  { id: "auth", label: "Autorizza" },
  { id: "mapping", label: "Mappatura" },
  { id: "frequency", label: "Frequenza" },
  { id: "review", label: "Riepilogo" },
] as const;

// ─── Slide animation variants ───

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 200 : -200,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 200 : -200,
    opacity: 0,
  }),
};

// ─── Component ───

export default function SetupWizard({ connector, open, onClose, onComplete }: SetupWizardProps) {
  // Step navigation
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);

  // Step 1: Entity selection
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);

  // Step 2: Auth
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [verifyMessage, setVerifyMessage] = useState<string | undefined>();

  // Step 3: Mapping
  const [entityMappings, setEntityMappings] = useState<EntityMappings[]>(() =>
    buildInitialMappings(connector.entities)
  );

  // Step 4: Frequency
  const [frequency, setFrequency] = useState<SyncFrequency>("daily");

  // Step 5: Activate
  const [activateStatus, setActivateStatus] = useState<"idle" | "activating" | "success" | "error">("idle");
  const [activateError, setActivateError] = useState<string | null>(null);

  // ─── Handle OAuth callback ───
  // When the user returns from the OAuth provider redirect, the URL contains
  // query params (setup=complete or oauth_error). We detect these on mount
  // and update the wizard state accordingly.
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams(window.location.search);

    if (params.get("setup") === "complete") {
      // OAuth was successful — mark auth step as verified and advance
      setVerifyStatus("success");
      setVerifyMessage("Account autorizzato con successo");
      // Jump to auth step if not already past it, then auto-advance
      if (currentStep <= 1) {
        setCurrentStep(1);
        setTimeout(() => {
          setDirection(1);
          setCurrentStep(2);
        }, 800);
      }
    }

    if (params.get("oauth_error")) {
      const errorCode = params.get("oauth_error");
      const errorDesc = params.get("oauth_error_desc");

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
      setVerifyStatus("error");
      setVerifyMessage(message);
      // Ensure we're on the auth step so the user can see the error
      if (currentStep < 1) {
        setCurrentStep(1);
      }
    }

    // Clean OAuth params from URL to avoid re-processing on re-render
    if (params.has("setup") || params.has("oauth_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Navigation helpers ───

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 0:
        return selectedEntities.length > 0;
      case 1:
        return connector.authMode === "oauth" || verifyStatus === "success";
      case 2:
        return true; // mappings always have defaults
      case 3:
        return true; // frequency always selected
      case 4:
        return false; // last step
      default:
        return false;
    }
  }, [currentStep, selectedEntities, connector.authMode, verifyStatus]);

  const goNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback((step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  }, [currentStep]);

  // ─── Entity toggle ───

  const toggleEntity = useCallback((id: string) => {
    setSelectedEntities((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  }, []);

  const toggleAllEntities = useCallback(() => {
    setSelectedEntities((prev) =>
      prev.length === connector.entities.length ? [] : connector.entities.map((e) => e.id)
    );
  }, [connector.entities]);

  // ─── Auth verify (mock) ───

  const handleVerify = useCallback(async () => {
    setVerifyStatus("verifying");
    setVerifyMessage(undefined);
    try {
      const res = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorSource: connector.id,
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
        setVerifyMessage(data.error || "Chiave API non valida. Verifica e riprova.");
      }
    } catch {
      setVerifyStatus("error");
      setVerifyMessage("Errore di rete durante la verifica");
    }
  }, [connector.id, apiKey, secretKey]);

  const handleOAuthAuthorize = useCallback(() => {
    window.location.href = `/api/integrations/${connector.id}/authorize`;
  }, [connector.id]);

  // ─── Mapping update ───

  const handleUpdateMapping = useCallback(
    (entityId: string, sourceField: string, targetField: string) => {
      setEntityMappings((prev) =>
        prev.map((em) =>
          em.entityId === entityId
            ? {
                ...em,
                mappings: em.mappings.map((m) =>
                  m.sourceField === sourceField ? { ...m, targetField, autoMapped: false } : m
                ),
              }
            : em
        )
      );
    },
    []
  );

  // ─── Activate ───

  const handleActivate = useCallback(async () => {
    setActivateStatus("activating");
    setActivateError(null);
    try {
      // Use unified setup endpoint — creates connection + saves mappings + triggers sync
      const res = await fetch("/api/integrations/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: connector.id,
          connectorName: connector.name,
          selectedEntities,
          frequency,
          mappings: entityMappings,
          triggerSync: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Errore nella configurazione");
      }

      setActivateStatus("success");

      const result: WizardResult = {
        connectorId: connector.id,
        selectedEntities,
        apiKey: apiKey || undefined,
        secretKey: secretKey || undefined,
        mappings: entityMappings,
        frequency,
      };

      setTimeout(() => {
        onComplete(result);
      }, 1200);
    } catch (err) {
      setActivateStatus("error");
      setActivateError(
        err instanceof Error ? err.message : "Errore durante l'attivazione. Riprova."
      );
    }
  }, [connector.id, connector.name, selectedEntities, apiKey, secretKey, entityMappings, frequency, onComplete]);

  // ─── Computed for review step ───

  const selectedEntityOptions = useMemo(
    () => connector.entities.filter((e) => selectedEntities.includes(e.id)),
    [connector.entities, selectedEntities]
  );

  const mappingStats = useMemo(() => {
    let total = 0;
    let auto = 0;
    let manual = 0;
    let ignored = 0;
    for (const em of entityMappings) {
      for (const m of em.mappings) {
        if (m.targetField === "-- Ignora --") {
          ignored++;
        } else {
          total++;
          if (m.autoMapped) auto++;
          else manual++;
        }
      }
    }
    return { total, auto, manual, ignored };
  }, [entityMappings]);

  // ─── Render ───

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)" }}
        >
          {/* Modal — full-screen on mobile, centered modal on desktop */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full sm:max-w-[680px] h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-dark)",
              boxShadow: "0 25px 80px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Header */}
            <div
              className="sticky top-0 z-10 px-6 py-4"
              style={{
                background: "var(--bg-base)",
                borderBottom: "1px solid var(--border-dark-subtle)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-lg"
                    style={{ background: "var(--bg-overlay)" }}
                  >
                    <connector.icon className="w-4 h-4" style={{ color: "var(--fg-secondary)" }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: "var(--fg-primary)" }}>
                      Configura {connector.name}
                    </h2>
                    <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                      {connector.category}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg transition-colors hover-bg-overlay"
                  style={{ color: "var(--fg-muted)" }}
                  aria-label="Chiudi wizard"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Security reassurance badge */}
              <div
                className="flex items-center gap-2 mt-3 rounded-lg px-3 py-2"
                style={{
                  background: "rgba(93, 228, 199, 0.06)",
                  border: "1px solid rgba(93, 228, 199, 0.12)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--success)", flexShrink: 0 }}>
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="text-[11px] font-medium" style={{ color: "var(--success)" }}>
                  Connessione sicura e criptata
                </span>
                <span className="text-[11px] mx-1" style={{ color: "var(--fg-invisible)" }}>|</span>
                <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                  AES-256-GCM &middot; I tuoi dati restano tuoi
                </span>
              </div>
            </div>

            {/* Step indicator */}
            <div className="px-6 py-4">
              <div className="flex items-center gap-1">
                {STEPS.map((step, i) => {
                  const isActive = i === currentStep;
                  const isCompleted = i < currentStep;
                  return (
                    <div key={step.id} className="flex items-center flex-1">
                      <button
                        onClick={() => i < currentStep && goToStep(i)}
                        disabled={i > currentStep}
                        className="flex items-center gap-2 text-xs font-medium transition-colors"
                        style={{
                          color: isActive
                            ? "var(--accent)"
                            : isCompleted
                              ? "var(--success)"
                              : "var(--fg-invisible)",
                          cursor: i < currentStep ? "pointer" : "default",
                        }}
                      >
                        <span
                          className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0"
                          style={{
                            background: isActive
                              ? "rgba(255, 107, 53, 0.15)"
                              : isCompleted
                                ? "rgba(93, 228, 199, 0.15)"
                                : "var(--bg-overlay)",
                            color: isActive
                              ? "var(--accent)"
                              : isCompleted
                                ? "var(--success)"
                                : "var(--fg-invisible)",
                          }}
                        >
                          {isCompleted ? "\u2713" : i + 1}
                        </span>
                        <span className="hidden sm:inline">{step.label}</span>
                      </button>
                      {i < STEPS.length - 1 && (
                        <div
                          className="flex-1 h-px mx-2"
                          style={{
                            background: isCompleted ? "var(--success)" : "var(--border-dark-subtle)",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step content */}
            <div className="px-6 pb-6 min-h-[400px]">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={currentStep}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                >
                  {currentStep === 0 && (
                    <EntitySelect
                      entities={connector.entities}
                      selected={selectedEntities}
                      onToggle={toggleEntity}
                      onToggleAll={toggleAllEntities}
                    />
                  )}

                  {currentStep === 1 && (
                    <AuthStep
                      connectorName={connector.name}
                      authMode={connector.authMode}
                      supportsApiKey={connector.supportsApiKey}
                      oauthPermissions={connector.oauthPermissions}
                      apiKeyLabel={connector.apiKeyLabel}
                      secretKeyLabel={connector.secretKeyLabel}
                      helpText={connector.helpText}
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

                  {currentStep === 2 && (
                    <FieldMappingStep
                      entityMappings={entityMappings}
                      targetFieldOptions={connector.targetFieldOptions}
                      onUpdateMapping={handleUpdateMapping}
                    />
                  )}

                  {currentStep === 3 && (
                    <FrequencyStep selected={frequency} onChange={setFrequency} />
                  )}

                  {currentStep === 4 && (
                    <ReviewStep
                      connectorName={connector.name}
                      connectorCategory={connector.category}
                      connectorIcon={connector.icon}
                      selectedEntities={selectedEntityOptions}
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

            {/* Footer nav buttons (not on review step) */}
            {currentStep < 4 && (
              <div
                className="sticky bottom-0 flex items-center justify-between px-6 py-4"
                style={{
                  background: "var(--bg-base)",
                  borderTop: "1px solid var(--border-dark-subtle)",
                }}
              >
                <button
                  onClick={goPrev}
                  disabled={currentStep === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    color: "var(--fg-secondary)",
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-dark-subtle)",
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Indietro
                </button>

                <div className="text-xs" style={{ color: "var(--fg-invisible)" }}>
                  Passo {currentStep + 1} di {STEPS.length}
                </div>

                <button
                  onClick={goNext}
                  disabled={!canGoNext}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{
                    background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                  }}
                >
                  Avanti
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Helper: build initial field mappings from entities ───

function buildInitialMappings(entities: EntityOption[]): EntityMappings[] {
  return entities.map((entity) => ({
    entityId: entity.id,
    entityName: entity.name,
    mappings: entity.fields.map(
      (field): FieldMapping => ({
        sourceField: field,
        targetField: field.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        confidence: 85 + Math.floor(Math.random() * 15),
        autoMapped: true,
      })
    ),
  }));
}
