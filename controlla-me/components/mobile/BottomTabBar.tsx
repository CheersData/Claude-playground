"use client";

import { useCallback, type ComponentType } from "react";
import { motion } from "framer-motion";
import { triggerHaptic } from "./haptic-utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface TabItem {
  /** Unique identifier for the tab */
  id: string;
  /** Display label (keep short for mobile) */
  label: string;
  /** Lucide icon component */
  icon: ComponentType<{ className?: string }>;
  /** Optional badge count (e.g. unread notifications) */
  badge?: number;
}

interface BottomTabBarProps {
  /** Tab definitions */
  tabs: TabItem[];
  /** Currently active tab id */
  activeTab: string;
  /** Called when a tab is tapped */
  onTabChange: (tabId: string) => void;
  /** Additional className on the container */
  className?: string;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function BottomTabBar({
  tabs,
  activeTab,
  onTabChange,
  className = "",
}: BottomTabBarProps) {
  const handleTabPress = useCallback(
    (tabId: string) => {
      if (tabId === activeTab) return;
      triggerHaptic("light");
      onTabChange(tabId);
    },
    [activeTab, onTabChange],
  );

  return (
    <nav
      className={`
        fixed bottom-0 left-0 right-0 z-50
        bg-[var(--bg-base)]/95 backdrop-blur-xl
        border-t border-[var(--border-dark-subtle)]
        pb-[env(safe-area-inset-bottom,0px)]
        md:hidden
        ${className}
      `}
      role="tablist"
      aria-label="Navigazione principale"
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => handleTabPress(tab.id)}
              className="relative flex flex-col items-center justify-center flex-1 h-full gap-0.5 touch-manipulation"
            >
              {/* Active indicator pill */}
              {isActive && (
                <motion.div
                  layoutId="bottomtab-indicator"
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[var(--accent)]"
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}

              {/* Icon with badge */}
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors duration-150 ${
                    isActive
                      ? "text-[var(--accent)]"
                      : "text-[var(--fg-muted)]"
                  }`}
                />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[var(--error)] text-[10px] font-bold text-white leading-none">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] leading-none transition-colors duration-150 ${
                  isActive
                    ? "text-[var(--accent)] font-semibold"
                    : "text-[var(--fg-muted)]"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
