import { useState, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { CumulativeCostEntry } from "../types";
import { formatCost } from "../format";
import { tooltipStyle, axisStyle, gridStyle, chartColors } from "../chart-theme";

function compactCost(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

export function CostTrendChart() {
  const [data, setData] = useState<CumulativeCostEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history/cumulative?days=30")
      .then((res) => res.json())
      .then((entries: CumulativeCostEntry[]) => {
        setData(entries);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>Loading...</p>
    );
  }

  if (data.length === 0) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>No cost data</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
        <CartesianGrid {...gridStyle} />
        <XAxis
          dataKey="date"
          tick={axisStyle.tick}
          axisLine={axisStyle.axisLine}
          tickLine={axisStyle.tickLine}
        />
        <YAxis
          yAxisId="left"
          width={55}
          label={{
            value: "Daily",
            angle: -90,
            position: "insideLeft",
            fill: "#7f849c",
            fontSize: 11,
            fontFamily: "'Outfit', system-ui",
            offset: 5,
          }}
          tick={axisStyle.tick}
          axisLine={axisStyle.axisLine}
          tickLine={axisStyle.tickLine}
          tickFormatter={compactCost}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          width={55}
          label={{
            value: "Cumulative",
            angle: 90,
            position: "insideRight",
            fill: "#7f849c",
            fontSize: 11,
            fontFamily: "'Outfit', system-ui",
            offset: 5,
          }}
          tick={axisStyle.tick}
          axisLine={axisStyle.axisLine}
          tickLine={axisStyle.tickLine}
          tickFormatter={compactCost}
        />
        <Tooltip
          contentStyle={tooltipStyle.contentStyle}
          labelStyle={tooltipStyle.labelStyle}
          itemStyle={tooltipStyle.itemStyle}
          cursor={tooltipStyle.cursor}
          formatter={(value: number, name: string) => [
            formatCost(value),
            name === "dailyCost" ? "Daily Cost" : "Cumulative Total",
          ]}
          labelFormatter={(label: string) => label}
        />
        <Bar
          yAxisId="left"
          dataKey="dailyCost"
          fill={chartColors.output}
          opacity={0.7}
          name="dailyCost"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumulativeCost"
          stroke={chartColors.cacheRead}
          strokeWidth={2}
          dot={false}
          name="cumulativeCost"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
