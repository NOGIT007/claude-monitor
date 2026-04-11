import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import type { ToolStatsResult, ToolTimelineEntry, PromptStatsResult } from "../types";

interface Props {
  period: "today" | "week" | "month";
}

const TOOL_COLORS = [
  "var(--ctp-blue)",
  "var(--ctp-green)",
  "var(--ctp-mauve)",
  "var(--ctp-peach)",
  "var(--ctp-teal)",
  "var(--ctp-red)",
  "var(--ctp-yellow)",
  "var(--ctp-pink)",
];

export function ToolUsageChart({ period }: Props) {
  const [toolStats, setToolStats] = useState<ToolStatsResult | null>(null);
  const [timeline, setTimeline] = useState<ToolTimelineEntry[]>([]);
  const [promptStats, setPromptStats] = useState<PromptStatsResult | null>(null);

  useEffect(() => {
    fetch(`/api/stats/tools?period=${period}`)
      .then((r) => r.json())
      .then(setToolStats)
      .catch(() => setToolStats(null));

    fetch(`/api/stats/tools/timeline?period=${period}`)
      .then((r) => r.json())
      .then(setTimeline)
      .catch(() => setTimeline([]));

    fetch(`/api/stats/prompts?period=${period}`)
      .then((r) => r.json())
      .then(setPromptStats)
      .catch(() => setPromptStats(null));
  }, [period]);

  if (!toolStats || toolStats.tools.length === 0) {
    return (
      <div className="card">
        <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
          No OTEL tool data yet. Enable tracing with OTEL_LOG_TOOL_DETAILS=true to see tool analytics.
        </p>
      </div>
    );
  }

  // Build timeline data: pivot toolName into columns per bucket
  const toolNames = [...new Set(timeline.map((t) => t.toolName))];
  const bucketMap = new Map<string, Record<string, number>>();
  for (const entry of timeline) {
    if (!bucketMap.has(entry.bucket)) bucketMap.set(entry.bucket, {});
    bucketMap.get(entry.bucket)![entry.toolName] = entry.count;
  }
  const timelineData = [...bucketMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, tools]) => ({ bucket, ...tools }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ctp-blue)", fontFamily: "var(--font-mono)" }}>
            {toolStats.totalCalls}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)", marginTop: "0.25rem" }}>
            Total Tool Calls
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ctp-green)", fontFamily: "var(--font-mono)" }}>
            {toolStats.tools.length}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)", marginTop: "0.25rem" }}>
            Unique Tools
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ctp-peach)", fontFamily: "var(--font-mono)" }}>
            {Math.round(toolStats.totalDurationMs / 1000)}s
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)", marginTop: "0.25rem" }}>
            Total Tool Time
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ctp-mauve)", fontFamily: "var(--font-mono)" }}>
            {promptStats?.totalPrompts ?? 0}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)", marginTop: "0.25rem" }}>
            User Prompts
          </div>
        </div>
      </div>

      {/* Tool usage bar chart */}
      <div className="card">
        <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
          Tool Calls by Type
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(200, toolStats.tools.length * 40)}>
          <BarChart data={toolStats.tools} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,71,90,0.2)" />
            <XAxis type="number" tick={{ fill: "var(--ctp-subtext0)", fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: "var(--ctp-text)", fontSize: 12, fontFamily: "var(--font-mono)" }} width={60} />
            <Tooltip
              contentStyle={{ background: "var(--ctp-surface0)", border: "1px solid var(--ctp-surface1)", borderRadius: 8, fontSize: 12 }}
              formatter={(value: number, name: string) => {
                if (name === "count") return [value, "Calls"];
                return [value, name];
              }}
              labelFormatter={(label) => label}
            />
            <Bar dataKey="count" fill="var(--ctp-blue)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {/* Error rates inline */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.75rem" }}>
          {toolStats.tools.map((t) => (
            <span key={t.name} style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-subtext0)" }}>
              {t.name}: avg {Math.round(t.avgDurationMs)}ms
              {t.errorRate > 0 && (
                <span style={{ color: "var(--ctp-red)", marginLeft: "0.3rem" }}>
                  ({(t.errorRate * 100).toFixed(1)}% err)
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Timeline chart */}
      {timelineData.length > 1 && (
        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Tool Calls Over Time
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={timelineData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,71,90,0.2)" />
              <XAxis dataKey="bucket" tick={{ fill: "var(--ctp-subtext0)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--ctp-subtext0)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "var(--ctp-surface0)", border: "1px solid var(--ctp-surface1)", borderRadius: 8, fontSize: 12 }}
              />
              {toolNames.map((name, i) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stackId="1"
                  fill={TOOL_COLORS[i % TOOL_COLORS.length]}
                  stroke={TOOL_COLORS[i % TOOL_COLORS.length]}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Prompt stats */}
      {promptStats && promptStats.totalPrompts > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Prompt Analytics
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ctp-lavender)", fontFamily: "var(--font-mono)" }}>
                {promptStats.totalPrompts}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)" }}>Total Prompts</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ctp-teal)", fontFamily: "var(--font-mono)" }}>
                {promptStats.avgLength}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)" }}>Avg Length (chars)</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ctp-flamingo)", fontFamily: "var(--font-mono)" }}>
                {promptStats.promptsPerSession}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)" }}>Per Session</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
