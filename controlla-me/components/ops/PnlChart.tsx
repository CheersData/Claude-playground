"use client";

interface SnapshotPoint {
  date: string;
  cumulative_pnl: number;
  portfolio_value: number;
}

interface PnlChartProps {
  snapshots: SnapshotPoint[];
  currentPnl: number;
  height?: number;
}

const WIDTH = 400;
const PADDING = { top: 28, right: 16, bottom: 24, left: 16 };

function formatDollar(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

function formatDollarFull(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function PnlChart({ snapshots, currentPnl, height = 120 }: PnlChartProps) {
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;

  // Edge case: empty array
  if (!snapshots || snapshots.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-zinc-500 text-sm font-mono"
      >
        Nessun dato storico
      </div>
    );
  }

  // Build points: historical + current "Ora" point
  const lastCumulative = snapshots[snapshots.length - 1].cumulative_pnl;
  const nowValue = lastCumulative + currentPnl;

  const allPoints: Array<{ date: string; cumulative_pnl: number }> = [
    ...snapshots,
    { date: "Ora", cumulative_pnl: nowValue, portfolio_value: 0 } as SnapshotPoint,
  ];

  // Edge case: single historical point (just show current value large)
  if (snapshots.length === 1) {
    const color = nowValue >= 0 ? "#4ade80" : "#f87171";
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center gap-1"
      >
        <span style={{ color, fontFamily: "monospace", fontSize: 28, fontWeight: 700 }}>
          {formatDollarFull(nowValue)}
        </span>
        <span className="text-zinc-500 text-xs font-mono">P&amp;L corrente</span>
      </div>
    );
  }

  // Compute value range
  const values = allPoints.map((p) => p.cumulative_pnl);
  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, 0);
  const range = maxVal - minVal || 1;

  // Map value → SVG y (inverted: higher value = lower y)
  const toY = (val: number) =>
    PADDING.top + innerHeight - ((val - minVal) / range) * innerHeight;

  // Map index → SVG x
  const toX = (i: number) =>
    PADDING.left + (i / (allPoints.length - 1)) * innerWidth;

  // Build polyline points string
  const polylinePoints = allPoints
    .map((p, i) => `${toX(i)},${toY(p.cumulative_pnl)}`)
    .join(" ");

  // Build area fill path (close below the line)
  const baselineY = toY(0);
  const areaPath =
    `M ${toX(0)},${toY(allPoints[0].cumulative_pnl)} ` +
    allPoints
      .slice(1)
      .map((p, i) => `L ${toX(i + 1)},${toY(p.cumulative_pnl)}`)
      .join(" ") +
    ` L ${toX(allPoints.length - 1)},${baselineY} L ${toX(0)},${baselineY} Z`;

  // Color based on last point
  const isPositive = nowValue >= 0;
  const lineColor = isPositive ? "#4ade80" : "#f87171";

  // Last point coordinates
  const lastX = toX(allPoints.length - 1);
  const lastY = toY(nowValue);

  // Label Y: above the dot, clamped so it doesn't go above viewBox
  const labelY = Math.max(PADDING.top - 4, lastY - 10);

  // X-axis labels
  const firstDate = allPoints[0].date;
  const lastDate = allPoints[allPoints.length - 1].date;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      width="100%"
      height={height}
      style={{ display: "block", overflow: "visible" }}
      aria-label="Grafico P&L nel tempo"
    >
      {/* Baseline y=0 dashed */}
      <line
        x1={PADDING.left}
        y1={baselineY}
        x2={WIDTH - PADDING.right}
        y2={baselineY}
        stroke="#52525b"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* Area fill */}
      <path d={areaPath} fill={lineColor} fillOpacity={0.15} />

      {/* Line */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Last point circle */}
      <circle cx={lastX} cy={lastY} r={5} fill={lineColor} opacity={0.9} />
      <circle cx={lastX} cy={lastY} r={8} fill={lineColor} opacity={0.2} />

      {/* Last point label */}
      <text
        x={lastX}
        y={labelY}
        textAnchor="middle"
        fill={lineColor}
        fontSize={11}
        fontFamily="monospace"
        fontWeight={700}
      >
        {formatDollarFull(nowValue)}
      </text>

      {/* X-axis: first date */}
      <text
        x={PADDING.left}
        y={height - 4}
        textAnchor="start"
        fill="#71717a"
        fontSize={10}
        fontFamily="monospace"
      >
        {firstDate}
      </text>

      {/* X-axis: last date */}
      <text
        x={WIDTH - PADDING.right}
        y={height - 4}
        textAnchor="end"
        fill="#71717a"
        fontSize={10}
        fontFamily="monospace"
      >
        {lastDate}
      </text>
    </svg>
  );
}
