"use client";

import { useCallback, useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { triggerHaptic } from "./haptic-utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface SwipeActionConfig {
  /** Background color of the action zone (Tailwind or CSS var) */
  color: string;
  /** Icon to display in the action zone */
  icon: ReactNode;
  /** Label shown under the icon */
  label?: string;
  /** Called when swipe threshold is reached */
  onAction: () => void;
}

interface SwipeActionProps {
  /** Main content to display */
  children: ReactNode;
  /** Left swipe action (swipe right to reveal) */
  leftAction?: SwipeActionConfig;
  /** Right swipe action (swipe left to reveal) */
  rightAction?: SwipeActionConfig;
  /** Distance in px to trigger the action. Default: 100 */
  threshold?: number;
  /** Additional className on the wrapper */
  className?: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const MAX_SWIPE = 160;

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function SwipeAction({
  children,
  leftAction,
  rightAction,
  threshold = 100,
  className = "",
}: SwipeActionProps) {
  const x = useMotionValue(0);
  const hasTriggeredHaptic = useRef(false);

  // Action zone opacity tied to drag distance
  const leftOpacity = useTransform(x, [0, threshold], [0.4, 1]);
  const rightOpacity = useTransform(x, [-threshold, 0], [1, 0.4]);

  // Scale effect on the action icon when near threshold
  const leftScale = useTransform(x, [0, threshold * 0.8, threshold], [0.6, 0.9, 1.1]);
  const rightScale = useTransform(
    x,
    [-threshold, -threshold * 0.8, 0],
    [1.1, 0.9, 0.6],
  );

  const handleDrag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const offset = info.offset.x;
      const pastThreshold =
        (leftAction && offset > threshold) ||
        (rightAction && offset < -threshold);

      if (pastThreshold && !hasTriggeredHaptic.current) {
        triggerHaptic("medium");
        hasTriggeredHaptic.current = true;
      } else if (!pastThreshold) {
        hasTriggeredHaptic.current = false;
      }
    },
    [leftAction, rightAction, threshold],
  );

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const offset = info.offset.x;

      if (leftAction && offset > threshold) {
        triggerHaptic("heavy");
        leftAction.onAction();
      } else if (rightAction && offset < -threshold) {
        triggerHaptic("heavy");
        rightAction.onAction();
      }

      hasTriggeredHaptic.current = false;
    },
    [leftAction, rightAction, threshold],
  );

  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-lg)] ${className}`}>
      {/* Left action zone (revealed on swipe right) */}
      {leftAction && (
        <motion.div
          className="absolute inset-y-0 left-0 w-[160px] flex items-center justify-center"
          style={{
            backgroundColor: leftAction.color,
            opacity: leftOpacity,
          }}
          aria-hidden
        >
          <motion.div
            className="flex flex-col items-center gap-1"
            style={{ scale: leftScale }}
          >
            {leftAction.icon}
            {leftAction.label && (
              <span className="text-[10px] font-medium text-white/90">
                {leftAction.label}
              </span>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Right action zone (revealed on swipe left) */}
      {rightAction && (
        <motion.div
          className="absolute inset-y-0 right-0 w-[160px] flex items-center justify-center"
          style={{
            backgroundColor: rightAction.color,
            opacity: rightOpacity,
          }}
          aria-hidden
        >
          <motion.div
            className="flex flex-col items-center gap-1"
            style={{ scale: rightScale }}
          >
            {rightAction.icon}
            {rightAction.label && (
              <span className="text-[10px] font-medium text-white/90">
                {rightAction.label}
              </span>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Draggable content */}
      <motion.div
        className="relative z-10 bg-[var(--bg-raised)] touch-pan-y"
        style={{ x }}
        drag="x"
        dragConstraints={{
          left: rightAction ? -MAX_SWIPE : 0,
          right: leftAction ? MAX_SWIPE : 0,
        }}
        dragElastic={0.2}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 35,
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
