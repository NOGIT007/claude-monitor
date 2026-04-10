import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { HourStats } from "../types";
import { formatNumber, formatCost, formatCompact } from "../format";
import { tooltipStyle, axisStyle, chartColors } from "../chart-theme";

interface Props {
  period?: "today" | "week" | "month";
}

/** Format hour as 24h EU format: 08:00 */
function formatHour24(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function PeakHours({ period }: Props) {
  const [data, setData] = useState<HourStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = period
      ? `/api/stats/peak-hours?period=${period}`
      : "/api/stats/peak-hours?days=30";

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: HourStats[]) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData([]);
        setLoading(false);
      });
  }, [period]);

  // Fill all 24 hours (hours with no data get 0)
  const fullData: HourStats[] = useMemo(() => {
    const map = new Map(data.map((d) => [d.hour, d]));
    return Array.from({ length: 24 }, (_, h) => map.get(h) ?? { hour: h, totalTokens: 0, totalCost: 0 });
  }, [data]);

  const maxValue = useMemo(() => Math.max(1, ...fullData.map((d) => d.totalTokens)), [fullData]);

  if (loading) {
    return <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>Loading…</p>;
  }

  if (fullData.every((d) => d.totalTokens === 0)) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
        No peak hour data for this period
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={fullData}>
        <XAxis
          dataKey="hour"
          tick={axisStyle.tick}
          axisLine={axisStyle.axisLine}
          tickLine={axisStyle.tickLine}
          tickFormatter={(h: number) => formatHour24(h)}
          interval={1}
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
              `${formatHour24(entry.hour)} – ${formatHour24((entry.hour + 1) % 24)}`,
            ];
          }}
          labelFormatter={(hour: number) =>
            `${formatHour24(hour)} – ${formatHour24((hour + 1) % 24)}`
          }
        />
        <Bar dataKey="totalTokens" name="Tokens" radius={[4, 4, 0, 0]}>
          {fullData.map((entry) => (
            <Cell
              key={entry.hour}
              fill={chartColors.bar}
              opacity={entry.totalTokens > 0 ? 0.3 + 0.7 * (entry.totalTokens / maxValue) : 0.08}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
