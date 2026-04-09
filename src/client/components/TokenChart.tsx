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
          tick={{ fill: "#a6adc8", fontSize: 12 }}
          axisLine={{ stroke: "#313244" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#a6adc8", fontSize: 12 }}
          axisLine={{ stroke: "#313244" }}
          tickLine={false}
          tickFormatter={(v: number) =>
            v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)
          }
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#181825",
            border: "1px solid #313244",
            borderRadius: 8,
            color: "#cdd6f4",
          }}
          formatter={(value: number, name: string) => [
            new Intl.NumberFormat("en-US").format(value),
            name,
          ]}
        />
        <Legend
          wrapperStyle={{ color: "#cdd6f4", fontSize: 12 }}
        />
        <Bar dataKey="input" stackId="tokens" fill={COLORS.input} name="Input" radius={[0, 0, 0, 0]} />
        <Bar dataKey="output" stackId="tokens" fill={COLORS.output} name="Output" />
        <Bar dataKey="cacheRead" stackId="tokens" fill={COLORS.cacheRead} name="Cache Read" />
        <Bar dataKey="cacheWrite" stackId="tokens" fill={COLORS.cacheWrite} name="Cache Write" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
