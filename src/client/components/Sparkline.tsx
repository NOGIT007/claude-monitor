import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { DayEntry } from "../types";
import { formatNumber } from "../format";

interface Props {
  history: DayEntry[];
}

export function Sparkline({ history }: Props) {
  const chartData = history.map((d) => ({
    date: d.date,
    events: d.input + d.output + d.cacheRead + d.cacheWrite,
  }));

  const totalEvents = chartData.reduce((sum, d) => sum + d.events, 0);
  const peakDay = chartData.reduce(
    (max, d) => (d.events > max.events ? d : max),
    { date: "", events: 0 },
  );

  return (
    <div className="card">
      <h3
        style={{
          margin: 0,
          fontSize: "0.95rem",
          fontWeight: 700,
          color: "var(--ctp-text)",
        }}
      >
        Last 30 Days
      </h3>
      <p
        style={{
          margin: "0.2rem 0 0.8rem",
          fontSize: "0.75rem",
          color: "var(--ctp-subtext0)",
        }}
      >
        Daily event count
      </p>
      <div style={{ width: "100%", height: 80 }}>
        <ResponsiveContainer>
          <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ctp-green)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--ctp-green)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="events"
              stroke="var(--ctp-green)"
              strokeWidth={2}
              fill="url(#sparkGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "0.6rem",
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--ctp-subtext1)",
        }}
      >
        <span>
          Peak: <span style={{ color: "var(--ctp-text)", fontWeight: 600 }}>{formatNumber(peakDay.events)}</span>
          {peakDay.date && (
            <span style={{ color: "var(--ctp-overlay1)", marginLeft: "0.3rem" }}>({peakDay.date})</span>
          )}
        </span>
        <span>
          Total: <span style={{ color: "var(--ctp-text)", fontWeight: 600 }}>{formatNumber(totalEvents)}</span>
        </span>
      </div>
    </div>
  );
}
