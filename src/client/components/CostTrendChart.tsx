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
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#313244" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#a6adc8", fontSize: 12 }}
          axisLine={{ stroke: "#313244" }}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          label={{
            value: "Daily ($)",
            angle: -90,
            position: "insideLeft",
            fill: "#a6adc8",
            fontSize: 12,
          }}
          tick={{ fill: "#a6adc8", fontSize: 12 }}
          axisLine={{ stroke: "#313244" }}
          tickLine={false}
          tickFormatter={(v: number) => formatCost(v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          label={{
            value: "Cumulative ($)",
            angle: 90,
            position: "insideRight",
            fill: "#a6adc8",
            fontSize: 12,
          }}
          tick={{ fill: "#a6adc8", fontSize: 12 }}
          axisLine={{ stroke: "#313244" }}
          tickLine={false}
          tickFormatter={(v: number) => formatCost(v)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#181825",
            border: "1px solid #313244",
            borderRadius: 8,
            color: "#cdd6f4",
          }}
          formatter={(value: number, name: string) => [
            formatCost(value),
            name === "dailyCost" ? "Daily Cost" : "Cumulative Total",
          ]}
          labelFormatter={(label: string) => label}
        />
        <Bar
          yAxisId="left"
          dataKey="dailyCost"
          fill="#fab387"
          opacity={0.7}
          name="dailyCost"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumulativeCost"
          stroke="#a6e3a1"
          strokeWidth={2}
          dot={false}
          name="cumulativeCost"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
