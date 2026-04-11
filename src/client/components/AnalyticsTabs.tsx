import { useState, useRef, useCallback } from "react";
import type { DayEntry, PeriodStats, AnalyticsTab } from "../types";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { Sparkline } from "./Sparkline";
import { TokenDistribution } from "./TokenDistribution";
import { TokenChart } from "./TokenChart";
import { BreakdownChart } from "./BreakdownChart";
import { ModelBreakdown } from "./ModelBreakdown";
import { PeakHours } from "./PeakHours";
import { ProjectCosts } from "./ProjectCosts";
import { SessionHistory } from "./SessionHistory";
import { SessionStats } from "./SessionStats";
import { EfficiencyMetrics } from "./EfficiencyMetrics";
import { CostTrendChart } from "./CostTrendChart";
import { ThinkingDepth } from "./ThinkingDepth";
import { RateLimitAnalytics } from "./RateLimitAnalytics";
import { ToolUsageChart } from "./ToolUsageChart";

const tabs: { key: AnalyticsTab; label: string }[] = [
  { key: "tokens", label: "Token Analytics" },
  { key: "workflow", label: "Workflow Intelligence" },
  { key: "productivity", label: "Productivity Analytics" },
  { key: "thinking", label: "Thinking Depth" },
  { key: "ratelimits", label: "Rate Limits" },
  { key: "tools", label: "Tool Usage" },
];

interface Props {
  period: "today" | "week" | "month";
  currentStats: PeriodStats | null;
  history: DayEntry[];
}

export function AnalyticsTabs({ period, currentStats, history }: Props) {
  const [active, setActive] = useState<AnalyticsTab>("tokens");
  const tabBarRef = useRef<HTMLDivElement>(null);

  const switchTab = useCallback((key: AnalyticsTab) => {
    setActive(key);
  }, []);

  return (
    <div>
      {/* Tab buttons — sticky so they stay visible when switching */}
      <div ref={tabBarRef} style={{
        display: "flex",
        gap: "0.5rem",
        marginBottom: "1.5rem",
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--ctp-base)",
        paddingTop: "0.75rem",
        paddingBottom: "0.75rem",
      }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`tab-btn ${active === key ? "tab-btn--active" : "tab-btn--inactive"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Token Analytics */}
      <div style={{ display: active === "tokens" ? "flex" : "none", flexDirection: "column", gap: "1.5rem" }}>
        <ActivityHeatmap />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <Sparkline history={history} />
          {currentStats ? (
            <TokenDistribution stats={currentStats} />
          ) : (
            <div className="card">
              <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
                Select a period above to see distribution
              </p>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <div className="card">
            <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
              Token History
            </h3>
            <TokenChart history={history} />
          </div>
          <div className="card">
            <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
              Token Breakdown
            </h3>
            {currentStats ? (
              <BreakdownChart stats={currentStats} />
            ) : (
              <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
                Select a period above to see breakdown
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Model Breakdown
          </h3>
          <ModelBreakdown period={period} />
        </div>
      </div>

      {/* Workflow Intelligence */}
      <div style={{ display: active === "workflow" ? "flex" : "none", flexDirection: "column", gap: "1.5rem" }}>
        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Peak Hours
          </h3>
          <PeakHours period={period} />
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Cost per Project
          </h3>
          <ProjectCosts period={period} />
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Session History
          </h3>
          <SessionHistory period={period} />
        </div>
      </div>

      {/* Productivity Analytics */}
      <div style={{ display: active === "productivity" ? "flex" : "none", flexDirection: "column", gap: "1.5rem" }}>
        <SessionStats period={period} />

        <EfficiencyMetrics stats={currentStats} />

        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Cost Trend
          </h3>
          <CostTrendChart />
        </div>
      </div>

      {/* Thinking Depth */}
      <div style={{ display: active === "thinking" ? "block" : "none" }}>
        <ThinkingDepth period={period} />
      </div>

      {/* Rate Limits */}
      <div style={{ display: active === "ratelimits" ? "block" : "none" }}>
        <RateLimitAnalytics />
      </div>

      {/* Tool Usage */}
      <div style={{ display: active === "tools" ? "block" : "none" }}>
        <ToolUsageChart period={period} />
      </div>
    </div>
  );
}
