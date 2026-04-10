import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import type { RateLimitData, RateLimitTimelineEntry, StopoutEvent, SessionBurnRate } from "../types";
import { formatNumber } from "../format";
import { tooltipStyle, axisStyle, gridStyle, chartColors } from "../chart-theme";

const HOURS_OPTIONS = [6, 12, 24, 48, 168] as const;
const HOUR_LABELS: Record<number, string> = { 6: "6h", 12: "12h", 24: "24h", 48: "48h", 168: "7d" };

export function RateLimitAnalytics() {
  const [data, setData] = useState<RateLimitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats/rate-limits?hours=${hours}`)
      .then((r) => r.json())
      .then((d: RateLimitData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [hours]);

  if (loading) {
    return <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>Loading...</p>;
  }

  if (!data || data.stats.totalSnapshots === 0) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
        No rate limit data yet. Snapshots are captured from the status line every 60s while sessions are active.
      </p>
    );
  }

  const { stats, timeline, stopouts, burnRates } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* Time range selector */}
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {HOURS_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`tab-btn ${hours === h ? "tab-btn--active" : "tab-btn--inactive"}`}
              style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }}
            >
              {HOUR_LABELS[h]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowExplainer(true)}
          style={{
            background: "rgba(69, 71, 90, 0.3)",
            border: "1px solid rgba(69, 71, 90, 0.5)",
            borderRadius: 8,
            padding: "0.4rem 0.8rem",
            color: "var(--ctp-subtext0)",
            cursor: "pointer",
            fontSize: "0.8rem",
            fontFamily: "'Outfit', system-ui, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <span style={{ fontSize: "1rem", lineHeight: 1 }}>?</span>
          What is this?
        </button>
      </div>

      {showExplainer && <Explainer onClose={() => setShowExplainer(false)} />}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        <SummaryCard
          label="Current Session"
          value={stats.currentSessionPct != null ? `${stats.currentSessionPct}%` : "--"}
          color={pctColor(stats.currentSessionPct ?? 0)}
        />
        <SummaryCard
          label="Current Weekly"
          value={stats.currentWeeklyPct != null ? `${stats.currentWeeklyPct}%` : "--"}
          color={pctColor(stats.currentWeeklyPct ?? 0)}
        />
        <SummaryCard
          label="Stopouts (>80%)"
          value={String(stats.stopoutSessions)}
          color={stats.stopoutSessions > 0 ? "#f38ba8" : "#a6e3a1"}
        />
        <SummaryCard
          label="Avg Burn Rate"
          value={`${stats.avgBurnRatePerMin}%/min`}
        />
      </div>

      {/* Timeline chart */}
      {timeline.length > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Usage Over Time
          </h3>
          <TimelineChart timeline={timeline} />
        </div>
      )}

      {/* Burn rate chart */}
      {burnRates.length > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Session Burn Rate
          </h3>
          <BurnRateChart burnRates={burnRates} />
        </div>
      )}

      {/* Stopout events table */}
      <div className="card">
        <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
          High Usage Sessions ({">"}80%)
        </h3>
        {stopouts.length === 0 ? (
          <p style={{ color: "var(--ctp-subtext0)", margin: 0, fontSize: "0.85rem" }}>
            No sessions have exceeded 80% session usage yet.
          </p>
        ) : (
          <StopoutTable stopouts={stopouts} />
        )}
      </div>
    </div>
  );
}

function TimelineChart({ timeline }: { timeline: RateLimitTimelineEntry[] }) {
  const chartData = useMemo(() => {
    const multiDay = timeline.length > 0 &&
      timeline[0].captured_at.slice(0, 10) !== timeline[timeline.length - 1].captured_at.slice(0, 10);
    return timeline.map((t) => {
      const date = t.captured_at.slice(5, 10); // MM-DD
      const time = t.captured_at.slice(11, 16); // HH:MM
      return {
        time: multiDay ? `${date} ${time}` : time,
        fullTime: t.captured_at,
        session: t.session_pct,
        weekly: t.weekly_pct,
        sessionId: t.session_id.slice(0, 8),
      };
    });
  }, [timeline]);

  // Show ~12 ticks max regardless of data density
  const tickInterval = Math.max(1, Math.floor(chartData.length / 12));

  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid {...gridStyle} />
          <XAxis
            dataKey="time"
            tick={axisStyle.tick}
            axisLine={axisStyle.axisLine}
            tickLine={axisStyle.tickLine}
            interval={tickInterval}
          />
          <YAxis
            domain={[0, 100]}
            tick={axisStyle.tick}
            axisLine={axisStyle.axisLine}
            tickLine={axisStyle.tickLine}
            tickFormatter={(v: number) => `${v}%`}
            width={45}
          />
          <ReferenceLine y={80} stroke="#f38ba8" strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine y={100} stroke="#f38ba8" strokeWidth={2} strokeOpacity={0.3} />
          <Tooltip
            contentStyle={tooltipStyle.contentStyle}
            labelStyle={tooltipStyle.labelStyle}
            itemStyle={tooltipStyle.itemStyle}
            labelFormatter={(_: string, payload: any[]) => {
              if (payload?.[0]?.payload?.fullTime) return payload[0].payload.fullTime.replace("T", " ");
              return _;
            }}
            formatter={(value: number, name: string) => {
              if (name === "session") return [`${value}%`, "Session (5h)"];
              if (name === "weekly") return [`${value}%`, "Weekly (7d)"];
              return [String(value), name];
            }}
          />
          <Line
            type="monotone"
            dataKey="session"
            stroke="#89b4fa"
            strokeWidth={2}
            dot={false}
            name="session"
          />
          <Line
            type="monotone"
            dataKey="weekly"
            stroke="#cba6f7"
            strokeWidth={2}
            dot={false}
            name="weekly"
          />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", marginTop: "0.5rem", fontSize: "0.8rem" }}>
        <LegendItem color="#89b4fa" label="Session (5h rolling)" />
        <LegendItem color="#cba6f7" label="Weekly (7d rolling)" />
        <LegendItem color="#f38ba8" label="80% danger zone" dashed />
      </div>
    </>
  );
}

function BurnRateChart({ burnRates }: { burnRates: SessionBurnRate[] }) {
  const chartData = useMemo(() => {
    return burnRates.slice(0, 20).reverse().map((b) => ({
      session: b.session_id.slice(0, 8),
      burnRate: b.burn_rate_per_min,
      duration: b.duration_min,
      start: b.start_pct,
      end: b.end_pct,
      model: b.model,
      firstSeen: b.first_seen,
    }));
  }, [burnRates]);

  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid {...gridStyle} />
          <XAxis
            dataKey="session"
            tick={axisStyle.tick}
            axisLine={axisStyle.axisLine}
            tickLine={axisStyle.tickLine}
          />
          <YAxis
            tick={axisStyle.tick}
            axisLine={axisStyle.axisLine}
            tickLine={axisStyle.tickLine}
            tickFormatter={(v: number) => `${v}%`}
            width={45}
          />
          <Tooltip
            contentStyle={tooltipStyle.contentStyle}
            labelStyle={tooltipStyle.labelStyle}
            itemStyle={tooltipStyle.itemStyle}
            formatter={(value: number, name: string, props: any) => {
              const p = props.payload;
              return [
                `${value}%/min (${p.start}% → ${p.end}% in ${p.duration}min)`,
                "Burn Rate",
              ];
            }}
            labelFormatter={(_: string, payload: any[]) => {
              const p = payload?.[0]?.payload;
              return p ? `${p.model} — ${p.firstSeen?.replace("T", " ")}` : _;
            }}
          />
          <Bar dataKey="burnRate" radius={[4, 4, 0, 0]} name="burnRate">
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.burnRate > 2 ? "#f38ba8" : entry.burnRate > 1 ? "#f9e2af" : "#a6e3a1"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", marginTop: "0.5rem", fontSize: "0.8rem" }}>
        <LegendItem color="#a6e3a1" label="< 1%/min (slow)" />
        <LegendItem color="#f9e2af" label="1-2%/min (moderate)" />
        <LegendItem color="#f38ba8" label="> 2%/min (fast burn)" />
      </div>
    </>
  );
}

function StopoutTable({ stopouts }: { stopouts: StopoutEvent[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(69, 71, 90, 0.4)" }}>
            {["Session", "Model", "Peak Session %", "Peak Weekly %", "First Seen", "Duration", "Snapshots"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--ctp-subtext0)", fontWeight: 600 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stopouts.map((s) => (
            <tr key={s.session_id} style={{ borderBottom: "1px solid rgba(69, 71, 90, 0.2)" }}>
              <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem" }}>
                {s.session_id.slice(0, 8)}
              </td>
              <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)" }}>{s.model}</td>
              <td style={{ padding: "0.4rem 0.75rem", color: pctColor(s.peak_session_pct), fontWeight: 600 }}>
                {s.peak_session_pct}%
              </td>
              <td style={{ padding: "0.4rem 0.75rem", color: pctColor(s.peak_weekly_pct) }}>
                {s.peak_weekly_pct}%
              </td>
              <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem" }}>
                {s.first_seen.replace("T", " ")}
              </td>
              <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)" }}>
                {s.duration_min}min
              </td>
              <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)" }}>{s.snapshots}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pctColor(pct: number): string {
  if (pct < 50) return "#a6e3a1";
  if (pct < 80) return "#f9e2af";
  return "#f38ba8";
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "rgba(30, 30, 46, 0.5)",
      border: "1px solid rgba(69, 71, 90, 0.3)",
      borderRadius: 12,
      padding: "0.75rem 1rem",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "0.75rem", color: "var(--ctp-subtext0)", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: color ?? "var(--ctp-text)", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <div style={{
        width: 16,
        height: 3,
        background: dashed ? "none" : color,
        borderRadius: 2,
        ...(dashed ? { borderTop: `2px dashed ${color}` } : {}),
      }} />
      <span style={{ color: "var(--ctp-subtext0)" }}>{label}</span>
    </div>
  );
}

/* ---- Explainer overlay ---- */

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle: React.CSSProperties = {
  background: "var(--ctp-mantle, #181825)",
  border: "1px solid rgba(69, 71, 90, 0.5)",
  borderRadius: 16,
  padding: "2rem",
  maxWidth: 640,
  width: "90vw",
  maxHeight: "80vh",
  overflowY: "auto",
  color: "var(--ctp-text)",
  fontFamily: "'Outfit', system-ui, sans-serif",
  lineHeight: 1.6,
};

const headingStyle: React.CSSProperties = {
  margin: "1.25rem 0 0.5rem",
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "var(--ctp-lavender, #b4befe)",
};

const paraStyle: React.CSSProperties = {
  margin: "0 0 0.5rem",
  fontSize: "0.85rem",
  color: "var(--ctp-subtext1, #bac2de)",
};

function Explainer({ onClose }: { onClose: () => void }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
            Understanding Rate Limits
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--ctp-subtext0)", cursor: "pointer", fontSize: "1.2rem", padding: "0.2rem 0.4rem", lineHeight: 1 }}
          >
            x
          </button>
        </div>

        <h3 style={headingStyle}>What are rate limits?</h3>
        <p style={paraStyle}>
          Anthropic enforces two rolling usage limits on Claude Code: a <strong>5-hour session limit</strong> and
          a <strong>7-day weekly limit</strong>. When either hits 100%, you get "stopped out" and must
          wait for the window to roll forward. This page tracks your limit usage over time so you can
          understand <em>why</em> and <em>when</em> you get stopped out.
        </p>

        <h3 style={headingStyle}>The summary cards</h3>
        <p style={paraStyle}>
          <strong>Current Session / Weekly</strong> &mdash; Your live usage percentages right now.
          Green (&lt;50%), yellow (50-80%), red (&gt;80%).
        </p>
        <p style={paraStyle}>
          <strong>Stopouts (&gt;80%)</strong> &mdash; Number of sessions that reached the danger zone.
          These are sessions where you were close to or hit the limit.
        </p>
        <p style={paraStyle}>
          <strong>Avg Burn Rate</strong> &mdash; How fast your session usage increases on average,
          measured in percentage points per minute. A higher burn rate means you'll hit the limit sooner.
        </p>

        <h3 style={headingStyle}>Usage Over Time chart</h3>
        <p style={paraStyle}>
          The <span style={{ color: "#89b4fa", fontWeight: 600 }}>blue line</span> is your
          5-hour session usage. It resets when the rolling window passes. The{" "}
          <span style={{ color: "#cba6f7", fontWeight: 600 }}>purple line</span> is the
          7-day weekly limit. The <span style={{ color: "#f38ba8", fontWeight: 600 }}>red dashed line at 80%</span> marks
          the danger zone.
        </p>
        <p style={paraStyle}>
          Look for <strong>steep climbs</strong> &mdash; these are periods of heavy usage that
          drain your limit quickly. A session that goes from 0% to 80% in 30 minutes is burning
          much faster than one that takes 3 hours.
        </p>

        <h3 style={headingStyle}>Session Burn Rate chart</h3>
        <p style={paraStyle}>
          Each bar represents one session, showing how fast it consumed your limit.
          Color-coded: <span style={{ color: "#a6e3a1" }}>green</span> (&lt;1%/min, sustainable),{" "}
          <span style={{ color: "#f9e2af" }}>yellow</span> (1-2%/min, moderate),{" "}
          <span style={{ color: "#f38ba8" }}>red</span> (&gt;2%/min, you'll hit the limit fast).
        </p>
        <p style={paraStyle}>
          Hover a bar to see the full details: starting %, ending %, duration, and model.
          Opus with extended thinking tends to burn faster than Sonnet.
        </p>

        <h3 style={headingStyle}>High Usage Sessions table</h3>
        <p style={paraStyle}>
          Lists every session that crossed 80% session usage. Check the <strong>peak %</strong>,
          <strong> duration</strong>, and <strong>model</strong> to spot patterns. If you're getting
          stopped out frequently, look for sessions with very high burn rates or many
          subagent-heavy workflows.
        </p>

        <h3 style={headingStyle}>Tips to avoid stopouts</h3>
        <p style={paraStyle}>
          <strong>Spread heavy work</strong> &mdash; If you're at 60%+, consider taking a break
          and letting the 5-hour window roll.
        </p>
        <p style={paraStyle}>
          <strong>Watch the burn rate</strong> &mdash; Sessions using Opus with many parallel
          subagents burn through limits fastest.
        </p>
        <p style={paraStyle}>
          <strong>Use effort levels</strong> &mdash; Setting a lower effort level reduces token
          usage per message.
        </p>
      </div>
    </div>
  );
}
