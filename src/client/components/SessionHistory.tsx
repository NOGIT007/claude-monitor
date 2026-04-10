import { useState, useEffect, useMemo } from "react";
import type { SessionHistoryEntry } from "../types";
import { formatNumber, formatCost, formatElapsed, projectName } from "../format";

interface Props {
  period: "today" | "week" | "month";
}

type SortKey = "date" | "project" | "model" | "duration" | "cost";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

function modelLabel(model: string): string {
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model;
}

function modelColor(model: string): string {
  if (model.includes("opus")) return "var(--ctp-mauve)";
  if (model.includes("sonnet")) return "var(--ctp-green)";
  if (model.includes("haiku")) return "var(--ctp-peach)";
  return "var(--ctp-text)";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function effortLabel(effort: string | undefined): string {
  if (!effort) return "—";
  return effort;
}

function effortColor(effort: string | undefined): string {
  if (!effort) return "var(--ctp-overlay0)";
  if (effort === "high") return "var(--ctp-red)";
  if (effort === "medium") return "var(--ctp-yellow)";
  return "var(--ctp-green)";
}

function sortSessions(
  sessions: SessionHistoryEntry[],
  key: SortKey,
  dir: SortDir,
): SessionHistoryEntry[] {
  const sorted = [...sessions];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "date":
        cmp = a.startedAt.localeCompare(b.startedAt);
        break;
      case "project":
        cmp = projectName(a.projectPath).localeCompare(projectName(b.projectPath));
        break;
      case "model":
        cmp = modelLabel(a.model).localeCompare(modelLabel(b.model));
        break;
      case "duration":
        cmp = a.durationMs - b.durationMs;
        break;
      case "cost":
        cmp = a.costUsd - b.costUsd;
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export function SessionHistory({ period }: Props) {
  const [sessions, setSessions] = useState<SessionHistoryEntry[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch(`/api/stats/session-history?period=${period}`)
      .then((r) => r.json())
      .then((data: SessionHistoryEntry[]) => {
        setSessions(data);
        setPage(0);
      })
      .catch(() => setSessions([]));
  }, [period]);

  const sorted = useMemo(
    () => sortSessions(sessions, sortKey, sortDir),
    [sessions, sortKey, sortDir],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
    setPage(0);
  }

  if (sessions.length === 0) {
    return (
      <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
        No sessions found for this period.
      </p>
    );
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const headerBase: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    fontSize: "0.65rem",
    fontWeight: 600,
    color: "var(--ctp-overlay1)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  };

  const sortableProps = (key: SortKey) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-sort": sortKey === key ? (sortDir === "asc" ? "ascending" as const : "descending" as const) : undefined,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSort(key);
      }
    },
  });

  const headerLeft: React.CSSProperties = { ...headerBase, textAlign: "left" };
  const headerRight: React.CSSProperties = { ...headerBase, textAlign: "right" };

  const cellStyle: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    fontSize: "0.75rem",
    fontFamily: "var(--font-mono)",
    color: "var(--ctp-text)",
    textAlign: "right",
    whiteSpace: "nowrap",
    borderTop: "1px solid rgba(69, 71, 90, 0.2)",
  };

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: disabled ? "transparent" : "rgba(69, 71, 90, 0.3)",
    color: disabled ? "var(--ctp-overlay0)" : "var(--ctp-text)",
    border: "1px solid rgba(69, 71, 90, 0.3)",
    borderRadius: 6,
    padding: "0.3rem 0.7rem",
    fontSize: "0.7rem",
    fontFamily: "var(--font-mono)",
    cursor: disabled ? "default" : "pointer",
  });

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headerLeft} onClick={() => toggleSort("date")} {...sortableProps("date")}>
                Date{arrow("date")}
              </th>
              <th style={headerLeft} onClick={() => toggleSort("project")} {...sortableProps("project")}>
                Project{arrow("project")}
              </th>
              <th style={headerLeft} onClick={() => toggleSort("model")} {...sortableProps("model")}>
                Model{arrow("model")}
              </th>
              <th style={headerLeft}>Effort</th>
              <th style={headerRight} onClick={() => toggleSort("duration")} {...sortableProps("duration")}>
                Duration{arrow("duration")}
              </th>
              <th style={headerRight}>Input</th>
              <th style={headerRight}>Output</th>
              <th style={headerRight}>Cache R</th>
              <th style={headerRight}>Cache W</th>
              <th style={headerRight} onClick={() => toggleSort("cost")} {...sortableProps("cost")}>
                Cost{arrow("cost")}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((s) => (
              <tr
                key={s.sessionId}
                className="session-row"
              >
                <td style={{ ...cellStyle, textAlign: "left", color: "var(--ctp-subtext1)" }}>
                  <span>{formatDate(s.startedAt)}</span>{" "}
                  <span style={{ color: "var(--ctp-overlay0)" }}>
                    {formatTime(s.startedAt)}
                  </span>
                </td>
                <td
                  style={{
                    ...cellStyle,
                    textAlign: "left",
                    color: "var(--ctp-lavender)",
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={s.projectPath}
                >
                  {projectName(s.projectPath)}
                </td>
                <td style={{ ...cellStyle, textAlign: "left" }}>
                  <span
                    style={{
                      background: `color-mix(in srgb, ${modelColor(s.model)} 15%, transparent)`,
                      color: modelColor(s.model),
                      padding: "0.15rem 0.5rem",
                      borderRadius: 10,
                      fontSize: "0.65rem",
                      fontWeight: 600,
                    }}
                  >
                    {modelLabel(s.model)}
                  </span>
                </td>
                <td style={{ ...cellStyle, textAlign: "left" }}>
                  <span
                    style={{
                      color: effortColor(s.effort),
                      fontSize: "0.7rem",
                      fontWeight: 500,
                    }}
                  >
                    {effortLabel(s.effort)}
                  </span>
                </td>
                <td style={cellStyle}>{formatElapsed(s.durationMs)}</td>
                <td style={cellStyle}>{formatNumber(s.input)}</td>
                <td style={cellStyle}>{formatNumber(s.output)}</td>
                <td style={cellStyle}>{formatNumber(s.cacheRead)}</td>
                <td style={cellStyle}>{formatNumber(s.cacheWrite)}</td>
                <td
                  style={{
                    ...cellStyle,
                    color: "var(--ctp-green)",
                    fontWeight: 600,
                  }}
                >
                  {formatCost(s.costUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "0.75rem",
          padding: "0 0.25rem",
        }}
      >
        <span
          style={{
            fontSize: "0.7rem",
            fontFamily: "var(--font-mono)",
            color: "var(--ctp-overlay0)",
          }}
        >
          {sorted.length} sessions · page {page + 1} of {totalPages}
        </span>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button
            style={btnStyle(page === 0)}
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <button
            style={btnStyle(page >= totalPages - 1)}
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
