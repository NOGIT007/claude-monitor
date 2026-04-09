import { useState, useEffect, useRef, useCallback } from "react";
import type { ActiveSession, DayEntry, PeriodStats, WsMessage } from "./types";
import { LiveSessions } from "./components/LiveSessions";
import { StatsTabs } from "./components/StatsTabs";
import { TokenChart } from "./components/TokenChart";
import { BreakdownChart } from "./components/BreakdownChart";

export function App() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [history, setHistory] = useState<DayEntry[]>([]);
  const [currentStats, setCurrentStats] = useState<PeriodStats | null>(null);
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
    // Fetch initial sessions
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: ActiveSession[]) => setSessions(data))
      .catch(() => {});

    // Fetch history
    fetch("/api/history?days=30")
      .then((r) => r.json())
      .then((data: DayEntry[]) => setHistory(data))
      .catch(() => {});

    // Connect WebSocket
    connectWs();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2rem",
          paddingBottom: "1rem",
          borderBottom: `1px solid var(--ctp-surface0)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--ctp-lavender)",
            }}
          >
            Claude Monitor
          </h1>
          {sessions.length > 0 && (
            <span
              style={{
                background: "var(--ctp-green)",
                color: "var(--ctp-crust)",
                fontSize: "0.75rem",
                fontWeight: 700,
                padding: "0.15rem 0.5rem",
                borderRadius: 999,
              }}
            >
              {sessions.length} active
            </span>
          )}
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--ctp-overlay0)" }}>
          Powered by Bun
        </span>
      </header>

      {/* Live Sessions */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={sectionTitle}>Live Sessions</h2>
        <LiveSessions sessions={sessions} />
      </section>

      {/* Stats */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={sectionTitle}>Usage Statistics</h2>
        <StatsTabs onStatsChange={setCurrentStats} />
      </section>

      {/* Charts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
        }}
      >
        <section>
          <h2 style={sectionTitle}>Token History</h2>
          <div className="card">
            <TokenChart history={history} />
          </div>
        </section>
        <section>
          <h2 style={sectionTitle}>Token Breakdown</h2>
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

const sectionTitle: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 600,
  color: "var(--ctp-subtext1)",
  marginBottom: "0.75rem",
  marginTop: 0,
};
