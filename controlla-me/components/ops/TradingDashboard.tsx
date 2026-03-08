"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Activity } from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ---- Types ----

interface Position {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  sector: string | null;
  days_held: number;
  updated_at: string;
}

interface Order {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  order_type: string;
  status: string;
  filled_avg_price: number | null;
  filled_qty: number | null;
  filled_at: string | null;
  stop_loss: number | null;
  take_profit: number | null;
  created_at: string;
}

interface Snapshot {
  date: string;
  portfolio_value: number;
  cash: number;
  positions_value: number;
  daily_pnl: number | null;
  daily_pnl_pct: number | null;
  weekly_pnl_pct: number | null;
  max_drawdown_pct: number | null;
  sharpe_30d: number | null;
  win_rate: number | null;
  positions_count: number;
}

interface TradingConfig {
  mode: "paper" | "live" | "backtest";
  enabled: boolean;
  kill_switch_active: boolean;
  kill_switch_reason: string | null;
  kill_switch_at: string | null;
}

interface TradingData {
  positions: Position[];
  orders: Order[];
  snapshots: Snapshot[];
  config: TradingConfig | null;
  timestamp: string;
}

// ---- Helpers ----

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pnlColor(v: number) {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-zinc-400";
}

function pnlBg(v: number) {
  if (v > 0) return "bg-emerald-500/10 text-emerald-400";
  if (v < 0) return "bg-red-500/10 text-red-400";
  return "bg-zinc-700/50 text-zinc-400";
}

const STATUS_LABELS: Record<string, string> = {
  filled: "eseguito",
  partially_filled: "parz. eseguito",
  pending: "in attesa",
  submitted: "inviato",
  cancelled: "cancellato",
  rejected: "rifiutato",
  expired: "scaduto",
};

// ---- Custom Tooltip per il grafico ----

interface TooltipPayloadItem {
  value: number;
  dataKey: string;
}

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div className="bg-[var(--ops-surface)] border border-[var(--ops-border)] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className="text-white font-semibold">${fmt(val, 0)}</p>
      {payload[1] && (
        <p className={`mt-0.5 ${payload[1].value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          P&L: {payload[1].value >= 0 ? "+" : ""}
          {fmt(payload[1].value, 2)}%
        </p>
      )}
    </div>
  );
};

// ---- Main Component ----

export function TradingDashboard() {
  const [data, setData] = useState<TradingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"positions" | "orders">("positions");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trading/dashboard", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento dati");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Caricamento dati trading...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl p-6">
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      </div>
    );
  }

  const { positions = [], orders = [], snapshots = [], config } = data ?? {};

  // Dati grafico — portfolio value + daily pnl pct
  const chartData = snapshots.map((s) => ({
    date: fmtDate(s.date),
    value: s.portfolio_value,
    pnl_pct: s.daily_pnl_pct ?? 0,
  }));

  // Metriche riassuntive
  const totalPnL = positions.reduce((s, p) => s + p.unrealized_pnl, 0);
  const totalValue = positions.reduce((s, p) => s + p.market_value, 0);
  const latestSnapshot = snapshots[snapshots.length - 1];
  const portfolioValue = latestSnapshot?.portfolio_value ?? totalValue;
  const cashValue = latestSnapshot?.cash ?? 0;
  const winRate = latestSnapshot?.win_rate;

  const filledOrders = orders.filter((o) => o.status === "filled" || o.status === "partially_filled");
  const buyCount = filledOrders.filter((o) => o.side === "buy").length;
  const sellCount = filledOrders.filter((o) => o.side === "sell").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#FF6B35]" />
          <h2 className="text-sm font-semibold text-white">Trading</h2>
          {config && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                config.kill_switch_active
                  ? "bg-red-500/20 text-red-400"
                  : config.mode === "live"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-yellow-500/20 text-yellow-400"
              }`}
            >
              {config.kill_switch_active ? "KILL SWITCH" : config.mode.toUpperCase()}
            </span>
          )}
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          aggiorna
        </button>
      </div>

      {/* Kill Switch Alert */}
      {config?.kill_switch_active && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Kill Switch Attivo</p>
            {config.kill_switch_reason && (
              <p className="text-xs text-red-400/70 mt-0.5">{config.kill_switch_reason}</p>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Portfolio</p>
          <p className="text-base font-semibold text-white">${fmt(portfolioValue, 0)}</p>
          <p className="text-xs text-zinc-500 mt-0.5">cash ${fmt(cashValue, 0)}</p>
        </div>
        <div className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">P&L aperto</p>
          <p className={`text-base font-semibold ${pnlColor(totalPnL)}`}>
            {totalPnL >= 0 ? "+" : ""}${fmt(Math.abs(totalPnL))}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{positions.length} posizioni</p>
        </div>
        <div className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Ordini (30gg)</p>
          <p className="text-base font-semibold text-white">{filledOrders.length}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {buyCount} buy · {sellCount} sell
          </p>
        </div>
        <div className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Win Rate</p>
          <p className={`text-base font-semibold ${winRate != null ? (winRate >= 0.5 ? "text-emerald-400" : "text-red-400") : "text-zinc-400"}`}>
            {winRate != null ? `${fmt(winRate * 100, 0)}%` : "—"}
          </p>
          {latestSnapshot?.sharpe_30d != null && (
            <p className="text-xs text-zinc-500 mt-0.5">Sharpe {fmt(latestSnapshot.sharpe_30d)}</p>
          )}
        </div>
      </div>

      {/* Grafico P&L */}
      {chartData.length > 0 ? (
        <div className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl p-4">
          <p className="text-xs font-medium text-zinc-400 mb-3">Performance Portfolio (30gg)</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#FF6B35" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#71717a" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#71717a" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={100000} stroke="#3f3f46" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#FF6B35"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
                dot={false}
                activeDot={{ r: 4, fill: "#FF6B35", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl p-4 text-center">
          <p className="text-xs text-zinc-500">Nessuno snapshot disponibile per il grafico</p>
          <p className="text-xs text-zinc-600 mt-1">I dati appaiono dopo il primo portfolio snapshot giornaliero</p>
        </div>
      )}

      {/* Tabs: Posizioni / Ordini */}
      <div className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-xl overflow-hidden">
        <div className="flex border-b border-[var(--ops-border-subtle)]">
          <button
            onClick={() => setActiveTab("positions")}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === "positions"
                ? "text-white border-b-2 border-[#FF6B35] -mb-px"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Posizioni aperte ({positions.length})
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === "orders"
                ? "text-white border-b-2 border-[#FF6B35] -mb-px"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Ordini recenti ({orders.length})
          </button>
        </div>

        {/* Posizioni */}
        {activeTab === "positions" && (
          <div>
            {positions.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-zinc-500">Nessuna posizione aperta</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--ops-border-subtle)]">
                      <th className="text-left px-4 py-2 text-zinc-500 font-medium">Simbolo</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium">Qtà</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium">Entry</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium">Attuale</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium">Valore</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium">P&L $</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium">P&L %</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium hidden sm:table-cell">Giorni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={p.symbol} className="border-b border-[var(--ops-border-subtle)] hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{p.symbol}</span>
                            {p.sector && (
                              <span className="text-zinc-600 hidden sm:inline">{p.sector}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">{p.qty}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">${fmt(p.avg_entry_price)}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">${fmt(p.current_price)}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">${fmt(p.market_value, 0)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${pnlColor(p.unrealized_pnl)}`}>
                          {p.unrealized_pnl >= 0 ? "+" : ""}${fmt(Math.abs(p.unrealized_pnl))}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${pnlBg(p.unrealized_pnl_pct)}`}>
                            {p.unrealized_pnl_pct >= 0 ? "+" : ""}{fmt(p.unrealized_pnl_pct)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-500 hidden sm:table-cell">{p.days_held}gg</td>
                      </tr>
                    ))}
                  </tbody>
                  {positions.length > 1 && (
                    <tfoot>
                      <tr className="border-t border-[var(--ops-border)]">
                        <td colSpan={4} className="px-4 py-2 text-zinc-500 font-medium">Totale</td>
                        <td className="px-4 py-2 text-right text-white font-semibold">${fmt(totalValue, 0)}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${pnlColor(totalPnL)}`}>
                          {totalPnL >= 0 ? "+" : ""}${fmt(Math.abs(totalPnL))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        {/* Ordini */}
        {activeTab === "orders" && (
          <div>
            {orders.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-zinc-500">Nessun ordine registrato</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--ops-border-subtle)]">
                      <th className="text-left px-4 py-2 text-zinc-500 font-medium">Data</th>
                      <th className="text-left px-4 py-2 text-zinc-500 font-medium">Simbolo</th>
                      <th className="text-left px-4 py-2 text-zinc-500 font-medium">Lato</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium">Qtà</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium">Prezzo</th>
                      <th className="text-left px-4 py-2 text-zinc-500 font-medium">Stato</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium hidden sm:table-cell">SL</th>
                      <th className="text-right px-4 py-2 text-zinc-500 font-medium hidden sm:table-cell">TP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b border-[var(--ops-border-subtle)] hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-2.5 text-zinc-400">
                          {fmtDateTime(o.filled_at ?? o.created_at)}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-white">{o.symbol}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`flex items-center gap-1 font-medium ${
                              o.side === "buy" ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {o.side === "buy" ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {o.side === "buy" ? "BUY" : "SELL"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">
                          {o.filled_qty ?? o.qty}
                          {o.filled_qty != null && o.filled_qty !== o.qty && (
                            <span className="text-zinc-600"> /{o.qty}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">
                          {o.filled_avg_price != null ? `$${fmt(o.filled_avg_price)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs ${
                              o.status === "filled"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : o.status === "partially_filled"
                                  ? "bg-yellow-500/10 text-yellow-400"
                                  : o.status === "cancelled" || o.status === "rejected"
                                    ? "bg-red-500/10 text-red-400"
                                    : "bg-zinc-700/50 text-zinc-400"
                            }`}
                          >
                            {STATUS_LABELS[o.status] ?? o.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-500 hidden sm:table-cell">
                          {o.stop_loss != null ? `$${fmt(o.stop_loss)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-500 hidden sm:table-cell">
                          {o.take_profit != null ? `$${fmt(o.take_profit)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
