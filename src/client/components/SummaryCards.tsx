import type { PeriodStats, Comparison } from "../types";
import { formatNumber, formatCost } from "../format";

interface Props {
  stats: PeriodStats;
  comparison?: Comparison | null;
}

function delta(current: number, previous: number): { text: string; color: string } | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.1) return null;
  return {
    text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    color: pct >= 0 ? "var(--ctp-red)" : "var(--ctp-green)",
  };
}

function deltaInverse(current: number, previous: number): { text: string; color: string } | null {
  const d = delta(current, previous);
  if (!d) return null;
  // For tokens and sessions, increase = green, decrease = red
  return { ...d, color: d.color === "var(--ctp-red)" ? "var(--ctp-green)" : "var(--ctp-red)" };
}

export function SummaryCards({ stats, comparison }: Props) {
  const totalTokens = stats.totalInput + stats.totalOutput + stats.totalCacheRead + stats.totalCacheWrite;
  const cacheSavings = totalTokens > 0 ? (stats.totalCacheRead / totalTokens) * 100 : 0;

  const prev = comparison?.previous;
  const prevTokens = prev ? prev.totalInput + prev.totalOutput + prev.totalCacheRead + prev.totalCacheWrite : 0;

  const cards: { label: string; value: string; accent: string; change?: { text: string; color: string } | null }[] = [
    {
      label: "Total Tokens",
      value: formatNumber(totalTokens),
      accent: "var(--ctp-blue)",
      change: prev ? deltaInverse(totalTokens, prevTokens) : null,
    },
    {
      label: "Estimated Cost",
      value: formatCost(stats.totalCost),
      accent: "var(--ctp-green)",
      change: prev ? delta(stats.totalCost, prev.totalCost) : null,
    },
    {
      label: "Cache Savings",
      value: `${cacheSavings.toFixed(1)}%`,
      accent: "var(--ctp-mauve)",
    },
    {
      label: "Sessions",
      value: formatNumber(stats.sessionCount),
      accent: "var(--ctp-yellow)",
      change: prev ? deltaInverse(stats.sessionCount, prev.sessionCount) : null,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "1rem",
      }}
    >
      {cards.map(({ label, value, accent, change }) => (
        <div
          key={label}
          className="card"
          style={{ borderLeft: `3px solid ${accent}` }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.25rem",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--ctp-overlay1)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {label}
            </span>
            {change && (
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: change.color,
                  background: "var(--ctp-surface0)",
                  padding: "0.1rem 0.4rem",
                  borderRadius: 4,
                }}
              >
                {change.text}
              </span>
            )}
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: accent }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
