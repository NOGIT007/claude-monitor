import type { PeriodStats } from "../types";

interface Props {
  stats: PeriodStats | null;
}

export function EfficiencyMetrics({ stats }: Props) {
  const outputInputRatio =
    stats && stats.totalInput > 0
      ? (stats.totalOutput / stats.totalInput).toFixed(1)
      : null;

  const cacheHitRate =
    stats && stats.totalInput + stats.totalCacheRead > 0
      ? (
          (stats.totalCacheRead / (stats.totalInput + stats.totalCacheRead)) *
          100
        ).toFixed(1)
      : null;

  const cards: {
    label: string;
    value: string;
    sublabel: string;
    accent: string;
  }[] = [
    {
      label: "Output/Input Ratio",
      value: outputInputRatio !== null ? `${outputInputRatio}x` : "—",
      sublabel: "tokens output per input token",
      accent: "var(--ctp-sapphire)",
    },
    {
      label: "Cache Hit Rate",
      value: cacheHitRate !== null ? `${cacheHitRate}%` : "—",
      sublabel: "of input served from cache",
      accent: "var(--ctp-teal)",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "1rem",
      }}
    >
      {cards.map(({ label, value, sublabel, accent }) => (
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
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--ctp-overlay0)",
              marginTop: "0.25rem",
            }}
          >
            {sublabel}
          </div>
        </div>
      ))}
    </div>
  );
}
