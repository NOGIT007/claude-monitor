import type { PeriodStats } from "../types";
import { formatNumber, formatCost } from "../format";

interface Props {
  stats: PeriodStats;
}

export function SummaryCards({ stats }: Props) {
  const totalTokens = stats.totalInput + stats.totalOutput + stats.totalCacheRead + stats.totalCacheWrite;
  const cacheSavings = totalTokens > 0 ? (stats.totalCacheRead / totalTokens) * 100 : 0;

  const cards: { label: string; value: string; accent: string }[] = [
    {
      label: "Total Tokens",
      value: formatNumber(totalTokens),
      accent: "var(--ctp-blue)",
    },
    {
      label: "Estimated Cost",
      value: formatCost(stats.totalCost),
      accent: "var(--ctp-green)",
    },
    {
      label: "Cache Savings",
      value: `${cacheSavings.toFixed(1)}%`,
      accent: "var(--ctp-mauve)",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "1rem",
      }}
    >
      {cards.map(({ label, value, accent }) => (
        <div
          key={label}
          className="card"
          style={{ borderLeft: `3px solid ${accent}` }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--ctp-overlay1)",
              marginBottom: "0.25rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: accent }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
