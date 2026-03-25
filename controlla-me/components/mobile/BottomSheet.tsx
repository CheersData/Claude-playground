"use client";

import { useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { X } from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface BottomSheetProps {
  /** Whether the sheet is visible */
  open: boolean;
  /** Called when the sheet requests to close (backdrop tap, swipe, X button) */
  onClose: () => void;
  /** Sheet content */
  children: ReactNode;
  /** Optional title rendered in the header */
  title?: string;
  /** Height snap points as vh fractions (0-1). Default: [0.5, 0.92] */
  snapPoints?: [number, number];
  /** Whether the sheet can be dismissed by swiping down. Default: true */
  swipeToDismiss?: boolean;
  /** Additional className on the sheet container */
  className?: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const DISMISS_THRESHOLD = 120; // px drag down to dismiss
const DRAG_ELASTIC = 0.3;

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function BottomSheet({
  open,
  onClose,
  children,
  title,
  snapPoints = [0.5, 0.92],
  swipeToDismiss = true,
  className = "",
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(0);

  // Backdrop opacity tied to drag distance
  const backdropOpacity = useTransform(dragY, [0, 300], [1, 0]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape key closes the sheet
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!swipeToDismiss) return;
      // Dismiss if dragged far enough or with enough velocity
      if (info.offset.y > DISMISS_THRESHOLD || info.velocity.y > 500) {
        onClose();
      }
    },
    [onClose, swipeToDismiss],
  );

  // Calculate max height from the larger snap point
  const maxHeight = `${snapPoints[1] * 100}vh`;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ opacity: backdropOpacity }}
            onClick={onClose}
            aria-hidden
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            className={`relative z-10 w-full max-w-lg rounded-t-[20px] bg-[var(--bg-raised)] shadow-2xl flex flex-col ${className}`}
            style={{
              maxHeight,
              y: dragY,
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 300,
              mass: 0.8,
            }}
            drag={swipeToDismiss ? "y" : false}
            dragConstraints={{ top: 0 }}
            dragElastic={DRAG_ELASTIC}
            onDragEnd={handleDragEnd}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? "Bottom sheet"}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1 rounded-full bg-[var(--fg-muted)]/40" />
            </div>

            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-5 pb-3 border-b border-[var(--border-dark-subtle)]">
                <h2 className="text-[var(--fg-primary)] font-semibold text-base">
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                  aria-label="Chiudi"
                >
                  <X className="w-4.5 h-4.5 text-[var(--fg-muted)]" />
                </button>
              </div>
            )}

            {/* Content — scrollable */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
