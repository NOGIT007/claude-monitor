import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { ProjectStats } from "../types";
import { formatCost, projectName } from "../format";

interface Props {
  period: "today" | "week" | "month";
}

export function ProjectCosts({ period }: Props) {
  const [data, setData] = useState<ProjectStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats/projects?period=${period}`)
      .then((r) => r.json())
      .then((d: ProjectStats[]) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  if (loading) {
    return <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>Loading…</p>;
  }

  if (data.length === 0) {
    return <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>No project data</p>;
  }

  const chartData = data.map((p) => ({
    name: projectName(p.projectPath),
    cost: p.totalCost,
    tokens: p.totalTokens,
    sessions: p.sessionCount,
  }));

  const height = Math.max(200, chartData.length * 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
        <XAxis
          type="number"
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
          tick={{ fill: "#a6adc8", fontSize: 12 }}
          axisLine={{ stroke: "#313244" }}
          tickLine={{ stroke: "#313244" }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: "#a6adc8", fontSize: 12 }}
          axisLine={{ stroke: "#313244" }}
          tickLine={{ stroke: "#313244" }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--ctp-surface0)",
            border: "1px solid var(--ctp-surface1)",
            borderRadius: 8,
            color: "var(--ctp-text)",
          }}
          formatter={(_value: number, _name: string, props: { payload: (typeof chartData)[number] }) => {
            const p = props.payload;
            return [
              `${formatCost(p.cost)} · ${p.tokens.toLocaleString()} tokens · ${p.sessions} sessions`,
              p.name,
            ];
          }}
          labelFormatter={() => ""}
        />
        <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill="#89b4fa" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
