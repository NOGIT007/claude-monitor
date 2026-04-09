// Shared Recharts theming constants for Catppuccin Mocha
export const tooltipStyle = {
  contentStyle: {
    background: "rgba(24, 24, 37, 0.95)",
    border: "1px solid rgba(69, 71, 90, 0.5)",
    borderRadius: 12,
    backdropFilter: "blur(8px)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontSize: "0.8rem",
    padding: "0.6rem 0.8rem",
  },
  labelStyle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: "#b4befe", // ctp-lavender
    marginBottom: "0.25rem",
  },
  itemStyle: {
    color: "#cdd6f4", // ctp-text
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontSize: "0.8rem",
    padding: 0,
  },
  cursor: { fill: "rgba(137, 180, 250, 0.06)" },
};

export const axisStyle = {
  tick: { fill: "#a6adc8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
  axisLine: { stroke: "rgba(69, 71, 90, 0.4)" },
  tickLine: false as const,
};

export const gridStyle = {
  strokeDasharray: "3 3",
  stroke: "rgba(69, 71, 90, 0.3)",
};
