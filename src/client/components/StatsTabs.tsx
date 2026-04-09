import { useState, useEffect, useRef } from "react";
import type { PeriodStats } from "../types";
import { SummaryCards } from "./SummaryCards";

type Period = "today" | "week" | "month";

const periods: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

interface Props {
  onStatsChange: (stats: PeriodStats) => void;
}

export function StatsTabs({ onStatsChange }: Props) {
  const [active, setActive] = useState<Period>("today");
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [loading, setLoading] = useState(false);
  const onStatsChangeRef = useRef(onStatsChange);
  onStatsChangeRef.current = onStatsChange;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats/${active}`)
      .then((r) => r.json())
      .then((data: PeriodStats) => {
        setStats(data);
        onStatsChangeRef.current(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [active]);

  return (
    <div>
      {/* Tab buttons */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {periods.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              padding: "0.4rem 1rem",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
              background: active === key ? "var(--ctp-blue)" : "var(--ctp-surface0)",
              color: active === key ? "var(--ctp-crust)" : "var(--ctp-subtext0)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading && !stats ? (
        <div style={{ color: "var(--ctp-subtext0)" }}>Loading...</div>
      ) : stats ? (
        <SummaryCards stats={stats} />
      ) : null}
    </div>
  );
}
