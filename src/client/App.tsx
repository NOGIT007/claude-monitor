import { useState, useEffect, useRef, useCallback } from "react";
import type { ActiveSession, DayEntry, PeriodStats, WsMessage } from "./types";
import { LiveSessions } from "./components/LiveSessions";
import { StatsTabs } from "./components/StatsTabs";
import { RateLimits } from "./components/RateLimits";
import { AnalyticsTabs } from "./components/AnalyticsTabs";

type Period = "today" | "week" | "month";
type WsStatus = "connecting" | "connected" | "disconnected";

export function App() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [history, setHistory] = useState<DayEntry[]>([]);
  const [currentStats, setCurrentStats] = useState<PeriodStats | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [apiError, setApiError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connectWs = useCallback(() => {
    setWsStatus("connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
    };

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
      setWsStatus("disconnected");
      reconnectTimer.current = setTimeout(connectWs, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const fetchSessions = () =>
      fetch("/api/sessions")
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data: ActiveSession[]) => {
          setSessions(data);
          setApiError(null);
        })
        .catch((err) => {
          setApiError(`Failed to fetch sessions: ${err.message}`);
        });

    fetchSessions();

    // Poll every 15s to pick up closed sessions
    const pollInterval = setInterval(fetchSessions, 15000);

    fetch("/api/history?days=30")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: DayEntry[]) => setHistory(data))
      .catch(() => {});

    connectWs();

    return () => {
      clearInterval(pollInterval);
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              color: wsStatus === "connected" ? "var(--ctp-green)"
                : wsStatus === "connecting" ? "var(--ctp-yellow)"
                : "var(--ctp-red)",
            }}
            title={`WebSocket: ${wsStatus}`}
          >
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "currentColor",
              display: "inline-block",
            }} />
            {wsStatus === "disconnected" ? "reconnecting…" : "live"}
          </span>
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
        </div>
      </header>

      {/* Error banner */}
      {apiError && (
        <div
          style={{
            background: "rgba(243, 139, 168, 0.1)",
            border: "1px solid rgba(243, 139, 168, 0.3)",
            borderRadius: 10,
            padding: "0.6rem 1rem",
            marginBottom: "1.5rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--ctp-red)",
          }}
          role="alert"
        >
          {apiError}
        </div>
      )}

      {/* Live Sessions */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 className="section-title">Live Sessions</h2>
        <LiveSessions sessions={sessions} />
      </section>

      {/* Rate Limits */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 className="section-title">Rate Limits</h2>
        <div className="card">
          <RateLimits />
        </div>
      </section>

      {/* Stats with comparison badges */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 className="section-title">Usage Statistics</h2>
        <StatsTabs onStatsChange={setCurrentStats} onPeriodChange={setPeriod} />
      </section>

      {/* Analytics */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 className="section-title">Analytics</h2>
        <AnalyticsTabs period={period} currentStats={currentStats} history={history} />
      </section>

      {/* Footer */}
      <footer
        style={{
          marginTop: "3rem",
          paddingTop: "1.25rem",
          borderTop: "1px solid rgba(69, 71, 90, 0.3)",
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--ctp-overlay0)",
          letterSpacing: "0.03em",
        }}
      >
        made with AI <span style={{ color: "var(--ctp-red)", fontSize: "0.85rem" }}>♥</span>
      </footer>
    </div>
  );
}
