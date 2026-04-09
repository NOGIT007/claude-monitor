import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { HourStats } from "../types";
import { formatHour, formatNumber, formatCost, formatCompact } from "../format";
import { tooltipStyle, axisStyle } from "../chart-theme";

export function PeakHours() {
  const [data, setData] = useState<HourStats[]>([]);

  useEffect(() => {
    fetch("/api/stats/peak-hours?days=30")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData([]));
  }, []);

  if (data.length === 0) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
        No peak hour data
      </p>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.totalTokens));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <XAxis
          dataKey="hour"
          tick={axisStyle.tick}
          axisLine={axisStyle.axisLine}
          tickLine={axisStyle.tickLine}
          tickFormatter={(h: number) => formatHour(h)}
        />
        <YAxis
          tick={axisStyle.tick}
          axisLine={axisStyle.axisLine}
          tickLine={axisStyle.tickLine}
          tickFormatter={(v: number) => formatCompact(v)}
        />
        <Tooltip
          contentStyle={tooltipStyle.contentStyle}
          labelStyle={tooltipStyle.labelStyle}
          itemStyle={tooltipStyle.itemStyle}
          cursor={tooltipStyle.cursor}
          formatter={(_value: number, _name: string, props: { payload: HourStats }) => {
            const entry = props.payload;
            return [
              `${formatNumber(entry.totalTokens)} tokens · ${formatCost(entry.totalCost)}`,
              `${formatHour(entry.hour)} – ${formatHour((entry.hour + 1) % 24)}`,
            ];
          }}
          labelFormatter={(hour: number) =>
            `${formatHour(hour)} – ${formatHour((hour + 1) % 24)}`
          }
        />
        <Bar dataKey="totalTokens" name="Tokens" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.hour}
              fill="#89b4fa"
              opacity={0.3 + 0.7 * (entry.totalTokens / maxValue)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
