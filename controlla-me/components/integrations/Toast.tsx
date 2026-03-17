"use client";

/**
 * Toast — Lightweight notification system for the integration UI.
 *
 * Usage:
 *   import { ToastProvider, useToast } from "@/components/integrations/Toast";
 *
 *   // Wrap your app/page:
 *   <ToastProvider>
 *     <YourComponent />
 *   </ToastProvider>
 *
 *   // In any child component:
 *   const toast = useToast();
 *   toast.success("Sync completata: 142 documenti importati");
 *   toast.warning("3 documenti non analizzabili");
 *   toast.error("Sync fallita: token scaduto");
 *   toast.info("Sync in corso...");
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertTriangle, XCircle, Info, X } from "lucide-react";

// ─── Types ───

type ToastType = "success" | "warning" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextValue {
  success: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

// ─── Config ───

const TOAST_CONFIG: Record<
  ToastType,
  {
    Icon: typeof CheckCircle;
    color: string;
    bg: string;
    border: string;
    glow: string;
  }
> = {
  success: {
    Icon: CheckCircle,
    color: "var(--success)",
    bg: "rgba(93, 228, 199, 0.08)",
    border: "rgba(93, 228, 199, 0.2)",
    glow: "0 0 20px rgba(93, 228, 199, 0.1)",
  },
  warning: {
    Icon: AlertTriangle,
    color: "var(--caution)",
    bg: "rgba(255, 250, 194, 0.08)",
    border: "rgba(255, 250, 194, 0.2)",
    glow: "0 0 20px rgba(255, 250, 194, 0.1)",
  },
  error: {
    Icon: XCircle,
    color: "var(--error)",
    bg: "rgba(229, 141, 120, 0.08)",
    border: "rgba(229, 141, 120, 0.2)",
    glow: "0 0 20px rgba(229, 141, 120, 0.1)",
  },
  info: {
    Icon: Info,
    color: "var(--info-bright)",
    bg: "rgba(137, 221, 255, 0.08)",
    border: "rgba(137, 221, 255, 0.2)",
    glow: "0 0 20px rgba(137, 221, 255, 0.1)",
  },
};

const DEFAULT_DURATION = 5000;
const MAX_TOASTS = 5;

// ─── Context ───

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

// ─── Provider ───

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, duration: number = DEFAULT_DURATION) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setToasts((prev) => {
        // Remove oldest if we hit the limit
        const trimmed = prev.length >= MAX_TOASTS ? prev.slice(1) : prev;
        return [...trimmed, { id, type, message, duration }];
      });

      // Auto-dismiss
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [dismiss]
  );

  const success = useCallback(
    (message: string, duration?: number) => addToast("success", message, duration),
    [addToast]
  );
  const warning = useCallback(
    (message: string, duration?: number) => addToast("warning", message, duration),
    [addToast]
  );
  const error = useCallback(
    (message: string, duration?: number) => addToast("error", message, duration),
    [addToast]
  );
  const info = useCallback(
    (message: string, duration?: number) => addToast("info", message, duration),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ success, warning, error, info, dismiss }}>
      {children}

      {/* Toast container — fixed bottom-right */}
      <div
        className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-2 pointer-events-none"
        style={{ maxWidth: "420px", width: "calc(100vw - 48px)" }}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ─── Toast Item ───

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const config = TOAST_CONFIG[toast.type];
  const { Icon } = config;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3.5 backdrop-blur-md"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        boxShadow: `${config.glow}, 0 8px 32px rgba(0, 0, 0, 0.3)`,
      }}
    >
      <Icon className="w-4.5 h-4.5 shrink-0 mt-0.5" style={{ color: config.color }} />

      <p className="flex-1 text-sm leading-snug" style={{ color: "var(--fg-primary)" }}>
        {toast.message}
      </p>

      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded-md transition-colors shrink-0"
        style={{ color: "var(--fg-muted)" }}
        aria-label="Chiudi notifica"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Auto-dismiss progress bar */}
      {toast.duration > 0 && (
        <motion.div
          className="absolute bottom-0 left-0 h-[2px] rounded-b-xl"
          style={{ background: config.color, opacity: 0.5 }}
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: toast.duration / 1000, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}

export default ToastProvider;
