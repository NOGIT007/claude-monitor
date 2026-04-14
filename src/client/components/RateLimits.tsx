import { useState, useEffect } from "react";

interface UsageSnapshot {
  captured_at: string;
  session_id: string;
  model: string;
  effort: string;
  context_pct: number | null;
  session_pct: number | null;
  weekly_pct: number | null;
}

function barColor(pct: number): string {
  if (pct < 50) return "var(--ctp-green)";
  if (pct < 80) return "var(--ctp-yellow)";
  return "var(--ctp-red)";
}

function Bar({ pct, label }: { pct: number | null; label: string }) {
  if (pct == null) return null;
  const color = barColor(pct);
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.3rem",
        }}
      >
        <span
          style={{
            fontSize: "0.65rem",
            color: "var(--ctp-overlay1)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color,
          }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "rgba(69, 71, 90, 0.3)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

export function RateLimits({ pollInterval = 30000 }: { pollInterval?: number } = {}) {
  const [snapshots, setSnapshots] = useState<UsageSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () =>
      fetch("/api/usage-snapshots?limit=10")
        .then((r) => r.json())
        .then((data: UsageSnapshot[]) => {
          setSnapshots(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));

    fetchData();
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval]);

  if (loading) {
    return <p style={{ color: "var(--ctp-subtext0)", margin: 0, fontSize: "0.75rem" }}>Loading…</p>;
  }

  if (snapshots.length === 0) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0, fontSize: "0.75rem" }}>
        No usage data yet. Rate limits are captured from the status line every 60s.
      </p>
    );
  }

  // Show the most recent snapshot, but for weekly_pct use the most recent non-null value
  const latest = snapshots[0];
  const weeklyPct = snapshots.find((s) => s.weekly_pct != null)?.weekly_pct ?? null;
  const time = new Date(latest.captured_at + "Z").toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.75rem" }}>
        <Bar pct={latest.session_pct} label="Current Session" />
        <Bar pct={weeklyPct} label="Weekly Limit" />
        <Bar pct={latest.context_pct} label="Context Window" />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.6rem",
          fontFamily: "var(--font-mono)",
          color: "var(--ctp-overlay0)",
        }}
      >
        <span>
          {latest.model && (
            <span style={{ color: "var(--ctp-mauve)" }}>{latest.model}</span>
          )}
          {latest.effort && (
            <span style={{ marginLeft: "0.5rem", color: "var(--ctp-yellow)" }}>
              [{latest.effort}]
            </span>
          )}
        </span>
        <span>Updated {time}</span>
      </div>
    </div>
  );
}
