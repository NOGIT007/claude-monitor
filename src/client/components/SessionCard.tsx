import type { ActiveSession } from "../types";
import { formatNumber, formatCost, formatElapsed } from "../format";

const tokenLabels: { key: keyof ActiveSession["totals"]; label: string; color: string }[] = [
  { key: "input", label: "Input", color: "var(--ctp-blue)" },
  { key: "output", label: "Output", color: "var(--ctp-peach)" },
  { key: "cacheRead", label: "Cache Read", color: "var(--ctp-green)" },
  { key: "cacheWrite", label: "Cache Write", color: "var(--ctp-mauve)" },
];

function CliIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" title="Claude Code CLI">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="var(--ctp-green)" strokeWidth="1.2" fill="none" />
      <path d="M4 6l2.5 2L4 10" stroke="var(--ctp-green)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="10" x2="11" y2="10" stroke="var(--ctp-green)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function DesktopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" title="Claude Desktop">
      <rect x="1" y="1.5" width="14" height="10" rx="1.5" stroke="var(--ctp-peach)" strokeWidth="1.2" fill="none" />
      <line x1="5.5" y1="11.5" x2="10.5" y2="11.5" stroke="var(--ctp-peach)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="8" y1="11.5" x2="8" y2="14" stroke="var(--ctp-peach)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="14" x2="11" y2="14" stroke="var(--ctp-peach)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function SessionCard({ sessionId, projectPath, model, entrypoint, elapsedMs, totals }: ActiveSession) {
  const projectName = projectPath?.split("/").pop() || projectPath || "unknown";
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
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "1rem",
            color: "var(--ctp-text)",
          }}
        >
          {entrypoint === "claude-desktop" ? <DesktopIcon /> : <CliIcon />}
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
