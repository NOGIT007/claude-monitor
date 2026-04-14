import { useState, useEffect, useRef, useCallback } from "react";
import type { ActiveSession, DayEntry, PeriodStats, WsMessage } from "./types";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { LiveSessions } from "./components/LiveSessions";
import { StatsTabs } from "./components/StatsTabs";
import { AnalyticsTabs } from "./components/AnalyticsTabs";

type Period = "today" | "week" | "month";
type WsStatus = "connecting" | "connected" | "disconnected";
type View = "dashboard" | "analytics";

export function App() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [history, setHistory] = useState<DayEntry[]>([]);
  const [currentStats, setCurrentStats] = useState<PeriodStats | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [apiError, setApiError] = useState<string | null>(null);
  const [view, setView] = useState<View>("dashboard");
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
    <div>
      {/* Error banner */}
      {apiError && (
        <div
          style={{
            background: "rgba(243, 139, 168, 0.1)",
            border: "1px solid rgba(243, 139, 168, 0.3)",
            borderRadius: 10,
            padding: "0.6rem 1rem",
            margin: "1rem 1.5rem 0",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--ctp-red)",
          }}
          role="alert"
        >
          {apiError}
        </div>
      )}

      {/* Navigation */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem 1.5rem 0" }}>
        <nav className="ov-nav">
          <button
            className={`ov-nav-btn ${view === "dashboard" ? "ov-nav-btn--active" : ""}`}
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`ov-nav-btn ${view === "analytics" ? "ov-nav-btn--active" : ""}`}
            onClick={() => setView("analytics")}
          >
            Analytics
          </button>
        </nav>
      </div>

      {view === "dashboard" ? (
        <>
          <OverviewDashboard
            activeSessions={sessions.length}
            wsStatus={wsStatus}
          />

          {/* Live Sessions — show below dashboard when active */}
          {sessions.length > 0 && (
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem 2rem" }}>
              <h2 className="section-title">Live Sessions</h2>
              <LiveSessions sessions={sessions} />
            </div>
          )}
        </>
      ) : (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem 1.5rem 3rem" }}>
          {/* Stats */}
          <section style={{ marginBottom: "2rem" }}>
            <h2 className="section-title">Usage Statistics</h2>
            <StatsTabs onStatsChange={setCurrentStats} onPeriodChange={setPeriod} />
          </section>

          {/* Analytics */}
          <section style={{ marginBottom: "2.5rem" }}>
            <h2 className="section-title">Analytics</h2>
            <AnalyticsTabs period={period} currentStats={currentStats} history={history} />
          </section>
        </div>
      )}
    </div>
  );
}
