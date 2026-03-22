"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlopeSignal {
  id: string;
  symbol: string | null;
  action: string;
  confidence: number;
  score: number; // slope_pct normalized
  entry_price: number | null;
  rationale: string;
  created_at: string;
}

interface TradePosition {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  current_price: number;
  unrealized_pnl_pct: number;
}

interface TradeOrder {
  symbol: string;
  side: string;
  status: string;
  filled_avg_price: number | null;
  filled_qty: number | null;
  filled_at: string | null;
  created_at: string | null;
}

interface KillSwitchStatus {
  active: boolean;
  reason: string | null;
  mode: string;
  enabled: boolean;
}

interface SlopeData {
  signals: SlopeSignal[];
  positions: TradePosition[];
  orders: TradeOrder[];
  kill_switch: KillSwitchStatus | null;
}

interface ClosedTrade {
  symbol: string;
  entry_price: number;
  exit_price: number;
  qty: number;
  pnl: number;
  pnl_pct: number;
  closed_at: string;
  partial: boolean;
}

interface OpenPosition {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  days_held: number;
}

interface PnlSummary {
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  trades_count: number;
  positions_count: number;
  closed_trades: ClosedTrade[];
  open_positions: OpenPosition[];
  as_of: string;
  days_window: number;
}

// Unified per-symbol row for the main table
interface SymbolRow {
  symbol: string;
  qty: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  lastPrice: number | null;
  trendAngle: number | null;
  signal: string | null;
  signalAt: string | null;
  rationale: string;
  isOpen: boolean;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  realizedPnl: number | null;
  realizedPnlPct: number | null;
  // Execution status: did the signal actually get executed?
  executionStatus: "filled" | "failed" | null;
}

// ---------------------------------------------------------------------------
// Sector map — etichette e categorie per heatmap
// ---------------------------------------------------------------------------

interface SectorInfo {
  name: string;
  category: "Mercato" | "Settori" | "Macro" | "Alternativi" | "Inversi";
}

const SECTOR_MAP: Record<string, SectorInfo> = {
  // Broad market
  SPY:  { name: "S&P 500",    category: "Mercato" },
  QQQ:  { name: "Nasdaq 100", category: "Mercato" },
  IWM:  { name: "Russell 2K", category: "Mercato" },
  // Sectors
  XLK:  { name: "Tecnologia",  category: "Settori" },
  XLF:  { name: "Finanziari",  category: "Settori" },
  XLE:  { name: "Energia",     category: "Settori" },
  XLV:  { name: "Sanità",      category: "Settori" },
  XLI:  { name: "Industriali", category: "Settori" },
  XLU:  { name: "Utilities",   category: "Settori" },
  XLP:  { name: "Stabili",     category: "Settori" },
  // Macro
  GLD:  { name: "Oro",         category: "Macro" },
  TLT:  { name: "Bond 20Y",    category: "Macro" },
  // Alternatives
  ARKK: { name: "Innovation",  category: "Alternativi" },
  // Inverse
  SH:   { name: "Short S&P",  category: "Inversi" },
  PSQ:  { name: "Short QQQ",  category: "Inversi" },
  DOG:  { name: "Short Dow",  category: "Inversi" },
};

const SECTOR_ORDER: SectorInfo["category"][] = [
  "Mercato", "Settori", "Macro", "Alternativi", "Inversi",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REFRESH_MS = 60 * 1000; // 1 minuto — allineato alla frequenza scheduler 1-min
const toAngle = (pct: number) => Math.atan(pct) * (180 / Math.PI);

const parseSlopeRationale = (
  rationale: string
): { prev: number | null; curr: number | null } => {
  const rev = rationale.match(/([+-]?\d+\.?\d*)%\s*->\s*([+-]?\d+\.?\d*)%/);
  if (rev) return { prev: parseFloat(rev[1]), curr: parseFloat(rev[2]) };
  const adv = rationale.match(/adverse_exit.*?\(([+-]?\d+\.?\d*)%\)/);
  if (adv) return { prev: null, curr: parseFloat(adv[1]) };
  return { prev: null, curr: null };
};

const buildRationale = (sig: SlopeSignal | null, isOpen: boolean): string => {
  if (!sig) return isOpen ? "Posizione in attesa di segnale" : "—";
  const isExit = ["SELL", "SHORT", "COVER"].includes(sig.action);
  const isAdverse = sig.rationale.toLowerCase().includes("adverse");
  const { prev, curr } = parseSlopeRationale(sig.rationale);
  const scorePct = curr ?? sig.score;
  const angle = scorePct !== null ? toAngle(scorePct) : null;
  const fmtA = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}°`;

  if (isExit && isAdverse)
    return `Slope avverso${angle !== null ? ` (${fmtA(angle)})` : ""} — uscita difensiva`;
  if (isExit && prev !== null && curr !== null)
    return `Inversione: ${fmtA(toAngle(prev))} → ${fmtA(toAngle(curr))}`;
  if (isExit)
    return `Uscita${angle !== null ? ` slope ${fmtA(angle)}` : ""}`;
  if (sig.action === "BUY") {
    if (angle !== null && Math.abs(angle) > 2)
      return `Slope positivo ${fmtA(angle)} — tendenza al rialzo`;
    return "Slope in recupero — posizione mantenuta";
  }
  return sig.rationale.slice(0, 90);
};

const signalBadge = (action: string | null) => {
  if (!action) return { label: "TIENI", cls: "bg-white/10 text-white/40" };
  if (action === "BUY") return { label: "COMPRA", cls: "bg-emerald-500/20 text-emerald-400" };
  if (["SELL", "SHORT", "COVER"].includes(action))
    return { label: "VENDI", cls: "bg-red-500/20 text-red-400" };
  return { label: "TIENI", cls: "bg-white/10 text-white/40" };
};

const fmt$ = (n: number | null, digits = 2) =>
  n !== null ? `${n >= 0 ? "+" : ""}$${Math.abs(n).toFixed(digits)}` : "—";
const fmt$abs = (n: number | null) =>
  n !== null ? `$${Math.abs(n).toFixed(2)}` : "—";
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const fmtTimeET = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });

function pnlColor(n: number | null): string {
  if (n === null) return "text-white/40";
  return n >= 0 ? "text-emerald-400" : "text-red-400";
}

function TrendIcon({ angle }: { angle: number | null }) {
  if (angle === null) return <Minus className="h-4 w-4 text-white/20" />;
  if (angle > 2) return <TrendingUp className="h-4 w-4 text-emerald-400" />;
  if (angle < -2) return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-white/40" />;
}

// Converte "2m fa", "25m fa", "1h fa"
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "ora";
  if (min < 60) return `${min}m fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PnlBar({ pnl, loading }: { pnl: PnlSummary | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 flex-1 animate-pulse rounded-lg bg-white/5" />
        ))}
      </div>
    );
  }

  if (!pnl) return null;

  const items = [
    {
      label: "P/L Realizzato",
      value: pnl.realized_pnl,
      sub: `${pnl.trades_count} trade${pnl.trades_count !== 1 ? " chiusi" : " chiuso"}`,
    },
    {
      label: "P/L In Corso",
      value: pnl.unrealized_pnl,
      sub: `${pnl.positions_count} posizion${pnl.positions_count !== 1 ? "i" : "e"} aperta${pnl.positions_count !== 1 ? "" : ""}`,
    },
    {
      label: "Totale",
      value: pnl.total_pnl,
      sub: `ultimi ${pnl.days_window}gg`,
    },
  ];

  return (
    <div className="flex gap-3">
      {items.map(({ label, value, sub }) => (
        <div
          key={label}
          className="flex-1 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3"
        >
          <div className="mb-0.5 text-xs text-white/35">{label}</div>
          <div className={`font-mono text-base font-semibold ${pnlColor(value)}`}>
            {fmt$(value, 0)}
          </div>
          <div className="text-xs text-white/25">{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sector Heatmap — rotazione settori
// ---------------------------------------------------------------------------

interface SectorCell {
  ticker: string;
  info: SectorInfo;
  angle: number | null;
  action: string | null;
  signalAt: string | null;
}

function SectorHeatmap({ signals }: { signals: SlopeSignal[] }) {
  // Memoize derived data — avoids impure Date.now() call on every render.
  const { byCategory, hasAnySignal } = useMemo(() => {
    // Date.now() is intentional: cutoff is re-evaluated only when signals change (useMemo dep).
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const latestBySymbol = new Map<string, SlopeSignal>();
    for (const sig of signals) {
      if (!sig.symbol || !SECTOR_MAP[sig.symbol]) continue;
      if (new Date(sig.created_at).getTime() < cutoff) continue;
      const existing = latestBySymbol.get(sig.symbol);
      if (!existing || new Date(sig.created_at) > new Date(existing.created_at)) {
        latestBySymbol.set(sig.symbol, sig);
      }
    }

    // Build cells per category
    const byCat = new Map<SectorInfo["category"], SectorCell[]>();
    for (const cat of SECTOR_ORDER) byCat.set(cat, []);

    for (const [ticker, info] of Object.entries(SECTOR_MAP)) {
      const sig = latestBySymbol.get(ticker) ?? null;
      let angle: number | null = null;
      if (sig) {
        const { curr } = parseSlopeRationale(sig.rationale);
        const scorePct = curr ?? sig.score;
        angle = scorePct !== null ? toAngle(scorePct) : null;
      }
      byCat.get(info.category)!.push({
        ticker,
        info,
        angle,
        action: sig?.action ?? null,
        signalAt: sig?.created_at ?? null,
      });
    }

    return { byCategory: byCat, hasAnySignal: latestBySymbol.size > 0 };
  }, [signals]);

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-medium text-white/60">Rotazione Settori</span>
        {!hasAnySignal && (
          <span className="text-xs text-white/25">Nessun segnale nelle ultime 24h</span>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        {SECTOR_ORDER.map((cat) => {
          const cells = byCategory.get(cat) ?? [];
          return (
            <div key={cat}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/25">
                {cat}
              </div>
              <div className="flex flex-col gap-1">
                {cells.map(({ ticker, info, angle, action, signalAt }) => {
                  const isPositive = angle !== null && angle > 2;
                  const isNegative = angle !== null && angle < -2;
                  const colorCls = isPositive
                    ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                    : isNegative
                    ? "text-red-400 border-red-500/20 bg-red-500/5"
                    : "text-white/35 border-white/5 bg-transparent";

                  return (
                    <div
                      key={ticker}
                      className={`flex items-center gap-2 rounded border px-2 py-1 ${colorCls}`}
                      title={
                        signalAt
                          ? `${action} · ${relativeTime(signalAt)} (${fmtTimeET(signalAt)} ET)`
                          : "Nessun segnale recente"
                      }
                    >
                      <span className="w-8 font-mono text-xs font-semibold">{ticker}</span>
                      <TrendIcon angle={angle} />
                      {angle !== null ? (
                        <span className="text-xs font-mono">
                          {angle >= 0 ? "+" : ""}
                          {angle.toFixed(1)}°
                        </span>
                      ) : (
                        <span className="text-xs text-white/20">—</span>
                      )}
                      <span className="text-xs text-white/20 truncate max-w-[52px]">
                        {info.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component principale
// ---------------------------------------------------------------------------

export function TradingSlopePanel() {
  const [data, setData] = useState<SlopeData | null>(null);
  const [pnl, setPnl] = useState<PnlSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pnlLoading, setPnlLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_MS);

  const fetchPnl = useCallback(async () => {
    setPnlLoading(true);
    try {
      const res = await fetch("/api/trading/pnl-summary?days=30", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PnlSummary = await res.json();
      setPnl(json);
    } catch {
      // non-fatal — pnl bar will be hidden
    } finally {
      setPnlLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trading/signals?strategy=slope_volume&limit=50&hours=48`,
        { headers: getConsoleAuthHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SlopeData = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setCountdown(REFRESH_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchPnl();
  }, [fetchData, fetchPnl]);

  // Auto-refresh countdown
  useEffect(() => {
    const iv = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1000) {
          fetchData();
          fetchPnl();
          return REFRESH_MS;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [fetchData, fetchPnl]);

  // Build unified per-symbol rows from positions + signals + orders + pnl
  const rows: SymbolRow[] = (() => {
    if (!data) return [];
    const map = new Map<string, SymbolRow>();

    // Index closed trades da pnl summary per symbol
    const closedBySymbol = new Map<string, ClosedTrade>();
    for (const t of pnl?.closed_trades ?? []) {
      const existing = closedBySymbol.get(t.symbol);
      if (!existing || new Date(t.closed_at) > new Date(existing.closed_at)) {
        closedBySymbol.set(t.symbol, t);
      }
    }

    // Index unrealized P&L da pnl summary (open positions con unrealized_pnl in $)
    const openPnlBySymbol = new Map<string, { pnl: number; pct: number }>();
    for (const op of pnl?.open_positions ?? []) {
      openPnlBySymbol.set(op.symbol, {
        pnl: op.unrealized_pnl,
        pct: op.unrealized_pnl_pct,
      });
    }

    // 1. Open positions (source of truth for buy price + last price)
    for (const pos of data.positions) {
      const pnlEntry = openPnlBySymbol.get(pos.symbol);
      map.set(pos.symbol, {
        symbol: pos.symbol,
        qty: pos.qty,
        buyPrice: pos.avg_entry_price,
        sellPrice: null,
        lastPrice: pos.current_price,
        trendAngle: null,
        signal: null,
        signalAt: null,
        rationale: "Posizione aperta",
        isOpen: true,
        unrealizedPnl: pnlEntry?.pnl ?? null,
        unrealizedPnlPct: pnlEntry?.pct ?? null,
        realizedPnl: null,
        realizedPnlPct: null,
        executionStatus: null,
      });
    }

    // 2. Latest signal per symbol → trend angle + signal + rationale
    const latestSignals = new Map<string, SlopeSignal>();
    for (const sig of data.signals) {
      if (!sig.symbol) continue;
      const existing = latestSignals.get(sig.symbol);
      if (!existing || new Date(sig.created_at) > new Date(existing.created_at)) {
        latestSignals.set(sig.symbol, sig);
      }
    }

    for (const [symbol, sig] of latestSignals) {
      const existing = map.get(symbol);
      const row: SymbolRow = existing ?? {
        symbol,
        qty: null,
        buyPrice: sig.action === "BUY" ? (sig.entry_price ?? null) : null,
        sellPrice: null,
        lastPrice: null,
        trendAngle: null,
        signal: null,
        signalAt: null,
        rationale: "—",
        isOpen: false,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
        realizedPnl: null,
        realizedPnlPct: null,
        executionStatus: null,
      };

      const { curr } = parseSlopeRationale(sig.rationale);
      const scorePct = curr ?? sig.score;
      row.trendAngle = scorePct !== null ? toAngle(scorePct) : null;
      row.signal = sig.action;
      row.signalAt = sig.created_at;
      row.rationale = buildRationale(sig, row.isOpen);

      // Per posizioni chiuse: recupera entry price dal segnale BUY se disponibile
      if (!row.isOpen && sig.action === "BUY" && sig.entry_price && !row.buyPrice) {
        row.buyPrice = sig.entry_price;
      }

      map.set(symbol, row);
    }

    // 3. Latest SELL order per symbol → sell price + qty sold + execution status
    const latestSells = new Map<string, TradeOrder>();
    for (const order of data.orders ?? []) {
      if (order.side !== "sell" || order.status !== "filled" || !order.filled_avg_price) continue;
      const existing = latestSells.get(order.symbol);
      if (!existing || new Date(order.filled_at!) > new Date(existing.filled_at!)) {
        latestSells.set(order.symbol, order);
      }
    }
    for (const [symbol, order] of latestSells) {
      const row = map.get(symbol);
      if (row) {
        row.sellPrice = order.filled_avg_price;
        row.executionStatus = "filled";
        // Per posizioni chiuse, la qty viene dall'ordine SELL
        if (!row.isOpen && row.qty === null && order.filled_qty) {
          row.qty = order.filled_qty;
        }
      }
    }

    // 3b. Detect FAILED SELL orders (held_for_orders, insufficient_qty, etc.)
    // If a SELL signal exists but the order was NOT filled → show warning in UI
    const latestFailedSells = new Map<string, TradeOrder>();
    for (const order of data.orders ?? []) {
      if (order.side !== "sell" || order.status === "filled") continue;
      const existing = latestFailedSells.get(order.symbol);
      const orderTime = order.filled_at ?? order.created_at;
      const existingTime = existing?.filled_at ?? existing?.created_at;
      if (!existing || (orderTime && existingTime && new Date(orderTime) > new Date(existingTime))) {
        latestFailedSells.set(order.symbol, order);
      }
    }
    for (const [symbol, _order] of latestFailedSells) {
      const row = map.get(symbol);
      // Mark as failed only if not already filled and signal is a sell action
      if (row && row.executionStatus !== "filled" && row.signal && ["SELL", "SHORT", "COVER"].includes(row.signal)) {
        row.executionStatus = "failed";
      }
    }

    // 4. Attach realized P&L da pnl-summary
    for (const [symbol, trade] of closedBySymbol) {
      const row = map.get(symbol);
      if (row && !row.isOpen) {
        row.realizedPnl = trade.pnl;
        row.realizedPnlPct = trade.pnl_pct;
        // Recupera buy price + sell price dal trade se non già disponibili
        if (!row.buyPrice) row.buyPrice = trade.entry_price;
        if (!row.sellPrice) row.sellPrice = trade.exit_price;
        // Qty dal trade chiuso come fallback
        if (row.qty === null) row.qty = trade.qty;
      }
    }

    // Sort: open positions first, then by signal time desc
    return Array.from(map.values()).sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      if (a.signalAt && b.signalAt)
        return new Date(b.signalAt).getTime() - new Date(a.signalAt).getTime();
      return 0;
    });
  })();

  const ks = data?.kill_switch;
  const countdownLabel = `${Math.floor(countdown / 60000)}:${String(
    Math.round((countdown % 60000) / 1000)
  ).padStart(2, "0")}`;

  // Freshness indicator
  const minutesSinceRefresh = lastRefresh
    ? Math.floor((Date.now() - lastRefresh.getTime()) / 60_000)
    : null;
  const freshnessDot =
    minutesSinceRefresh === null
      ? "bg-white/20"
      : minutesSinceRefresh < 6
      ? "bg-emerald-500"
      : minutesSinceRefresh < 15
      ? "bg-yellow-500"
      : "bg-red-500";

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-white">Monitor</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              ks?.mode === "live"
                ? "bg-green-500/20 text-green-400"
                : "bg-blue-500/20 text-blue-400"
            }`}
          >
            {ks?.mode ?? "paper"}
          </span>
          {ks?.active && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
              <AlertTriangle className="h-3 w-3" />
              KILL SWITCH
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${freshnessDot}`} />
            {lastRefresh
              ? lastRefresh.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
              : "—"}
          </span>
          <span className="text-white/20">↻ {countdownLabel}</span>
          <button
            onClick={() => { fetchData(); fetchPnl(); }}
            disabled={loading}
            className="rounded p-1 hover:text-white/80 disabled:opacity-30"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* P&L Summary bar */}
      <PnlBar pnl={pnl} loading={pnlLoading} />

      {error && (
        <div className="rounded bg-red-500/10 p-2 text-xs text-red-400">{error}</div>
      )}

      {/* Single unified table */}
      {rows.length === 0 && !loading ? (
        <p className="text-xs text-white/30">Nessun titolo monitorato nelle ultime 48h.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-[10px] md:text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white/30">
                <th className="py-2 px-3 text-left font-normal">Titolo</th>
                <th className="hidden md:table-cell py-2 px-3 text-right font-normal">Qty</th>
                <th className="hidden md:table-cell py-2 px-3 text-right font-normal">Acquisto</th>
                <th className="hidden md:table-cell py-2 px-3 text-right font-normal">Vendita</th>
                <th className="py-2 px-3 text-right font-normal">Ultimo</th>
                <th className="py-2 px-3 text-right font-normal">P&L</th>
                <th className="py-2 px-3 text-center font-normal">Trend</th>
                <th className="py-2 px-3 text-left font-normal">Segnale</th>
                <th className="hidden md:table-cell py-2 px-3 text-left font-normal">Perché</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => {
                const badge = signalBadge(row.signal);

                return (
                  <tr
                    key={row.symbol}
                    className={`hover:bg-white/[0.02] ${!row.isOpen ? "opacity-55" : ""}`}
                  >
                    {/* Titolo */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-white">
                          {row.symbol}
                        </span>
                        {row.isOpen && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                            title="Posizione aperta"
                          />
                        )}
                      </div>
                    </td>

                    {/* Qty — nascosta su mobile */}
                    <td className="hidden md:table-cell py-3 px-3 text-right font-mono text-white/50">
                      {row.qty !== null ? row.qty : "—"}
                    </td>

                    {/* Acquisto — nascosta su mobile */}
                    <td className="hidden md:table-cell py-3 px-3 text-right font-mono text-white/70">
                      {row.buyPrice !== null ? fmt$abs(row.buyPrice) : "—"}
                    </td>

                    {/* Vendita — nascosta su mobile */}
                    <td className="hidden md:table-cell py-3 px-3 text-right font-mono text-white/70">
                      {row.sellPrice !== null ? fmt$abs(row.sellPrice) : "—"}
                    </td>

                    {/* Ultimo prezzo */}
                    <td className="py-3 px-3 text-right font-mono text-white/70">
                      {row.isOpen
                        ? row.lastPrice !== null
                          ? fmt$abs(row.lastPrice)
                          : "—"
                        : row.sellPrice !== null
                        ? fmt$abs(row.sellPrice)
                        : "—"}
                    </td>

                    {/* P&L — colonna dedicata */}
                    <td className="py-3 px-3 text-right">
                      {row.isOpen ? (
                        // Posizione aperta: P&L unrealizzato
                        row.unrealizedPnl !== null ? (
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-mono font-semibold ${pnlColor(row.unrealizedPnl)}`}
                            >
                              {fmt$(row.unrealizedPnl, 2)}
                            </span>
                            {row.unrealizedPnlPct !== null && (
                              <span
                                className={`text-xs font-mono ${pnlColor(row.unrealizedPnlPct)}`}
                              >
                                {fmtPct(row.unrealizedPnlPct)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/25">—</span>
                        )
                      ) : (
                        // Posizione chiusa: P&L realizzato effettivo
                        row.realizedPnl !== null ? (
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-mono font-semibold ${pnlColor(row.realizedPnl)}`}
                            >
                              {fmt$(row.realizedPnl, 2)}
                            </span>
                            {row.realizedPnlPct !== null && (
                              <span
                                className={`text-xs font-mono ${pnlColor(row.realizedPnlPct)}`}
                              >
                                {fmtPct(row.realizedPnlPct)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/25">—</span>
                        )
                      )}
                    </td>

                    {/* Trend */}
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1">
                        <TrendIcon angle={row.trendAngle} />
                        {row.trendAngle !== null && (
                          <span
                            className={`text-xs font-mono ${
                              row.trendAngle > 2
                                ? "text-emerald-400"
                                : row.trendAngle < -2
                                ? "text-red-400"
                                : "text-white/40"
                            }`}
                          >
                            {row.trendAngle >= 0 ? "+" : ""}
                            {row.trendAngle.toFixed(1)}°
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Segnale */}
                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`inline-flex w-fit rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        {row.signalAt && (
                          <span className="text-xs text-white/30">
                            {fmtTimeET(row.signalAt)} ET
                          </span>
                        )}
                        {/* Execution status — mostra solo se rilevante */}
                        {row.executionStatus === "failed" && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-400">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Non eseguito
                          </span>
                        )}
                        {row.executionStatus === "filled" && row.isOpen === false && (
                          <span className="text-xs text-emerald-400/60">
                            ✓ Eseguito
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Perché — nascosta su mobile */}
                    <td className="hidden md:table-cell py-3 px-3 max-w-xs text-white/55">
                      {row.rationale}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sector Rotation Heatmap */}
      {data && <SectorHeatmap signals={data.signals} />}
    </div>
  );
}
