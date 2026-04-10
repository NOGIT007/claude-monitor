import type { PeriodStats, Comparison } from "../types";
import { formatNumber, formatCost } from "../format";

interface Props {
  stats: PeriodStats;
  comparison?: Comparison | null;
}

function delta(current: number, previous: number): { text: string; positive: boolean } | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.1) return null;
  return {
    text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    positive: pct < 0, // cost going down = positive
  };
}

function deltaInverse(current: number, previous: number): { text: string; positive: boolean } | null {
  const d = delta(current, previous);
  if (!d) return null;
  return { ...d, positive: !d.positive }; // tokens/sessions going up = positive
}

const accents = ["blue", "green", "mauve", "yellow"] as const;

export function SummaryCards({ stats, comparison }: Props) {
  const totalTokens = stats.totalInput + stats.totalOutput + stats.totalCacheRead + stats.totalCacheWrite;
  const cacheSavings = totalTokens > 0 ? (stats.totalCacheRead / totalTokens) * 100 : 0;

  const prev = comparison?.previous;
  const prevTokens = prev ? prev.totalInput + prev.totalOutput + prev.totalCacheRead + prev.totalCacheWrite : 0;

  const cards: { label: string; value: string; accent: typeof accents[number]; change?: { text: string; positive: boolean } | null }[] = [
    {
      label: "Total Tokens",
      value: formatNumber(totalTokens),
      accent: "blue",
      change: prev ? deltaInverse(totalTokens, prevTokens) : null,
    },
    {
      label: "Estimated Cost",
      value: formatCost(stats.totalCost),
      accent: "green",
      change: prev ? delta(stats.totalCost, prev.totalCost) : null,
    },
    {
      label: "Cache Hit Rate",
      value: `${cacheSavings.toFixed(1)}%`,
      accent: "mauve",
    },
    {
      label: "Sessions",
      value: formatNumber(stats.sessionCount),
      accent: "yellow",
      change: prev ? deltaInverse(stats.sessionCount, prev.sessionCount) : null,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "0.75rem",
      }}
    >
      {cards.map(({ label, value, accent, change }) => (
        <div key={label} className={`card card--${accent}`}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.65rem",
                fontWeight: 500,
                color: "var(--ctp-overlay0)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {label}
            </span>
            {change && (
              <span className={`badge ${change.positive ? "badge--positive" : "badge--negative"}`}>
                {change.text}
              </span>
            )}
          </div>
          <div
            className="metric-value"
            style={{
              fontSize: "1.5rem",
              color: `var(--ctp-${accent})`,
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
