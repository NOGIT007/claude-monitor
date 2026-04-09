import { useState, useEffect, useRef, useCallback } from "react";
import type { ActiveSession, DayEntry, PeriodStats, WsMessage } from "./types";
import { LiveSessions } from "./components/LiveSessions";
import { StatsTabs } from "./components/StatsTabs";
import { SessionStats } from "./components/SessionStats";
import { EfficiencyMetrics } from "./components/EfficiencyMetrics";
import { ProjectCosts } from "./components/ProjectCosts";
import { ModelBreakdown } from "./components/ModelBreakdown";
import { CostTrendChart } from "./components/CostTrendChart";
import { PeakHours } from "./components/PeakHours";
import { TokenChart } from "./components/TokenChart";
import { BreakdownChart } from "./components/BreakdownChart";

type Period = "today" | "week" | "month";

export function App() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [history, setHistory] = useState<DayEntry[]>([]);
  const [currentStats, setCurrentStats] = useState<PeriodStats | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connectWs = useCallback(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        if (msg.type === "session_update") {
          setSessions((prev) => {
            const idx = prev.findIndex((s) => s.sessionId === msg.sessionId);
            const updated: ActiveSession = {
              sessionId: msg.sessionId,
              projectPath: msg.projectPath,
              model: msg.model,
              elapsedMs: msg.elapsedMs,
              totals: msg.totals,
            };
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = updated;
              return next;
            }
            return [...prev, updated];
          });
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(connectWs, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: ActiveSession[]) => setSessions(data))
      .catch(() => {});

    fetch("/api/history?days=30")
      .then((r) => r.json())
      .then((data: DayEntry[]) => setHistory(data))
      .catch(() => {});

    connectWs();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem 3rem" }}>
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2.5rem",
          paddingBottom: "1.25rem",
          borderBottom: `1px solid rgba(69, 71, 90, 0.3)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "1.6rem",
              fontWeight: 800,
              color: "var(--ctp-lavender)",
              letterSpacing: "-0.02em",
            }}
          >
            Claude Monitor
          </h1>
          {sessions.length > 0 && (
            <span
              style={{
                background: "rgba(166, 227, 161, 0.15)",
                color: "var(--ctp-green)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                fontWeight: 600,
                padding: "0.2rem 0.6rem",
                borderRadius: 20,
                border: "1px solid rgba(166, 227, 161, 0.2)",
              }}
            >
              {sessions.length} active
            </span>
          )}
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "var(--ctp-overlay0)",
            letterSpacing: "0.05em",
          }}
        >
          powered by bun
        </span>
      </header>

      {/* Live Sessions */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 className="section-title">Live Sessions</h2>
        <LiveSessions sessions={sessions} />
      </section>

      {/* Stats with comparison badges */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 className="section-title">Usage Statistics</h2>
        <StatsTabs onStatsChange={setCurrentStats} onPeriodChange={setPeriod} />
      </section>

      {/* Session Stats */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 className="section-title">Session Metrics</h2>
        <SessionStats period={period} />
      </section>

      {/* Efficiency */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 className="section-title">Efficiency</h2>
        <EfficiencyMetrics stats={currentStats} />
      </section>

      {/* Cost per Project + Model Breakdown */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
          marginBottom: "2.5rem",
        }}
      >
        <section>
          <h2 className="section-title">Cost per Project</h2>
          <div className="card">
            <ProjectCosts period={period} />
          </div>
        </section>
        <section>
          <h2 className="section-title">Model Breakdown</h2>
          <div className="card">
            <ModelBreakdown period={period} />
          </div>
        </section>
      </div>

      {/* Cost Trend + Peak Hours */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
          marginBottom: "2.5rem",
        }}
      >
        <section>
          <h2 className="section-title">Cost Trend</h2>
          <div className="card">
            <CostTrendChart />
          </div>
        </section>
        <section>
          <h2 className="section-title">Peak Hours</h2>
          <div className="card">
            <PeakHours />
          </div>
        </section>
      </div>

      {/* Token History + Breakdown */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
        }}
      >
        <section>
          <h2 className="section-title">Token History</h2>
          <div className="card">
            <TokenChart history={history} />
          </div>
        </section>
        <section>
          <h2 className="section-title">Token Breakdown</h2>
          <div className="card">
            {currentStats ? (
              <BreakdownChart stats={currentStats} />
            ) : (
              <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
                Select a period above to see breakdown
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// Section titles now use .section-title CSS class from theme.css
