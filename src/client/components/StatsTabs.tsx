import { useState, useEffect } from "react";
import type { PeriodStats, Comparison } from "../types";
import { SummaryCards } from "./SummaryCards";

type Period = "today" | "week" | "month";

const periods: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

interface Props {
  onStatsChange: (stats: PeriodStats) => void;
  onPeriodChange?: (period: Period) => void;
}

export function StatsTabs({ onStatsChange, onPeriodChange }: Props) {
  const [active, setActive] = useState<Period>("today");
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/stats/${active}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`/api/stats/comparison?period=${active}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([statsData, compData]: [PeriodStats, Comparison]) => {
        setStats(statsData);
        setComparison(compData);
        onStatsChange(statsData);
      })
      .catch((err) => console.warn("[StatsTabs] fetch failed:", err.message))
      .finally(() => setLoading(false));
  }, [active, onStatsChange]);

  useEffect(() => {
    onPeriodChange?.(active);
  }, [active, onPeriodChange]);

  return (
    <div>
      {/* Tab buttons */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {periods.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`tab-btn ${active === key ? "tab-btn--active" : "tab-btn--inactive"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading && !stats ? (
        <div style={{ color: "var(--ctp-subtext0)" }}>Loading...</div>
      ) : stats ? (
        <SummaryCards stats={stats} comparison={comparison} />
      ) : null}
    </div>
  );
}
