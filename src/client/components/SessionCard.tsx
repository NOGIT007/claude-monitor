import type { ActiveSession } from "../types";
import { formatNumber, formatCost, formatElapsed } from "../format";

const tokenLabels: { key: keyof ActiveSession["totals"]; label: string; color: string }[] = [
  { key: "input", label: "Input", color: "var(--ctp-blue)" },
  { key: "output", label: "Output", color: "var(--ctp-peach)" },
  { key: "cacheRead", label: "Cache Read", color: "var(--ctp-green)" },
  { key: "cacheWrite", label: "Cache Write", color: "var(--ctp-mauve)" },
];

export function SessionCard({ sessionId, projectPath, model, elapsedMs, totals }: ActiveSession) {
  const projectName = projectPath.split("/").pop() || projectPath;
  const isRecent = elapsedMs < 60_000;

  return (
    <div
      className="card"
      style={{
        animation: isRecent ? "pulse-glow 2s ease-in-out infinite" : undefined,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "1rem",
            color: "var(--ctp-text)",
          }}
        >
          {projectName}
        </span>
        <span
          className="model-badge"
          style={{
            background: "rgba(180, 190, 254, 0.1)",
            color: "var(--ctp-lavender)",
            border: "1px solid rgba(180, 190, 254, 0.15)",
          }}
        >
          {model}
        </span>
      </div>

      {/* Elapsed */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.75rem",
          color: "var(--ctp-subtext0)",
          marginBottom: "1rem",
          letterSpacing: "0.02em",
        }}
      >
        {formatElapsed(elapsedMs)}
      </div>

      {/* Token grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
          marginBottom: "1rem",
          padding: "0.75rem",
          background: "rgba(17, 17, 27, 0.4)",
          borderRadius: 10,
        }}
      >
        {tokenLabels.map(({ key, label, color }) => (
          <div key={key}>
            <div
              style={{
                fontSize: "0.6rem",
                fontFamily: "var(--font-display)",
                color: "var(--ctp-overlay0)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 3,
              }}
            >
              {label}
            </div>
            <div
              className="metric-value"
              style={{ fontSize: "0.9rem", color }}
            >
              {formatNumber(totals[key])}
            </div>
          </div>
        ))}
      </div>

      {/* Cost */}
      <div
        className="metric-value"
        style={{
          textAlign: "right",
          fontSize: "1.1rem",
          color: "var(--ctp-yellow)",
        }}
      >
        {formatCost(totals.costUsd)}
      </div>
    </div>
  );
}
