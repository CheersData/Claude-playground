"use client";

/**
 * OnboardingTour — 4-step guided tooltip overlay for first-time integration users.
 *
 * Steps:
 *   1. "Scegli un servizio da connettere" → highlights connector grid
 *   2. "Clicca 'Configura' per iniziare" → highlights first connector CTA
 *   3. "Segui il wizard per collegare il tuo account" → highlights wizard area
 *   4. "I tuoi documenti verranno analizzati automaticamente!" → highlights dashboard area
 *
 * Features:
 *   - First-time detection via localStorage
 *   - Skip / dismiss permanently
 *   - Progress dots + prev/next navigation
 *   - Spotlight effect on target elements
 *
 * Design: Poimandres dark theme, framer-motion transitions.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Plug,
  MousePointerClick,
  Shield,
  Sparkles,
} from "lucide-react";

// ─── Constants ───

const STORAGE_KEY = "controlla_integration_tour_dismissed";

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  targetSelector: string | null; // CSS selector or null for centered overlay
  position: "bottom" | "top" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "catalog",
    title: "Scegli un servizio da connettere",
    description:
      "Qui trovi tutti i connettori disponibili: fatturazione, CRM, documenti e molto altro. Ogni servizio ha una guida rapida per collegarlo in pochi minuti.",
    icon: Plug,
    iconColor: "var(--accent)",
    targetSelector: "[data-tour='connector-grid']",
    position: "top",
  },
  {
    id: "configure",
    title: "Clicca \"Configura\" per iniziare",
    description:
      "Scegli il servizio che usi di piu e clicca il pulsante arancione. Il wizard ti guidera passo dopo passo, senza bisogno di competenze tecniche.",
    icon: MousePointerClick,
    iconColor: "var(--success)",
    targetSelector: "[data-tour='first-connector']",
    position: "bottom",
  },
  {
    id: "wizard",
    title: "Segui il wizard per collegare il tuo account",
    description:
      "Autorizza l'accesso in modo sicuro con OAuth o API Key. I tuoi dati sono criptati con AES-256 e non vengono mai condivisi con terzi.",
    icon: Shield,
    iconColor: "var(--info)",
    targetSelector: null, // centered overlay
    position: "bottom",
  },
  {
    id: "dashboard",
    title: "I tuoi documenti verranno analizzati automaticamente!",
    description:
      "Una volta connesso, i tuoi documenti vengono importati e analizzati dall'AI. Riceverai rischi, clausole problematiche e suggerimenti — tutto in automatico.",
    icon: Sparkles,
    iconColor: "var(--caution)",
    targetSelector: null, // centered overlay
    position: "bottom",
  },
];

// ─── Types ───

interface OnboardingTourProps {
  /** Force show even if previously dismissed (for testing) */
  forceShow?: boolean;
}

// ─── Component ───

export default function OnboardingTour({ forceShow = false }: OnboardingTourProps) {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number>(0);

  // Check localStorage on mount
  useEffect(() => {
    if (forceShow) {
      setVisible(true);
      return;
    }
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        // Small delay so user sees the page first
        const timer = setTimeout(() => setVisible(true), 1200);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage unavailable — skip tour
    }
  }, [forceShow]);

  // Update spotlight position when step changes
  const updateSpotlight = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (!step?.targetSelector) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setSpotlightRect(rect);
    } else {
      setSpotlightRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!visible) return;
    updateSpotlight();

    // Update on scroll/resize
    const handleUpdate = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateSpotlight);
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);
    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
      cancelAnimationFrame(rafRef.current);
    };
  }, [visible, updateSpotlight]);

  // ─── Handlers ───

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  }, []);

  const goNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [currentStep, dismiss]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  if (!visible) return null;

  const step = TOUR_STEPS[currentStep];
  const StepIcon = step.icon;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const PADDING = 12;

  // Tooltip position computation
  const getTooltipStyle = (): React.CSSProperties => {
    if (!spotlightRect) {
      // Centered on screen
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const style: React.CSSProperties = {
      position: "fixed",
    };

    switch (step.position) {
      case "bottom":
        style.top = spotlightRect.bottom + PADDING + 8;
        style.left = Math.max(16, Math.min(spotlightRect.left, window.innerWidth - 380));
        break;
      case "top":
        style.bottom = window.innerHeight - spotlightRect.top + PADDING + 8;
        style.left = Math.max(16, Math.min(spotlightRect.left, window.innerWidth - 380));
        break;
      case "right":
        style.top = spotlightRect.top;
        style.left = spotlightRect.right + PADDING + 8;
        break;
      case "left":
        style.top = spotlightRect.top;
        style.right = window.innerWidth - spotlightRect.left + PADDING + 8;
        break;
    }

    return style;
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="tour-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999]"
          onClick={dismiss}
        >
          {/* ─── Backdrop with spotlight cutout ─── */}
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: "none" }}
          >
            <defs>
              <mask id="spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {spotlightRect && (
                  <rect
                    x={spotlightRect.left - PADDING}
                    y={spotlightRect.top - PADDING}
                    width={spotlightRect.width + PADDING * 2}
                    height={spotlightRect.height + PADDING * 2}
                    rx="16"
                    ry="16"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.65)"
              mask="url(#spotlight-mask)"
            />
          </svg>

          {/* ─── Spotlight ring glow ─── */}
          {spotlightRect && (
            <motion.div
              key={`spotlight-ring-${currentStep}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute rounded-2xl pointer-events-none"
              style={{
                top: spotlightRect.top - PADDING,
                left: spotlightRect.left - PADDING,
                width: spotlightRect.width + PADDING * 2,
                height: spotlightRect.height + PADDING * 2,
                border: "2px solid rgba(255, 107, 53, 0.4)",
                boxShadow: "0 0 24px rgba(255, 107, 53, 0.15), inset 0 0 24px rgba(255, 107, 53, 0.05)",
              }}
            />
          )}

          {/* ─── Tooltip card ─── */}
          <motion.div
            key={`tooltip-${currentStep}`}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="w-[340px] sm:w-[380px] rounded-2xl p-6 z-10"
            style={{
              ...getTooltipStyle(),
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors hover-bg-overlay"
              style={{ color: "var(--fg-muted)" }}
              aria-label="Chiudi tour"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl mb-4"
              style={{
                background: `${step.iconColor}15`,
                border: `1px solid ${step.iconColor}30`,
              }}
            >
              <StepIcon className="w-5 h-5" style={{ color: step.iconColor }} />
            </div>

            {/* Content */}
            <h3
              className="text-base font-semibold mb-2"
              style={{ color: "var(--fg-primary)" }}
            >
              {step.title}
            </h3>
            <p
              className="text-sm leading-relaxed mb-5"
              style={{ color: "var(--fg-secondary)" }}
            >
              {step.description}
            </p>

            {/* Navigation row */}
            <div className="flex items-center justify-between">
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {TOUR_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentStep(i)}
                    className="w-2 h-2 rounded-full transition-all duration-300"
                    style={{
                      background:
                        i === currentStep
                          ? "var(--accent)"
                          : i < currentStep
                            ? "var(--success)"
                            : "var(--bg-active)",
                      transform: i === currentStep ? "scale(1.3)" : "scale(1)",
                    }}
                    aria-label={`Vai al passo ${i + 1}`}
                  />
                ))}
              </div>

              {/* Prev / Next buttons */}
              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={goPrev}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover-bg-overlay"
                    style={{ color: "var(--fg-secondary)" }}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Indietro
                  </button>
                )}
                <button
                  onClick={goNext}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-[1.03]"
                  style={{
                    background: "linear-gradient(to right, var(--accent), var(--accent-dark, #E85A24))",
                  }}
                >
                  {isLastStep ? "Ho capito!" : "Avanti"}
                  {!isLastStep && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Dismiss link */}
            <button
              onClick={dismiss}
              className="block w-full text-center mt-4 text-[11px] transition-colors hover-color-primary"
              style={{ color: "var(--fg-muted)" }}
            >
              Non mostrare piu
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
