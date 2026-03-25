"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  FileText,
  ChevronRight,
  X,
  Sparkles,
  Building2,
  Target,
  Type,
  Hash,
} from "lucide-react";

// ─── Validation ───────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z][a-z0-9-]*[a-z0-9]$/;

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateSlug(slug: string): string | null {
  if (!slug) return "Lo slug e obbligatorio";
  if (slug.length < 2) return "Lo slug deve avere almeno 2 caratteri";
  if (slug.length > 64) return "Lo slug non puo superare 64 caratteri";
  if (slug.includes("--"))
    return "Lo slug non puo contenere trattini doppi";
  if (!SLUG_REGEX.test(slug))
    return "Solo lettere minuscole, numeri e trattini. Deve iniziare e finire con lettera/numero.";
  return null;
}

function validateDisplayName(name: string): string | null {
  if (!name.trim()) return "Il nome e obbligatorio";
  if (name.length > 128) return "Il nome non puo superare 128 caratteri";
  return null;
}

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "name", label: "Identita", icon: Type },
  { id: "details", label: "Missione", icon: Target },
  { id: "review", label: "Conferma", icon: Check },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ─── Direction tracking for slide transitions ────────────────────────────────

function getStepIndex(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id);
}

// ─── Form Field ───────────────────────────────────────────────────────────────

function FormField({
  label,
  required,
  error,
  hint,
  charCount,
  charMax,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  charCount?: number;
  charMax?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          {label}
          {required && <span className="text-[#FF6B35] text-xs">*</span>}
        </label>
        {charCount !== undefined && charMax !== undefined && (
          <span
            className={`text-[11px] tabular-nums font-mono transition-colors ${
              charCount > charMax * 0.9
                ? "text-amber-500"
                : "text-gray-300"
            }`}
          >
            {charCount}/{charMax}
          </span>
        )}
      </div>
      {children}
      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-xs text-red-500 flex items-center gap-1.5"
          >
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-gray-400"
          >
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ─── Slug Badge ──────────────────────────────────────────────────────────────

function SlugBadge({ slug }: { slug: string }) {
  if (!slug) return null;
  const isValid = !validateSlug(slug);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 mt-2"
    >
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
          isValid
            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
            : "bg-gray-50 text-gray-500 border border-gray-100"
        }`}
      >
        <Hash className="w-3 h-3" />
        {slug || "slug"}
      </div>
      {isValid && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          <Check className="w-3.5 h-3.5 text-emerald-500" />
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Markdown Preview ─────────────────────────────────────────────────────────

function MarkdownPreview({
  name,
  displayName,
  description,
  mission,
}: {
  name: string;
  displayName: string;
  description: string;
  mission: string;
}) {
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50 bg-gray-50/50">
        <FileText className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[11px] font-medium text-gray-500 tracking-wide uppercase">
          department.md
        </span>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
          <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
          <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
        </div>
      </div>

      {/* Content */}
      <div className="p-5 overflow-y-auto max-h-[380px] space-y-4">
        {/* Title */}
        <div>
          <h3 className="font-serif text-lg text-gray-900 tracking-tight">
            {displayName || "Nome Dipartimento"}
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Creato il {today}
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100" />

        {/* Mission */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
            Missione
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            {mission || description || "Da definire."}
          </p>
        </div>

        {/* Identity */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Identita
          </p>
          <div className="space-y-2">
            {[
              { label: "Slug", value: name || "slug-dipartimento", mono: true },
              { label: "Tipo", value: "custom" },
              { label: "Creato da", value: "creator" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{item.label}</span>
                <span
                  className={`text-xs text-gray-700 ${
                    item.mono ? "font-mono bg-gray-50 px-2 py-0.5 rounded" : ""
                  }`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Priorities */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Priorita
          </p>
          <div className="space-y-1.5">
            {[
              "Definire obiettivi e KPI",
              "Configurare agenti e runbook",
              "Integrarsi con il workflow aziendale",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] text-gray-300 font-mono w-4 text-right flex-shrink-0 mt-px">
                  {i + 1}.
                </span>
                <span className="text-xs text-gray-500">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({
  steps,
  currentStep,
}: {
  steps: typeof STEPS;
  currentStep: StepId;
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center justify-between mb-10 max-w-md">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center gap-0 flex-1 last:flex-none">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5 relative">
              <motion.div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  done
                    ? "bg-emerald-500 shadow-sm shadow-emerald-500/20"
                    : active
                      ? "bg-[#FF6B35] shadow-md shadow-[#FF6B35]/25"
                      : "bg-gray-100"
                }`}
                animate={active ? { scale: [1, 1.05, 1] } : {}}
                transition={active ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : {}}
              >
                {done ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  >
                    <Check className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <Icon
                    className={`w-4 h-4 ${active ? "text-white" : "text-gray-400"}`}
                    strokeWidth={active ? 2 : 1.5}
                  />
                )}
              </motion.div>
              <span
                className={`text-[11px] font-medium tracking-wide whitespace-nowrap transition-colors ${
                  active
                    ? "text-gray-900"
                    : done
                      ? "text-emerald-600"
                      : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className="flex-1 h-px mx-3 mt-[-20px] relative">
                <div className="absolute inset-0 bg-gray-200 rounded-full" />
                <motion.div
                  className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: done ? "100%" : "0%" }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Confetti Particles ──────────────────────────────────────────────────────

function ConfettiParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        x: Math.random() * 300 - 150,
        y: -(Math.random() * 200 + 80),
        rotation: Math.random() * 720 - 360,
        scale: Math.random() * 0.6 + 0.4,
        delay: Math.random() * 0.3,
        color: [
          "#FF6B35",
          "#FF8C61",
          "#FFC832",
          "#4ECDC4",
          "#A78BFA",
          "#34D399",
        ][Math.floor(Math.random() * 6)],
      })),
    []
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full"
          style={{ backgroundColor: p.color }}
          initial={{ x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }}
          animate={{
            x: p.x,
            y: p.y,
            scale: p.scale,
            rotate: p.rotation,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 1.2,
            delay: p.delay,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewDepartmentPage() {
  const router = useRouter();
  const directionRef = useRef<1 | -1>(1);

  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [mission, setMission] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<StepId>("name");

  const handleDisplayNameChange = useCallback(
    (value: string) => {
      setDisplayName(value);
      if (!slugManuallyEdited) {
        setSlug(toSlug(value));
      }
    },
    [slugManuallyEdited]
  );

  const handleSlugChange = useCallback((value: string) => {
    setSlugManuallyEdited(true);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }, []);

  const slugError = useMemo(
    () => (touched.slug ? validateSlug(slug) : null),
    [slug, touched.slug]
  );
  const displayNameError = useMemo(
    () =>
      touched.displayName ? validateDisplayName(displayName) : null,
    [displayName, touched.displayName]
  );

  const nameStepValid = useMemo(() => {
    return !validateSlug(slug) && !validateDisplayName(displayName);
  }, [slug, displayName]);

  const goToStep = useCallback(
    (target: StepId) => {
      directionRef.current = getStepIndex(target) > getStepIndex(step) ? 1 : -1;
      setStep(target);
    },
    [step]
  );

  const handleNext = () => {
    if (step === "name") {
      setTouched({ slug: true, displayName: true });
      if (nameStepValid) goToStep("details");
    } else if (step === "details") {
      goToStep("review");
    }
  };

  const handleBack = () => {
    if (step === "details") goToStep("name");
    else if (step === "review") goToStep("details");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = sessionStorage.getItem("creator-token");
      const res = await fetch("/api/admin/departments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": window.location.origin,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          name: slug,
          display_name: displayName.trim(),
          description: description.trim() || null,
          mission: mission.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Errore HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => router.push("/creator"), 2000);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Errore nella creazione"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputBaseClass =
    "w-full px-4 py-3.5 rounded-xl border text-[15px] text-gray-900 bg-white placeholder:text-gray-300 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/20 focus:border-[#FF6B35] hover:border-gray-300";

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 40 : -40,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -40 : 40,
      opacity: 0,
    }),
  };

  // ─── Success celebration ──────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center relative"
        >
          <ConfettiParticles />

          {/* Success icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 15,
              delay: 0.15,
            }}
            className="relative mx-auto mb-6"
          >
            {/* Outer ring pulse */}
            <motion.div
              className="absolute inset-0 w-20 h-20 rounded-full bg-emerald-500/10"
              animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <motion.div
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
              >
                <Check className="w-9 h-9 text-white" strokeWidth={2.5} />
              </motion.div>
            </div>
          </motion.div>

          {/* Text */}
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-serif text-gray-900 tracking-tight mb-2"
          >
            Dipartimento creato
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-sm text-gray-500 mb-1"
          >
            <span className="font-medium text-gray-700">{displayName}</span>{" "}
            e pronto per essere configurato.
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-xs text-gray-400 mt-3"
          >
            Reindirizzamento alla dashboard...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 lg:px-10 max-w-5xl mx-auto safe-area-bottom">
      {/* Back navigation */}
      <motion.button
        onClick={() => router.push("/creator")}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-8 -ml-1 py-2 min-h-[44px]"
        whileTap={{ scale: 0.97 }}
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Dashboard</span>
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[#FFF0EB] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#FF6B35]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-serif text-gray-900 tracking-tight">
                Nuovo Dipartimento
              </h1>
            </div>
          </div>
          <p className="text-sm text-gray-500 ml-[52px] md:ml-[52px]">
            Definisci identita e missione del nuovo dipartimento.
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator steps={STEPS} currentStep={step} />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10">
          {/* ─── Form area ──────────────────────────────────────────────── */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait" custom={directionRef.current}>
              {/* ─── Step 1: Name ─────────────────────────────────────── */}
              {step === "name" && (
                <motion.div
                  key="name"
                  custom={directionRef.current}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Card */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-6">
                    <div className="mb-1">
                      <h2 className="text-lg font-serif text-gray-900 tracking-tight">
                        Identita del dipartimento
                      </h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Scegli un nome descrittivo. Lo slug viene generato automaticamente.
                      </p>
                    </div>

                    <FormField
                      label="Nome del dipartimento"
                      required
                      error={displayNameError}
                      hint="Il nome visibile nella dashboard e nelle comunicazioni"
                      charCount={displayName.length}
                      charMax={128}
                    >
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) =>
                          handleDisplayNameChange(e.target.value)
                        }
                        onBlur={() =>
                          setTouched((t) => ({
                            ...t,
                            displayName: true,
                          }))
                        }
                        placeholder="es. Ufficio Ricerca e Sviluppo"
                        className={`${inputBaseClass} ${
                          displayNameError
                            ? "border-red-300 focus:ring-red-500/20 focus:border-red-500"
                            : "border-gray-200"
                        }`}
                        maxLength={128}
                        autoFocus
                      />
                    </FormField>

                    {/* Auto-generated slug display */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                          Identificatore
                          <span className="text-[#FF6B35] text-xs">*</span>
                        </label>
                        {slug && !slugManuallyEdited && (
                          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                            auto-generato
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={slug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        onBlur={() =>
                          setTouched((t) => ({ ...t, slug: true }))
                        }
                        placeholder="es. ufficio-ricerca"
                        className={`${inputBaseClass} font-mono text-sm tracking-wide ${
                          slugError
                            ? "border-red-300 focus:ring-red-500/20 focus:border-red-500"
                            : "border-gray-200"
                        }`}
                        maxLength={64}
                      />
                      <AnimatePresence>
                        {slugError ? (
                          <motion.p
                            key="slug-error"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="text-xs text-red-500 flex items-center gap-1.5 mt-2"
                          >
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            {slugError}
                          </motion.p>
                        ) : slug ? (
                          <SlugBadge key="slug-badge" slug={slug} />
                        ) : (
                          <motion.p
                            key="slug-hint"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-xs text-gray-400 mt-2"
                          >
                            Lettere minuscole, numeri e trattini
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Navigation */}
                  <div className="flex justify-end mt-6">
                    <motion.button
                      onClick={handleNext}
                      disabled={!nameStepValid}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-[#FF6B35] text-white shadow-sm shadow-[#FF6B35]/20 hover:bg-[#E85D2C] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none min-h-[48px]"
                      whileHover={nameStepValid ? { scale: 1.02 } : {}}
                      whileTap={nameStepValid ? { scale: 0.97 } : {}}
                    >
                      Continua
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* ─── Step 2: Details ──────────────────────────────────── */}
              {step === "details" && (
                <motion.div
                  key="details"
                  custom={directionRef.current}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-6">
                    <div className="mb-1">
                      <h2 className="text-lg font-serif text-gray-900 tracking-tight">
                        Missione e descrizione
                      </h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Opzionale. Puoi sempre aggiornarli in seguito.
                      </p>
                    </div>

                    <FormField
                      label="Descrizione"
                      hint="Una breve sintesi del ruolo del dipartimento"
                      charCount={description.length}
                      charMax={1024}
                    >
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Cosa fa questo dipartimento, in poche parole..."
                        className={`${inputBaseClass} border-gray-200 resize-none leading-relaxed`}
                        rows={3}
                        maxLength={1024}
                        autoFocus
                      />
                    </FormField>

                    <FormField
                      label="Missione"
                      hint="Obiettivi strategici e vision a lungo termine"
                      charCount={mission.length}
                      charMax={2048}
                    >
                      <textarea
                        value={mission}
                        onChange={(e) => setMission(e.target.value)}
                        placeholder="La missione del dipartimento, i suoi obiettivi e come contribuisce alla crescita dell'azienda..."
                        className={`${inputBaseClass} border-gray-200 resize-none leading-relaxed`}
                        rows={5}
                        maxLength={2048}
                      />
                    </FormField>
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-between mt-6">
                    <motion.button
                      onClick={handleBack}
                      className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors py-3 px-2 min-h-[48px]"
                      whileTap={{ scale: 0.97 }}
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Indietro
                    </motion.button>
                    <motion.button
                      onClick={handleNext}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-[#FF6B35] text-white shadow-sm shadow-[#FF6B35]/20 hover:bg-[#E85D2C] transition-all duration-200 min-h-[48px]"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Rivedi
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* ─── Step 3: Review ──────────────────────────────────── */}
              {step === "review" && (
                <motion.div
                  key="review"
                  custom={directionRef.current}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Review header */}
                    <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4">
                      <h2 className="text-lg font-serif text-gray-900 tracking-tight">
                        Riepilogo
                      </h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Verifica i dati prima di creare il dipartimento.
                      </p>
                    </div>

                    {/* Review fields */}
                    <div className="px-6 md:px-8 pb-6 md:pb-8 space-y-0">
                      {/* Name */}
                      <div className="py-4 border-b border-gray-50">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                          Nome
                        </p>
                        <p className="text-[15px] font-medium text-gray-900">
                          {displayName}
                        </p>
                      </div>

                      {/* Slug */}
                      <div className="py-4 border-b border-gray-50">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                          Identificatore
                        </p>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gray-50 border border-gray-100">
                          <Hash className="w-3 h-3 text-gray-400" />
                          <span className="text-sm font-mono text-gray-700">
                            {slug}
                          </span>
                        </div>
                      </div>

                      {/* Description */}
                      {description && (
                        <div className="py-4 border-b border-gray-50">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                            Descrizione
                          </p>
                          <p className="text-sm text-gray-600 leading-relaxed">
                            {description}
                          </p>
                        </div>
                      )}

                      {/* Mission */}
                      {mission && (
                        <div className="py-4">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                            Missione
                          </p>
                          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                            {mission}
                          </p>
                        </div>
                      )}

                      {/* Empty state */}
                      {!description && !mission && (
                        <div className="py-4 flex items-center gap-2 text-xs text-gray-400">
                          <Sparkles className="w-3.5 h-3.5" />
                          Nessuna descrizione o missione aggiunta
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Error */}
                  <AnimatePresence>
                    {submitError && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="flex items-center gap-3 p-4 mt-4 rounded-xl border border-red-100 bg-red-50 text-sm text-red-600"
                      >
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1">{submitError}</span>
                        <button
                          onClick={() => setSubmitError(null)}
                          className="p-1 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Navigation */}
                  <div className="flex items-center justify-between mt-6">
                    <motion.button
                      onClick={handleBack}
                      className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors py-3 px-2 min-h-[48px]"
                      whileTap={{ scale: 0.97 }}
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Indietro
                    </motion.button>
                    <motion.button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex items-center gap-2.5 px-7 py-3 rounded-xl text-sm font-semibold bg-[#FF6B35] text-white shadow-md shadow-[#FF6B35]/20 hover:bg-[#E85D2C] transition-all duration-200 disabled:opacity-50 disabled:shadow-none min-h-[48px]"
                      whileHover={!submitting ? { scale: 1.02 } : {}}
                      whileTap={!submitting ? { scale: 0.97 } : {}}
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {submitting
                        ? "Creazione in corso..."
                        : "Crea Dipartimento"}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ─── Desktop preview panel ──────────────────────────────── */}
          <div className="hidden lg:block lg:col-span-2">
            <div className="sticky top-8">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <MarkdownPreview
                  name={slug}
                  displayName={displayName}
                  description={description}
                  mission={mission}
                />

                {/* Preview footer hint */}
                <p className="text-[11px] text-gray-300 text-center mt-3">
                  Anteprima del file department.md generato
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
