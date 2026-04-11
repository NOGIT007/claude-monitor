import { useState, useEffect } from "react";
import type { SessionTrace } from "../types";

interface Props {
  sessionId: string;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatusBadge({ status }: { status: number }) {
  const isError = status === 2;
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: isError ? "var(--ctp-red)" : "var(--ctp-green)",
        marginRight: "0.3rem",
      }}
      title={isError ? "Error" : "OK"}
    />
  );
}

export function SessionDrillDown({ sessionId }: Props) {
  const [trace, setTrace] = useState<SessionTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/traces/session/${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data: SessionTrace) => {
        setTrace(data);
        setLoading(false);
      })
      .catch(() => {
        setTrace(null);
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div style={{ padding: "1rem", color: "var(--ctp-subtext0)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        Loading trace data...
      </div>
    );
  }

  if (!trace || (trace.spans.length === 0 && trace.toolCalls.length === 0 && trace.prompts.length === 0)) {
    return (
      <div style={{ padding: "1rem", color: "var(--ctp-subtext0)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        No OTEL trace data for this session. Enable OTEL_LOG_TOOL_DETAILS=true to capture traces.
      </div>
    );
  }

  const toggleSpan = (spanId: string) => {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  };

  // Summary
  const uniqueTools = new Set(trace.toolCalls.map((tc) => tc.toolName));
  const totalToolTime = trace.toolCalls.reduce((s, tc) => s + tc.durationMs, 0);
  const errorCount = trace.toolCalls.filter((tc) => tc.status === 2).length;

  // Merge prompts and tool calls into a timeline
  type TimelineItem =
    | { type: "prompt"; timestamp: string; data: SessionTrace["prompts"][0] }
    | { type: "tool"; timestamp: string; data: SessionTrace["toolCalls"][0] };

  const timelineItems: TimelineItem[] = [
    ...trace.prompts.map((p) => ({ type: "prompt" as const, timestamp: p.timestamp, data: p })),
    ...trace.toolCalls.map((tc) => ({ type: "tool" as const, timestamp: tc.timestamp, data: tc })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Summary */}
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-blue)" }}>
          {trace.toolCalls.length} tool calls
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-green)" }}>
          {uniqueTools.size} unique tools
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-peach)" }}>
          {formatMs(totalToolTime)} total tool time
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-mauve)" }}>
          {trace.prompts.length} prompts
        </span>
        {errorCount > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-red)" }}>
            {errorCount} errors
          </span>
        )}
      </div>

      {/* Timeline */}
      <div style={{ borderLeft: "2px solid rgba(69,71,90,0.3)", paddingLeft: "1rem" }}>
        {timelineItems.map((item, i) => {
          if (item.type === "prompt") {
            const p = item.data;
            return (
              <div key={`p-${p.id}`} style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--ctp-overlay0)", fontFamily: "var(--font-mono)", marginBottom: "0.2rem" }}>
                  {formatTime(p.timestamp)}
                </div>
                <div
                  style={{
                    background: "rgba(137, 180, 250, 0.08)",
                    border: "1px solid rgba(137, 180, 250, 0.15)",
                    borderRadius: 6,
                    padding: "0.5rem 0.75rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    color: "var(--ctp-lavender)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {p.promptText}
                </div>
              </div>
            );
          }

          const tc = item.data;
          const isExpanded = expandedSpans.has(tc.spanId);
          return (
            <div key={`tc-${tc.id}`} style={{ marginBottom: "0.75rem" }}>
              <div
                onClick={() => toggleSpan(tc.spanId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span style={{ fontSize: "0.65rem", color: "var(--ctp-overlay0)", fontFamily: "var(--font-mono)" }}>
                  {formatTime(tc.timestamp)}
                </span>
                <StatusBadge status={tc.status} />
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 600,
                  color: "var(--ctp-text)",
                }}>
                  {tc.toolName}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--ctp-subtext0)" }}>
                  {formatMs(tc.durationMs)}
                </span>
                <span style={{ fontSize: "0.65rem", color: "var(--ctp-overlay0)" }}>
                  {isExpanded ? "▼" : "▶"}
                </span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: "0.4rem", marginLeft: "1rem" }}>
                  {tc.inputSummary && (
                    <div style={{ marginBottom: "0.3rem" }}>
                      <div style={{ fontSize: "0.6rem", color: "var(--ctp-overlay1)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.15rem" }}>
                        Input
                      </div>
                      <pre style={{
                        background: "rgba(30, 30, 46, 0.5)",
                        borderRadius: 4,
                        padding: "0.4rem 0.6rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        color: "var(--ctp-subtext1)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        margin: 0,
                        maxHeight: 200,
                        overflow: "auto",
                      }}>
                        {tc.inputSummary}
                      </pre>
                    </div>
                  )}
                  {tc.outputSummary && (
                    <div>
                      <div style={{ fontSize: "0.6rem", color: "var(--ctp-overlay1)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.15rem" }}>
                        Output
                      </div>
                      <pre style={{
                        background: "rgba(30, 30, 46, 0.5)",
                        borderRadius: 4,
                        padding: "0.4rem 0.6rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        color: "var(--ctp-subtext1)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        margin: 0,
                        maxHeight: 200,
                        overflow: "auto",
                      }}>
                        {tc.outputSummary}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
