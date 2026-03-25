/**
 * Haptic feedback utilities for mobile-native UX.
 *
 * Uses the Vibration API (navigator.vibrate) which is supported on
 * Android Chrome, Samsung Internet, Opera Mobile, and other Chromium-based
 * mobile browsers. iOS Safari does not support it — calls are silently
 * ignored via the canVibrate guard.
 */

export type HapticIntensity = "light" | "medium" | "heavy";

/** Vibration patterns (ms) per intensity */
const PATTERNS: Record<HapticIntensity, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: [30, 20, 40],
};

/** Whether the current device supports vibration */
const canVibrate =
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  "vibrate" in navigator;

/**
 * Trigger haptic feedback at the given intensity.
 * No-op on devices that do not support the Vibration API.
 */
export function triggerHaptic(intensity: HapticIntensity = "medium"): void {
  if (!canVibrate) return;
  try {
    navigator.vibrate(PATTERNS[intensity]);
  } catch {
    // Silently ignore — some browsers throw in restricted contexts
  }
}
