import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { ModelStats } from "../types";
import { formatCost } from "../format";
import { tooltipStyle } from "../chart-theme";

interface Props {
  period: "today" | "week" | "month";
}

function modelColor(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("sonnet")) return "#89b4fa";
  if (lower.includes("opus")) return "#cba6f7";
  if (lower.includes("haiku")) return "#94e2d5";
  return "#f9e2af";
}

export function ModelBreakdown({ period }: Props) {
  const [data, setData] = useState<ModelStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats/models?period=${period}`)
      .then((r) => r.json())
      .then((d: ModelStats[]) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const totalCost = useMemo(() => data.reduce((sum, m) => sum + m.totalCost, 0), [data]);

  const chartData = useMemo(() => data.map((m) => ({
    name: m.model,
    value: m.totalCost,
    color: modelColor(m.model),
  })), [data]);

  if (loading) {
    return <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>Loading…</p>;
  }

  if (data.length === 0) {
    return <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>No model data</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            strokeWidth={0}
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle.contentStyle}
            labelStyle={tooltipStyle.labelStyle}
            itemStyle={tooltipStyle.itemStyle}
            formatter={(value: number, name: string) => [formatCost(value), name]}
          />
        </PieChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
        {chartData.map((entry) => {
          const pct = totalCost > 0 ? ((entry.value / totalCost) * 100).toFixed(1) : "0.0";
          return (
            <div
              key={entry.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: entry.color,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "var(--ctp-text)" }}>{entry.name}</span>
              </div>
              <span style={{ color: "var(--ctp-subtext0)" }}>
                {formatCost(entry.value)} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
