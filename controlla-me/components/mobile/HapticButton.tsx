"use client";

import { useCallback, type ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import { triggerHaptic, type HapticIntensity } from "./haptic-utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface HapticButtonProps {
  /** Button content */
  children: ReactNode;
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Haptic intensity on tap. Default: "medium" */
  haptic?: HapticIntensity;
  /** Visual style variant */
  variant?: "primary" | "secondary" | "danger" | "ghost";
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Full width */
  fullWidth?: boolean;
  /** Loading state — disables button and shows spinner */
  loading?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** HTML button type */
  type?: "button" | "submit" | "reset";
  /** Accessible label */
  "aria-label"?: string;
  /** Additional className */
  className?: string;
}

/* ─── Tap animation variants ─────────────────────────────────────────────── */

const tapVariants: Variants = {
  idle: { scale: 1 },
  tap: { scale: 0.96 },
};

/* ─── Style maps ─────────────────────────────────────────────────────────── */

const variantStyles: Record<string, string> = {
  primary:
    "bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] active:bg-[var(--accent-dark)]",
  secondary:
    "bg-[var(--bg-overlay)] text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-dark)]",
  danger:
    "bg-[var(--error)]/15 text-[var(--error)] hover:bg-[var(--error)]/25 border border-[var(--error)]/30",
  ghost:
    "bg-transparent text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)]",
};

const sizeStyles: Record<string, string> = {
  sm: "h-8 px-3 text-xs rounded-[var(--radius-md)] gap-1.5",
  md: "h-10 px-4 text-sm rounded-[var(--radius-lg)] gap-2",
  lg: "h-12 px-6 text-base rounded-[var(--radius-lg)] gap-2.5",
};

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function HapticButton({
  children,
  onClick,
  haptic = "medium",
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled,
  type = "button",
  "aria-label": ariaLabel,
  className = "",
}: HapticButtonProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) return;
      triggerHaptic(haptic);
      onClick?.(e);
    },
    [disabled, loading, haptic, onClick],
  );

  const isDisabled = disabled || loading;

  return (
    <motion.button
      variants={tapVariants}
      initial="idle"
      whileTap={isDisabled ? undefined : "tap"}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      type={type}
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      className={`
        relative inline-flex items-center justify-center
        font-medium touch-manipulation select-none
        transition-colors duration-150
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${isDisabled ? "opacity-50 pointer-events-none" : ""}
        ${className}
      `}
    >
      {/* Loading spinner */}
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <svg
            className="animate-spin w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </span>
      )}

      {/* Content (invisible when loading to preserve layout) */}
      <span className={loading ? "invisible" : ""}>{children}</span>
    </motion.button>
  );
}
