import { useState, useEffect } from "react";
import type { ActivityDay } from "../types";
import { formatCost } from "../format";

export function ActivityHeatmap() {
  const [data, setData] = useState<ActivityDay[]>([]);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    day: ActivityDay;
  } | null>(null);

  useEffect(() => {
    fetch("/api/stats/activity-heatmap?weeks=52")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ActivityDay[]) => setData(d))
      .catch((err) => console.warn("[ActivityHeatmap] fetch failed:", err.message));
  }, []);

  // Build a map of date -> ActivityDay
  const dayMap = new Map<string, ActivityDay>();
  for (const d of data) dayMap.set(d.date, d);

  // Compute quantile thresholds from non-zero counts
  const nonZero = data.filter((d) => d.count > 0).map((d) => d.count).sort((a, b) => a - b);
  const q = (pct: number) => nonZero[Math.floor(pct * (nonZero.length - 1))] ?? 0;
  const thresholds = nonZero.length > 0 ? [q(0.25), q(0.5), q(0.75), q(1)] : [1, 2, 3, 4];

  function colorForCount(count: number): string {
    if (count === 0) return "var(--ctp-surface0)";
    if (count <= thresholds[0]) return "rgba(137, 180, 250, 0.25)";
    if (count <= thresholds[1]) return "rgba(137, 180, 250, 0.45)";
    if (count <= thresholds[2]) return "rgba(137, 180, 250, 0.65)";
    return "rgba(137, 180, 250, 0.9)";
  }

  // Generate 52 weeks of dates ending today
  const today = new Date();
  const cellSize = 14;
  const gap = 3;
  const step = cellSize + gap;
  const weeks = 52;
  const cols = weeks;
  const rows = 7;

  // Find the Sunday that starts the first column (52 weeks ago, aligned to week start)
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (cols * 7 - 1) - today.getDay());

  // Build grid cells
  const cells: { x: number; y: number; date: string; day: ActivityDay | undefined }[] = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + col * 7 + row);
      if (d > today) continue;
      const dateStr = d.toISOString().slice(0, 10);
      cells.push({
        x: col * step,
        y: row * step,
        date: dateStr,
        day: dayMap.get(dateStr),
      });
    }
  }

  // Month labels
  const monthLabels: { label: string; x: number }[] = [];
  const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short" });
  let lastMonth = -1;
  for (let col = 0; col < cols; col++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + col * 7);
    const m = d.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ label: monthFmt.format(d), x: col * step });
      lastMonth = m;
    }
  }

  const dayLabels = [
    { label: "Mon", row: 1 },
    { label: "Wed", row: 3 },
    { label: "Fri", row: 5 },
  ];

  const leftPad = 32;
  const topPad = 18;
  const svgWidth = leftPad + cols * step;
  const svgHeight = topPad + rows * step;

  return (
    <div className="card">
      <h3
        style={{
          margin: "0 0 1rem",
          fontSize: "0.95rem",
          fontWeight: 700,
          color: "var(--ctp-text)",
        }}
      >
        Event Activity — Last 52 Weeks
      </h3>
      <div style={{ overflowX: "auto", position: "relative" }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ display: "block" }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Month labels */}
          {monthLabels.map(({ label, x }) => (
            <text
              key={`${label}-${x}`}
              x={leftPad + x}
              y={12}
              fill="var(--ctp-subtext0)"
              fontSize={10}
              fontFamily="'JetBrains Mono', monospace"
            >
              {label}
            </text>
          ))}

          {/* Day labels */}
          {dayLabels.map(({ label, row }) => (
            <text
              key={label}
              x={0}
              y={topPad + row * step + cellSize - 2}
              fill="var(--ctp-subtext0)"
              fontSize={10}
              fontFamily="'JetBrains Mono', monospace"
            >
              {label}
            </text>
          ))}

          {/* Cells */}
          {cells.map(({ x, y, date, day }) => (
            <rect
              key={date}
              x={leftPad + x}
              y={topPad + y}
              width={cellSize}
              height={cellSize}
              rx={3}
              fill={colorForCount(day?.count ?? 0)}
              role="img"
              aria-label={`${date}: ${day?.count ?? 0} events, ${formatCost(day?.cost ?? 0)}`}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => {
                const rect = (e.target as SVGRectElement).getBoundingClientRect();
                const parent = (e.target as SVGRectElement).closest("div")!.getBoundingClientRect();
                setTooltip({
                  x: rect.left - parent.left + cellSize / 2,
                  y: rect.top - parent.top - 8,
                  day: day ?? { date, count: 0, cost: 0 },
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, -100%)",
              background: "rgba(24, 24, 37, 0.95)",
              border: "1px solid rgba(69, 71, 90, 0.5)",
              borderRadius: 8,
              padding: "0.4rem 0.6rem",
              fontSize: "0.75rem",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--ctp-text)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              zIndex: 10,
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--ctp-lavender)" }}>
              {tooltip.day.date}
            </div>
            <div>
              {tooltip.day.count} events · {formatCost(tooltip.day.cost)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
