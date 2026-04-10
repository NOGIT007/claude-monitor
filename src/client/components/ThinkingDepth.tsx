import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ThinkingDepthEntry } from "../types";
import { formatNumber, formatCompact } from "../format";
import { tooltipStyle, axisStyle, gridStyle, chartColors } from "../chart-theme";

interface Props {
  period: "today" | "week" | "month";
}

export function ThinkingDepth({ period }: Props) {
  const [data, setData] = useState<ThinkingDepthEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats/thinking-depth?period=${period}`)
      .then((r) => r.json())
      .then((d: ThinkingDepthEntry[]) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const summary = useMemo(() => {
    if (data.length === 0) return null;
    const totalMsgs = data.reduce((s, d) => s + d.totalMessages, 0);
    const thinkingMsgs = data.reduce((s, d) => s + d.thinkingMessages, 0);
    const avgOutput = totalMsgs > 0
      ? Math.round(data.reduce((s, d) => s + d.avgOutputTokens * d.totalMessages, 0) / totalMsgs)
      : 0;
    const rate = totalMsgs > 0 ? (100 * thinkingMsgs / totalMsgs) : 0;
    return { totalMsgs, thinkingMsgs, avgOutput, rate };
  }, [data]);

  if (loading) {
    return <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>Loading...</p>;
  }

  if (data.length === 0) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
        No thinking depth data yet. Data is collected from new messages going forward.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Explainer button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          <SummaryCard label="Total Messages" value={formatNumber(summary.totalMsgs)} />
          <SummaryCard label="Thinking Rate" value={`${summary.rate.toFixed(1)}%`} />
          <SummaryCard label="Thinking Messages" value={formatNumber(summary.thinkingMsgs)} />
          <SummaryCard label="Avg Output Tokens" value={formatCompact(summary.avgOutput)} />
        </div>
      )}

      {/* Chart: thinking rate + avg output tokens over time */}
      <div className="card">
        <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
          Thinking Depth Over Time
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
            <CartesianGrid {...gridStyle} />
            <XAxis
              dataKey="date"
              tick={axisStyle.tick}
              axisLine={axisStyle.axisLine}
              tickLine={axisStyle.tickLine}
            />
            <YAxis
              yAxisId="left"
              width={55}
              label={{
                value: "Output Tokens",
                angle: -90,
                position: "insideLeft",
                fill: "#7f849c",
                fontSize: 11,
                fontFamily: "'Outfit', system-ui",
                offset: 5,
              }}
              tick={axisStyle.tick}
              axisLine={axisStyle.axisLine}
              tickLine={axisStyle.tickLine}
              tickFormatter={(v: number) => formatCompact(v)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={55}
              domain={[0, 100]}
              label={{
                value: "Thinking %",
                angle: 90,
                position: "insideRight",
                fill: "#7f849c",
                fontSize: 11,
                fontFamily: "'Outfit', system-ui",
                offset: 5,
              }}
              tick={axisStyle.tick}
              axisLine={axisStyle.axisLine}
              tickLine={axisStyle.tickLine}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={tooltipStyle.contentStyle}
              labelStyle={tooltipStyle.labelStyle}
              itemStyle={tooltipStyle.itemStyle}
              cursor={tooltipStyle.cursor}
              formatter={(value: number, name: string) => {
                if (name === "avgOutputTokens") return [formatNumber(value), "Avg Output Tokens"];
                if (name === "thinkingRate") return [`${value.toFixed(1)}%`, "Thinking Rate"];
                if (name === "avgOutputPerThinking") return [formatNumber(value), "Avg Output (Thinking)"];
                return [String(value), name];
              }}
              labelFormatter={(label: string) => label}
            />
            <Bar
              yAxisId="left"
              dataKey="avgOutputTokens"
              fill={chartColors.input}
              opacity={0.6}
              name="avgOutputTokens"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="thinkingRate"
              stroke="#f38ba8"
              strokeWidth={2}
              dot={{ r: 3, fill: "#f38ba8" }}
              name="thinkingRate"
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="avgOutputPerThinking"
              stroke="#cba6f7"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              name="avgOutputPerThinking"
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", marginTop: "0.5rem", fontSize: "0.8rem" }}>
          <LegendItem color={chartColors.input} label="Avg Output Tokens" dashed={false} />
          <LegendItem color="#f38ba8" label="Thinking Rate %" dashed={false} />
          <LegendItem color="#cba6f7" label="Avg Output (Thinking only)" dashed />
        </div>
      </div>

      {/* Daily breakdown table */}
      <div className="card">
        <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
          Daily Breakdown
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(69, 71, 90, 0.4)" }}>
                {["Date", "Messages", "Thinking", "Rate", "Avg Output", "Avg Output (Thinking)"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--ctp-subtext0)", fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((row) => (
                <tr key={row.date} style={{ borderBottom: "1px solid rgba(69, 71, 90, 0.2)" }}>
                  <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)", fontFamily: "'JetBrains Mono', monospace" }}>{row.date}</td>
                  <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)" }}>{formatNumber(row.totalMessages)}</td>
                  <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)" }}>{formatNumber(row.thinkingMessages)}</td>
                  <td style={{ padding: "0.4rem 0.75rem", color: row.thinkingRate > 50 ? "#a6e3a1" : row.thinkingRate > 20 ? "#f9e2af" : "#f38ba8" }}>
                    {row.thinkingRate.toFixed(1)}%
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)" }}>{formatCompact(row.avgOutputTokens)}</td>
                  <td style={{ padding: "0.4rem 0.75rem", color: "var(--ctp-text)" }}>{formatCompact(row.avgOutputPerThinking)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "rgba(30, 30, 46, 0.5)",
      border: "1px solid rgba(69, 71, 90, 0.3)",
      borderRadius: 12,
      padding: "0.75rem 1rem",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "0.75rem", color: "var(--ctp-subtext0)", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--ctp-text)", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <div style={{
        width: 16,
        height: 3,
        background: color,
        borderRadius: 2,
        ...(dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0px, ${color} 5px, transparent 5px, transparent 8px)`, background: "none" } : {}),
      }} />
      <span style={{ color: "var(--ctp-subtext0)" }}>{label}</span>
    </div>
  );
}

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
            Understanding Thinking Depth
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--ctp-subtext0)",
              cursor: "pointer",
              fontSize: "1.2rem",
              padding: "0.2rem 0.4rem",
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>

        <h3 style={headingStyle}>What is this?</h3>
        <p style={paraStyle}>
          When Claude responds, it can use <strong>extended thinking</strong> &mdash;
          an internal reasoning step before producing visible output. This page tracks
          how often and how deeply Claude thinks across your sessions.
        </p>
        <p style={paraStyle}>
          There has been community discussion (see{" "}
          <span style={{ color: "#89b4fa" }}>anthropics/claude-code#7796</span>)
          about whether thinking depth has changed over time. This dashboard lets
          you measure it yourself with your own data.
        </p>

        <h3 style={headingStyle}>The summary cards</h3>
        <p style={paraStyle}>
          <strong>Total Messages</strong> &mdash; Every API response Claude sent in the selected period.
        </p>
        <p style={paraStyle}>
          <strong>Thinking Rate</strong> &mdash; The percentage of messages that included at
          least one thinking block. A higher rate means Claude is reasoning more often.
        </p>
        <p style={paraStyle}>
          <strong>Thinking Messages</strong> &mdash; The raw count of responses with thinking.
        </p>
        <p style={paraStyle}>
          <strong>Avg Output Tokens</strong> &mdash; The average output tokens per message.
          This includes both thinking tokens and visible text, because the API bundles
          them together. A drop in this number over time could suggest less thinking.
        </p>

        <h3 style={headingStyle}>Reading the chart</h3>
        <p style={paraStyle}>
          <span style={{ color: chartColors.input, fontWeight: 600 }}>Blue bars</span>{" "}
          show the average output tokens per message each day. Think of this as the
          overall "effort" Claude puts into a response.
        </p>
        <p style={paraStyle}>
          <span style={{ color: "#f38ba8", fontWeight: 600 }}>Red line</span>{" "}
          shows the thinking rate (right axis). If this line trends downward, Claude
          is using extended thinking less frequently.
        </p>
        <p style={paraStyle}>
          <span style={{ color: "#cba6f7", fontWeight: 600 }}>Purple dashed line</span>{" "}
          shows the average output tokens only for messages that included thinking.
          This tells you how deep the thinking is when it happens.
        </p>

        <h3 style={headingStyle}>What to watch for</h3>
        <p style={paraStyle}>
          <strong>Declining blue bars</strong> &mdash; Average output per message is shrinking.
          Could mean less thinking, or just shorter tasks.
        </p>
        <p style={paraStyle}>
          <strong>Red line dropping</strong> &mdash; Claude is choosing to think less often.
          This is the clearest signal of "thinking shrinkflation."
        </p>
        <p style={paraStyle}>
          <strong>Purple line stable while red drops</strong> &mdash; When Claude does think,
          it thinks just as deeply, but it's choosing to think less often.
        </p>
        <p style={paraStyle}>
          <strong>Both lines dropping</strong> &mdash; Both frequency and depth of thinking
          are decreasing.
        </p>

        <h3 style={headingStyle}>Limitations</h3>
        <p style={paraStyle}>
          Claude Code redacts the actual thinking text from session logs (for privacy),
          so we can't measure thinking token counts directly. The API bundles thinking
          tokens into <code style={{ color: "#f9e2af", fontSize: "0.82rem" }}>output_tokens</code>,
          making total output a reasonable proxy. The thinking block presence
          (yes/no per message) is tracked accurately.
        </p>
        <p style={paraStyle}>
          Your results will vary based on task type, model (Opus thinks more than Sonnet),
          and effort level setting. Compare similar workloads for the most meaningful trends.
        </p>
      </div>
    </div>
  );
}
