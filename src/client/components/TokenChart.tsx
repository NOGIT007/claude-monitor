import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { DayEntry } from "../types";
import { formatNumber } from "../format";
import { tooltipStyle, axisStyle } from "../chart-theme";

interface Props {
  history: DayEntry[];
}

const COLORS = {
  input: "#89b4fa",
  output: "#fab387",
  cacheRead: "#a6e3a1",
  cacheWrite: "#cba6f7",
};

export function TokenChart({ history }: Props) {
  if (history.length === 0) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
        No history data available
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={history}>
        <XAxis
          dataKey="date"
          tick={axisStyle.tick}
          axisLine={axisStyle.axisLine}
          tickLine={axisStyle.tickLine}
        />
        <YAxis
          tick={axisStyle.tick}
          axisLine={axisStyle.axisLine}
          tickLine={axisStyle.tickLine}
          tickFormatter={(v: number) =>
            v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)
          }
        />
        <Tooltip
          contentStyle={tooltipStyle.contentStyle}
          labelStyle={tooltipStyle.labelStyle}
          itemStyle={tooltipStyle.itemStyle}
          cursor={tooltipStyle.cursor}
          formatter={(value: number, name: string) => [
            formatNumber(value),
            name,
          ]}
        />
        <Legend
          wrapperStyle={{ color: "#cdd6f4", fontSize: 12, fontFamily: "'Outfit', system-ui" }}
        />
        <Bar dataKey="input" stackId="tokens" fill={COLORS.input} name="Input" radius={[0, 0, 0, 0]} />
        <Bar dataKey="output" stackId="tokens" fill={COLORS.output} name="Output" />
        <Bar dataKey="cacheRead" stackId="tokens" fill={COLORS.cacheRead} name="Cache Read" />
        <Bar dataKey="cacheWrite" stackId="tokens" fill={COLORS.cacheWrite} name="Cache Write" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
