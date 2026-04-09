import type { ActiveSession } from "../types";
import { formatNumber, formatCost, formatElapsed } from "../format";

// Inject keyframes once (idempotent for HMR)
if (typeof document !== "undefined" && !document.getElementById("pulse-glow-style")) {
  const style = document.createElement("style");
  style.id = "pulse-glow-style";
  style.textContent = `
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(166, 227, 161, 0.15); }
  50% { box-shadow: 0 0 12px 2px rgba(166, 227, 161, 0.25); }
}`;
  document.head.appendChild(style);
}

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
        border: `1px solid var(--ctp-surface1)`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.75rem",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "1rem", color: "var(--ctp-text)" }}>
          {projectName}
        </span>
        <span
          style={{
            background: "var(--ctp-surface1)",
            color: "var(--ctp-lavender)",
            fontSize: "0.7rem",
            fontWeight: 600,
            padding: "0.15rem 0.5rem",
            borderRadius: 6,
          }}
        >
          {model}
        </span>
      </div>

      {/* Elapsed */}
      <div
        style={{
          fontSize: "0.8rem",
          color: "var(--ctp-subtext0)",
          marginBottom: "0.75rem",
        }}
      >
        Elapsed: {formatElapsed(elapsedMs)}
      </div>

      {/* Token grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        {tokenLabels.map(({ key, label, color }) => (
          <div key={key}>
            <div style={{ fontSize: "0.7rem", color: "var(--ctp-overlay1)", marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, color }}>
              {formatNumber(totals[key])}
            </div>
          </div>
        ))}
      </div>

      {/* Cost */}
      <div
        style={{
          textAlign: "right",
          fontWeight: 700,
          fontSize: "1rem",
          color: "var(--ctp-yellow)",
        }}
      >
        {formatCost(totals.costUsd)}
      </div>
    </div>
  );
}
