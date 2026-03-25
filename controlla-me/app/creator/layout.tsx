"use client";

import {
  useState,
  useEffect,
  useCallback,
  useContext,
  createContext,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  LayoutDashboard,
  Building2,
  Settings,
  ChevronLeft,
  LogOut,
  Shield,
  Loader2,
  UserX,
} from "lucide-react";
// Auth: whitelist + HMAC token (same as /ops, no OAuth)

// ─── Context ─────────────────────────────────────────────────────────────────

interface CreatorContextValue {
  userId: string;
  userName: string;
  userRole: string;
  userEmail: string;
  getAuthHeaders: () => HeadersInit;
}

const CreatorContext = createContext<CreatorContextValue>({
  userId: "",
  userName: "",
  userRole: "creator",
  userEmail: "",
  getAuthHeaders: () => ({}),
});

export function useCreator() {
  return useContext(CreatorContext);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "chat",
    label: "Chat",
    href: "/creator",
    icon: MessageCircle,
  },
  {
    id: "departments",
    label: "Dipartimenti",
    href: "/creator/departments",
    icon: Building2,
  },
  {
    id: "settings",
    label: "Impostazioni",
    href: "/creator/settings",
    icon: Settings,
  },
];

// ─── Desktop Sidebar ─────────────────────────────────────────────────────────

function DesktopSidebar({
  collapsed,
  onToggle,
  currentPath,
  userName,
  userRole,
  onLogout,
}: {
  collapsed: boolean;
  onToggle: () => void;
  currentPath: string;
  userName: string;
  userRole: string;
  onLogout: () => void;
}) {
  const router = useRouter();

  function isActive(href: string): boolean {
    if (href === "/creator") return currentPath === "/creator";
    return currentPath.startsWith(href);
  }

  return (
    <motion.aside
      className="hidden md:flex flex-col flex-shrink-0 h-screen sticky top-0 border-r border-gray-200 bg-white z-30"
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-100">
        <div className="w-8 h-8 rounded-xl bg-[#FF6B35] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">P</span>
        </div>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="font-serif text-lg text-gray-900 tracking-tight"
          >
            Poimandres
          </motion.span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
        >
          <ChevronLeft
            className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              onClick={() => router.push(item.href)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150 cursor-pointer
                ${collapsed ? "justify-center" : ""}
                ${active ? "bg-[#FFF0EB] text-[#FF6B35]" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"}
              `}
              whileTap={{ scale: 0.97 }}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </motion.button>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-gray-100">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#FF8C61] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-semibold">
                {userName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {userName}
              </p>
              <p className="text-[11px] text-[#FF6B35] font-medium">
                {userRole}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Esci"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#FF8C61] flex items-center justify-center">
              <span className="text-white text-xs font-semibold">
                {userName.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}

// ─── Mobile Bottom Tab Bar ───────────────────────────────────────────────────

function MobileTabBar({ currentPath }: { currentPath: string }) {
  const router = useRouter();

  function isActive(href: string): boolean {
    if (href === "/creator") return currentPath === "/creator";
    return currentPath.startsWith(href);
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-200 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              onClick={() => router.push(item.href)}
              className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-colors ${
                active ? "text-[#FF6B35]" : "text-gray-400"
              }`}
              whileTap={{ scale: 0.9 }}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {active && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[#FF6B35]"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Mobile Header ───────────────────────────────────────────────────────────

function MobileHeader({
  userName,
  onLogout,
}: {
  userName: string;
  onLogout: () => void;
}) {
  return (
    <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-gray-100 bg-white/95 backdrop-blur-lg sticky top-0 z-30">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-[#FF6B35] flex items-center justify-center">
          <span className="text-white text-xs font-bold">P</span>
        </div>
        <span className="font-serif text-base text-gray-900 tracking-tight">
          Poimandres
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#FF8C61] flex items-center justify-center">
          <span className="text-white text-xs font-semibold">
            {userName.charAt(0).toUpperCase()}
          </span>
        </div>
        <button
          onClick={onLogout}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
          title="Esci"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (token: string, user: { nome: string; cognome: string; ruolo: string; role: string }) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/console/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const data = await res.json();
      if (data.authorized && data.token) {
        sessionStorage.setItem("creator-token", data.token);
        onLogin(data.token, data.user);
      } else {
        setError(data.message || "Accesso non autorizzato.");
      }
    } catch {
      setError("Errore di connessione. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F9FAFB]">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-sm w-full text-center"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="w-16 h-16 rounded-2xl bg-[#FF6B35] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#FF6B35]/20"
        >
          <span className="text-white text-2xl font-bold">P</span>
        </motion.div>

        {/* Branding */}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="font-serif text-3xl text-gray-900 tracking-tight mb-1"
        >
          Poimandres
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="text-sm text-gray-400 font-medium tracking-wide uppercase mb-10"
        >
          La Mente Collettiva
        </motion.p>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8"
        >
          <p className="text-sm text-gray-500 mb-6">
            Inserisci le tue credenziali per accedere.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nome Cognome, Ruolo"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] transition-all"
            />
            <motion.button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FF6B35] text-white text-sm font-medium hover:bg-[#FF8C61] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={loading ? {} : { scale: 1.01 }}
              whileTap={loading ? {} : { scale: 0.98 }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : null}
              {loading ? "Verifica in corso..." : "Accedi"}
            </motion.button>
          </form>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-red-500 mt-3"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-[11px] text-gray-300 mt-6"
        >
          Accesso riservato ai membri del team
        </motion.p>
      </motion.div>
    </div>
  );
}

function AuthError({
  message,
  variant = "forbidden",
}: {
  message: string;
  variant?: "forbidden" | "deactivated";
}) {
  const router = useRouter();
  const isDeactivated = variant === "deactivated";
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F9FAFB]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-sm w-full text-center p-8 rounded-2xl border border-gray-200 shadow-sm bg-white"
      >
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 ${
            isDeactivated ? "bg-amber-50" : "bg-red-50"
          }`}
        >
          {isDeactivated ? (
            <UserX className="w-7 h-7 text-amber-500" />
          ) : (
            <Shield className="w-7 h-7 text-red-500" />
          )}
        </div>
        <h2 className="text-xl font-serif text-gray-900 mb-2">
          {isDeactivated ? "Account disattivato" : "Accesso riservato ai Creator"}
        </h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <motion.button
          onClick={() => router.push("/")}
          className="px-6 py-2.5 rounded-xl text-sm font-medium bg-[#FF6B35] text-white hover:bg-[#FF8C61] transition-colors"
          whileTap={{ scale: 0.97 }}
        >
          Torna alla home
        </motion.button>
      </motion.div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin" />
        <span className="text-sm text-gray-400">
          Verifica autenticazione...
        </span>
      </motion.div>
    </div>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export default function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authState, setAuthState] = useState<
    "loading" | "authenticated" | "unauthenticated" | "forbidden" | "deactivated"
  >("loading");
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("Creator");
  const [userRole, setUserRole] = useState("creator");
  const [userEmail, setUserEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  // Decode token payload (base64url) without verification (client-side display only)
  const decodeTokenPayload = useCallback((token: string) => {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const payload = parts[0];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }, []);

  const handleLogin = useCallback((token: string, user: { nome: string; cognome: string; ruolo: string; role: string }) => {
    setUserId(user.role);
    setUserName(`${user.nome} ${user.cognome}`.trim());
    setUserRole(user.role || user.ruolo);
    setUserEmail("");
    setAuthState("authenticated");
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("creator-token");
      if (!token) {
        setAuthState("unauthenticated");
        return;
      }

      // Decode token to get user info
      const payload = decodeTokenPayload(token);
      if (!payload) {
        sessionStorage.removeItem("creator-token");
        setAuthState("unauthenticated");
        return;
      }

      // Check expiry
      if (payload.exp && Date.now() > payload.exp) {
        sessionStorage.removeItem("creator-token");
        setAuthState("unauthenticated");
        return;
      }

      setUserId(payload.sid || "");
      setUserName(`${payload.nome || ""} ${payload.cognome || ""}`.trim() || "Creator");
      setUserRole(payload.role || payload.ruolo || "creator");
      setUserEmail("");
      setAuthState("authenticated");
    } catch {
      setAuthState("unauthenticated");
    }
  }, [decodeTokenPayload]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogout = () => {
    sessionStorage.removeItem("creator-token");
    setAuthState("unauthenticated");
  };

  // ─── Render gates ───────────────────────────────────────────────────────────

  if (authState === "loading") return <LoadingScreen />;

  if (authState === "unauthenticated") {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (authState === "deactivated") {
    return (
      <AuthError
        message={
          errorMessage ||
          "Il tuo account e' stato disattivato. Contatta un amministratore per riattivarlo."
        }
        variant="deactivated"
      />
    );
  }

  if (authState === "forbidden") {
    return (
      <AuthError
        message={
          errorMessage ||
          "Questa sezione e' riservata ai Creator. Il tuo ruolo attuale non ha i permessi necessari."
        }
        variant="forbidden"
      />
    );
  }

  return (
    <CreatorContext.Provider
      value={{ userId, userName, userRole, userEmail, getAuthHeaders: (): Record<string, string> => {
        const token = sessionStorage.getItem("creator-token");
        return token ? { Authorization: `Bearer ${token}` } : {};
      } }}
    >
      <div className="min-h-screen flex bg-[#F9FAFB]">
        {/* Desktop sidebar */}
        <DesktopSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          currentPath={pathname}
          userName={userName}
          userRole={userRole}
          onLogout={handleLogout}
        />

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0">
          <MobileHeader userName={userName} onLogout={handleLogout} />
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* Mobile bottom tab bar */}
        <MobileTabBar currentPath={pathname} />
      </div>
    </CreatorContext.Provider>
  );
}
