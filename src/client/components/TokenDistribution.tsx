import type { PeriodStats } from "../types";
import { formatCompact } from "../format";

interface Props {
  stats: PeriodStats;
}

const segments: { key: keyof PeriodStats; label: string; color: string }[] = [
  { key: "totalInput", label: "Input", color: "var(--ctp-blue)" },
  { key: "totalOutput", label: "Output", color: "var(--ctp-peach)" },
  { key: "totalCacheRead", label: "Cache Read", color: "var(--ctp-green)" },
  { key: "totalCacheWrite", label: "Cache Write", color: "var(--ctp-mauve)" },
];

export function TokenDistribution({ stats }: Props) {
  const total =
    stats.totalInput + stats.totalOutput + stats.totalCacheRead + stats.totalCacheWrite;

  if (total === 0) {
    return (
      <div className="card">
        <h3
          style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}
        >
          Token Distribution
        </h3>
        <p style={{ color: "var(--ctp-subtext0)", margin: "0.5rem 0 0" }}>
          No token data for this period
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3
        style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}
      >
        Token Distribution
      </h3>

      {/* Stacked bar */}
      <div
        style={{
          display: "flex",
          height: 18,
          borderRadius: 9,
          overflow: "hidden",
          background: "var(--ctp-surface0)",
        }}
      >
        {segments.map(({ key, color }) => {
          const value = stats[key] as number;
          const pct = (value / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={key}
              style={{
                width: `${pct}%`,
                background: color,
                transition: "width 0.4s ease",
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.8rem",
          marginTop: "0.6rem",
          fontSize: "0.75rem",
          fontFamily: "var(--font-mono)",
        }}
      >
        {segments.map(({ key, label, color }) => {
          const value = stats[key] as number;
          return (
            <span key={key} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                  display: "inline-block",
                }}
              />
              <span style={{ color: "var(--ctp-subtext1)" }}>{label}</span>
              <span style={{ color: "var(--ctp-text)", fontWeight: 600 }}>
                {formatCompact(value)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
