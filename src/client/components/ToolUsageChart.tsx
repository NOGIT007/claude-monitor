import { useEffect, useState, useCallback } from "react";
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

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle: React.CSSProperties = {
  background: "var(--ctp-mantle, #181825)",
  border: "1px solid rgba(69,71,90,0.5)",
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
          <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Understanding Tool Usage</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--ctp-subtext0)", cursor: "pointer", fontSize: "1.2rem", padding: "0.2rem 0.4rem", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <h3 style={headingStyle}>What is this?</h3>
        <p style={paraStyle}>
          This tab tracks every tool Claude Code calls during your sessions &mdash; reads, writes,
          shell commands, searches, and more. Data comes from OpenTelemetry (OTEL) spans emitted
          by the Claude Code CLI.
        </p>

        <h3 style={headingStyle}>How does it work?</h3>
        <p style={paraStyle}>
          Claude Code sends OTEL spans to <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>http://localhost:4318</code> (the
          standard OTLP port). The monitor ingests them in real-time and stores tool call details
          in SQLite. No data leaves your machine.
        </p>

        <h3 style={headingStyle}>Enabling tracing</h3>
        <p style={paraStyle}>
          Tool details are only emitted when these environment variables are set in the shell where
          you run <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>claude</code>:
        </p>
        <pre style={{ background: "var(--ctp-surface0)", borderRadius: 8, padding: "0.75rem 1rem", fontSize: "0.78rem", fontFamily: "var(--font-mono)", color: "var(--ctp-green)", margin: "0 0 0.75rem", overflowX: "auto" }}>
{`export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_LOG_TOOL_DETAILS=true
export OTEL_LOG_TOOL_CONTENT=true   # optional: capture input/output
export OTEL_LOG_USER_PROMPTS=true   # optional: capture prompt text`}
        </pre>
        <p style={paraStyle}>
          The easiest way: add <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>source ~/.claude-monitor.env</code> to
          your <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>~/.zshrc</code>. The monitor writes this file on every start.
        </p>

        <h3 style={headingStyle}>What the charts show</h3>
        <p style={paraStyle}>
          <strong>Tool Calls by Type</strong> — horizontal bar chart ranked by call count. The inline
          text shows average execution time and error rate per tool.
        </p>
        <p style={paraStyle}>
          <strong>Tool Calls Over Time</strong> — stacked area chart showing when tools were used
          across the selected period (hourly for Today, daily for Week/Month).
        </p>
        <p style={paraStyle}>
          <strong>Prompt Analytics</strong> — counts interactions (user messages) and their average
          length, giving you a sense of session density.
        </p>

        <h3 style={headingStyle}>Common tools</h3>
        <p style={paraStyle}>
          <strong>Bash</strong> — shell commands &nbsp;·&nbsp; <strong>Read</strong> — file reads &nbsp;·&nbsp;
          <strong>Write/Edit</strong> — file writes &nbsp;·&nbsp; <strong>Grep/Glob</strong> — search &nbsp;·&nbsp;
          <strong>Agent</strong> — subagent dispatches &nbsp;·&nbsp; <strong>Skill/ToolSearch</strong> — skill invocations
        </p>
      </div>
    </div>
  );
}

/** Strip common OTEL prefixes so labels are short and readable */
function shortName(name: string): string {
  return name
    .replace(/^claude_code\.tool\./, "")
    .replace(/^claude_code\.tool$/, "tool (generic)")
    .replace(/^claude_code\./, "")
    .replace(/_/g, " ");
}

export function ToolUsageChart({ period }: Props) {
  const [toolStats, setToolStats] = useState<ToolStatsResult | null>(null);
  const [timeline, setTimeline] = useState<ToolTimelineEntry[]>([]);
  const [promptStats, setPromptStats] = useState<PromptStatsResult | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);
  const openExplainer = useCallback(() => setShowExplainer(true), []);
  const closeExplainer = useCallback(() => setShowExplainer(false), []);

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

  const explainerBtn = (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        onClick={openExplainer}
        style={{
          background: "rgba(69,71,90,0.3)",
          border: "1px solid rgba(69,71,90,0.5)",
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
  );

  if (!toolStats || toolStats.tools.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {explainerBtn}
        {showExplainer && <Explainer onClose={closeExplainer} />}
        <div className="card">
          <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
            No OTEL tool data yet. Enable tracing with <code style={{ fontFamily: "var(--font-mono)" }}>OTEL_LOG_TOOL_DETAILS=true</code> — click "What is this?" for setup instructions.
          </p>
        </div>
      </div>
    );
  }

  // Augment tools with short display name for chart labels
  const toolsDisplay = toolStats.tools.map((t) => ({ ...t, label: shortName(t.name) }));

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

  // Y-axis width: fit the longest short label (monospace ~8px/char + padding)
  const maxLabelLen = Math.max(...toolsDisplay.map((t) => t.label.length));
  const yAxisWidth = Math.min(Math.max(maxLabelLen * 8 + 16, 90), 220);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {explainerBtn}
      {showExplainer && <Explainer onClose={closeExplainer} />}
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
        <ResponsiveContainer width="100%" height={Math.max(200, toolsDisplay.length * 44)}>
          <BarChart data={toolsDisplay} layout="vertical" margin={{ left: 8, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,71,90,0.2)" />
            <XAxis type="number" tick={{ fill: "var(--ctp-subtext0)", fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="label"
              width={yAxisWidth}
              tick={{ fill: "var(--ctp-text)", fontSize: 12, fontFamily: "var(--font-mono)" }}
            />
            <Tooltip
              contentStyle={{ background: "var(--ctp-surface0)", border: "1px solid var(--ctp-surface1)", borderRadius: 8, fontSize: 12 }}
              formatter={(value: number) => [value, "Calls"]}
              labelFormatter={(label) => label}
            />
            <Bar dataKey="count" fill="var(--ctp-blue)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {/* Avg duration per tool */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.75rem" }}>
          {toolsDisplay.map((t) => (
            <span key={t.name} style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-subtext0)" }}>
              <span style={{ color: "var(--ctp-text)" }}>{t.label}</span>: avg {Math.round(t.avgDurationMs)}ms
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
                formatter={(value: number, name: string) => [value, shortName(name)]}
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
