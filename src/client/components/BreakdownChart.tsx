import type { PeriodStats } from "../types";
import { formatNumber } from "../format";

interface Props {
  stats: PeriodStats;
}

const bars: { key: keyof PeriodStats; label: string; color: string }[] = [
  { key: "totalInput", label: "Input", color: "var(--ctp-blue)" },
  { key: "totalOutput", label: "Output", color: "var(--ctp-peach)" },
  { key: "totalCacheRead", label: "Cache Read", color: "var(--ctp-green)" },
  { key: "totalCacheWrite", label: "Cache Write", color: "var(--ctp-mauve)" },
];

export function BreakdownChart({ stats }: Props) {
  const total = stats.totalInput + stats.totalOutput + stats.totalCacheRead + stats.totalCacheWrite;

  if (total === 0) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>No token data for this period</p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {bars.map(({ key, label, color }) => {
        const value = stats[key] as number;
        const pct = (value / total) * 100;

        return (
          <div key={key}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.3rem",
                fontSize: "0.8rem",
              }}
            >
              <span style={{ color: "var(--ctp-subtext1)" }}>{label}</span>
              <span style={{ color: "var(--ctp-text)", fontWeight: 600 }}>
                {formatNumber(value)}{" "}
                <span style={{ color: "var(--ctp-overlay1)", fontWeight: 400 }}>
                  ({pct.toFixed(1)}%)
                </span>
              </span>
            </div>
            <div
              style={{
                height: 10,
                borderRadius: 5,
                background: "var(--ctp-surface0)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: color,
                  borderRadius: 5,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
