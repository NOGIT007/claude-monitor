import { useState, useEffect } from "react";
import type { SessionsSummary } from "../types";
import { formatCost, formatDuration } from "../format";

interface Props {
  period: "today" | "week" | "month";
}

export function SessionStats({ period }: Props) {
  const [data, setData] = useState<SessionsSummary | null>(null);

  useEffect(() => {
    fetch(`/api/stats/sessions-summary?period=${period}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [period]);

  if (!data) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
        Loading session stats…
      </p>
    );
  }

  const cards: { label: string; value: string; accent: string }[] = [
    {
      label: "Total Sessions",
      value: String(data.totalSessions),
      accent: "var(--ctp-yellow)",
    },
    {
      label: "Avg Duration",
      value: formatDuration(data.avgDurationMs),
      accent: "var(--ctp-flamingo)",
    },
    {
      label: "Longest Session",
      value: formatDuration(data.longestDurationMs),
      accent: "var(--ctp-peach)",
    },
    {
      label: "Avg Cost / Session",
      value: formatCost(data.avgCostPerSession),
      accent: "var(--ctp-green)",
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
