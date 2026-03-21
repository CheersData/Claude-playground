"use client";

/**
 * Integration Layout — wraps all /integrazione pages.
 *
 * Provides:
 * 1. IntegrationPanelContext — shared state for the floating agent panel
 *    (open/close, current connector context)
 * 2. Floating chat button (bottom-right, 56px circle, accent color)
 *    with pulsing dot + "Assistente AI" label on hover
 * 3. IntegrationAgentPanel rendered at layout level so it persists
 *    across catalog ↔ detail page navigation
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bot } from "lucide-react";
import IntegrationAgentPanel from "@/components/integrations/IntegrationAgentPanel";
import { ToastProvider } from "@/components/integrations/Toast";

// ─── Context ───

interface PanelContextValue {
  isOpen: boolean;
  open: (connectorType?: string, connectorId?: string) => void;
  close: () => void;
  setConnector: (connectorType?: string, connectorId?: string) => void;
}

const IntegrationPanelContext = createContext<PanelContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  setConnector: () => {},
});

export function useIntegrationPanel() {
  return useContext(IntegrationPanelContext);
}

// ─── Layout Component ───

export default function IntegrazioneLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [connectorType, setConnectorType] = useState<string | undefined>();
  const [connectorId, setConnectorId] = useState<string | undefined>();

  // Hide the floating button on connector detail pages (they have their own panel trigger)
  const isDetailPage = pathname !== "/integrazione" && pathname !== "/integrazione/dashboard";

  const open = useCallback((type?: string, id?: string) => {
    if (type) setConnectorType(type);
    if (id) setConnectorId(id);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const setConnector = useCallback((type?: string, id?: string) => {
    setConnectorType(type);
    setConnectorId(id);
  }, []);

  return (
    <IntegrationPanelContext.Provider
      value={{ isOpen, open, close, setConnector }}
    >
      <ToastProvider>
      {children}

      {/* ─── Floating chat button (hidden on detail pages to avoid duplication) ─── */}
      <AnimatePresence>
        {!isOpen && !isDetailPage && (
          <motion.div
            className="fixed bottom-6 right-6 z-50"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <button
              onClick={() => open(connectorType, connectorId)}
              className="agent-fab group relative flex items-center justify-center w-14 h-14 rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent), var(--accent-dark, #E85A24))",
                boxShadow:
                  "0 4px 24px rgba(255, 107, 53, 0.35), 0 2px 8px rgba(0,0,0,0.3)",
              }}
              aria-label="Apri assistente integrazione AI"
            >
              <Bot className="w-6 h-6" />

              {/* Pulsing availability dot */}
              <span
                className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full"
                style={{
                  background: "var(--success)",
                  border: "2px solid var(--bg-base)",
                  animation: "agent-dot-pulse 2s ease-in-out infinite",
                }}
              />
            </button>

            {/* Tooltip label — visible on hover (placed after button for CSS ~ selector) */}
            <div className="agent-fab-tooltip absolute bottom-full right-0 mb-2 pointer-events-none opacity-0 transition-opacity">
              <span
                className="block whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg"
                style={{
                  background: "var(--bg-overlay)",
                  color: "var(--fg-primary)",
                  border: "1px solid var(--border-dark)",
                }}
              >
                Assistente AI
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Floating agent panel ─── */}
      <IntegrationAgentPanel
        isOpen={isOpen}
        onClose={close}
        connectorType={connectorType}
        connectorId={connectorId}
      />
      </ToastProvider>
    </IntegrationPanelContext.Provider>
  );
}
