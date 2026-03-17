"use client";

/**
 * Skeletons — Pulse-animated loading skeletons for integration UI.
 *
 * Components:
 *   - ConnectorCardSkeleton — grid placeholder for ConnectorCard
 *   - SyncDashboardSkeleton — stats + card list placeholder
 *   - SyncHistorySkeleton — table row placeholders
 */

import { motion } from "framer-motion";

// ─── Shared shimmer block ───

function Bone({
  w,
  h,
  rounded = "rounded-md",
  className = "",
}: {
  w: string;
  h: string;
  rounded?: string;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse ${rounded} ${className}`}
      style={{
        width: w,
        height: h,
        background:
          "linear-gradient(90deg, var(--bg-overlay) 0%, var(--bg-raised) 50%, var(--bg-overlay) 100%)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.8s ease-in-out infinite",
      }}
    />
  );
}

// ─── ConnectorCard Skeleton ───

export function ConnectorCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="relative flex flex-col gap-4 rounded-xl p-6"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Icon + badge row */}
      <div className="flex items-start justify-between">
        <Bone w="48px" h="48px" rounded="rounded-lg" />
        <Bone w="64px" h="20px" rounded="rounded-full" />
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Bone w="60%" h="20px" />
        <Bone w="40%" h="16px" rounded="rounded-full" />
      </div>

      {/* Description */}
      <div className="space-y-1.5 flex-1">
        <Bone w="100%" h="14px" />
        <Bone w="85%" h="14px" />
        <Bone w="60%" h="14px" />
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        <Bone w="8px" h="8px" rounded="rounded-full" />
        <Bone w="80px" h="12px" />
      </div>

      {/* CTA button */}
      <Bone w="100%" h="44px" rounded="rounded-xl" />
    </motion.div>
  );
}

// ─── SyncDashboard Skeleton ───

export function SyncDashboardSkeleton() {
  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl p-5 flex flex-col items-center gap-2"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            <Bone w="60px" h="32px" />
            <Bone w="120px" h="12px" />
          </div>
        ))}
      </div>

      {/* Card list */}
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.3 }}
            className="rounded-xl p-6"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Bone w="40px" h="40px" rounded="rounded-lg" />
                <div className="space-y-1.5">
                  <Bone w="120px" h="18px" />
                  <Bone w="80px" h="12px" />
                </div>
              </div>
              <Bone w="28px" h="28px" rounded="rounded-lg" />
            </div>
            <div className="flex items-center gap-3">
              <Bone w="8px" h="8px" rounded="rounded-full" />
              <Bone w="100px" h="14px" />
              <Bone w="140px" h="14px" />
              <Bone w="80px" h="14px" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── SyncHistory Skeleton ───

export function SyncHistorySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Header */}
      <div
        className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr] gap-4 px-5 py-3"
        style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
      >
        {[100, 60, 70, 80, 50].map((w, i) => (
          <Bone key={i} w={`${w}px`} h="12px" />
        ))}
      </div>

      {/* Rows */}
      <div className="p-2 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
            className="rounded-lg px-3 py-3"
            style={{ background: "var(--bg-overlay)" }}
          >
            <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr] gap-4 items-center">
              <Bone w="100px" h="16px" />
              <Bone w="70px" h="14px" />
              <div className="flex items-center gap-1.5">
                <Bone w="14px" h="14px" rounded="rounded-full" />
                <Bone w="60px" h="20px" rounded="rounded-full" />
              </div>
              <Bone w="50px" h="14px" />
              <Bone w="40px" h="14px" />
            </div>
            {/* Mobile */}
            <div className="md:hidden space-y-2">
              <Bone w="100px" h="16px" />
              <div className="flex gap-3">
                <Bone w="60px" h="14px" />
                <Bone w="60px" h="20px" rounded="rounded-full" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Connector Sync Tab Skeleton ───

export function ConnectorSyncSkeleton() {
  return (
    <div>
      {/* Status badge + action */}
      <div className="flex items-center justify-between mb-4">
        <Bone w="140px" h="32px" rounded="rounded-full" />
        <Bone w="100px" h="36px" rounded="rounded-xl" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl p-4 flex flex-col items-center gap-2"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            <Bone w="80px" h="24px" />
            <Bone w="100px" h="12px" />
          </div>
        ))}
      </div>

      {/* Sync button row */}
      <div className="flex items-center justify-between mb-6">
        <Bone w="200px" h="24px" />
        <Bone w="160px" h="40px" rounded="rounded-xl" />
      </div>

      {/* Chart placeholder */}
      <div
        className="rounded-xl p-5 mb-6"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        <div className="flex items-end gap-2 h-40">
          {[40, 60, 35, 80, 55, 70, 45].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 justify-end h-full">
              <Bone w="100%" h={`${h}%`} rounded="rounded-t-sm" />
              <Bone w="28px" h="10px" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ConnectorCardSkeleton;
