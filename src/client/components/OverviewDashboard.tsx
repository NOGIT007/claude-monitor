import { useState, useEffect, useCallback } from "react";
import type {
  PeriodStats,
  DayEntry,
  ProjectStats,
  ModelStats,
  ToolStatsResult,
  Comparison,
} from "../types";
import { formatCost, formatCompact, projectName, normalizeProjectPath } from "../format";
import { HBar } from "./HBar";
import { RateLimits } from "./RateLimits";

type Period = "today" | "week" | "month";

const periods: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "7 Days" },
  { key: "month", label: "30 Days" },
];

interface Props {
  activeSessions: number;
  wsStatus: "connecting" | "connected" | "disconnected";
}

interface DashboardData {
  stats: PeriodStats | null;
  comparison: Comparison | null;
  history: DayEntry[];
  projects: ProjectStats[];
  models: ModelStats[];
  tools: ToolStatsResult | null;
}

const empty: DashboardData = {
  stats: null,
  comparison: null,
  history: [],
  projects: [],
  models: [],
  tools: null,
};

/** Merge projects by normalized path (strips generic subdirs like scripts/, src/) */
function mergeSubProjects(projects: ProjectStats[]): ProjectStats[] {
  const merged = new Map<string, ProjectStats>();

  for (const p of projects) {
    const key = normalizeProjectPath(p.projectPath);
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        projectPath: key,
        totalTokens: existing.totalTokens + p.totalTokens,
        totalCost: existing.totalCost + p.totalCost,
        sessionCount: existing.sessionCount + p.sessionCount,
      });
    } else {
      merged.set(key, { ...p, projectPath: key });
    }
  }

  return [...merged.values()].sort((a, b) => b.totalCost - a.totalCost);
}

export function OverviewDashboard({ activeSessions, wsStatus }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<DashboardData>(empty);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback((p: Period) => {
    setLoading(true);
    const days = p === "today" ? 1 : p === "week" ? 7 : 30;
    Promise.all([
      fetch(`/api/stats/${p}`).then((r) => r.json()),
      fetch(`/api/stats/comparison?period=${p}`).then((r) => r.json()),
      fetch(`/api/history?days=${days}`).then((r) => r.json()),
      fetch(`/api/stats/projects?period=${p}`).then((r) => r.json()),
      fetch(`/api/stats/models?period=${p}`).then((r) => r.json()),
      fetch(`/api/stats/tools?period=${p}`).then((r) => r.json()),
    ])
      .then(([stats, comparison, history, projects, models, tools]) => {
        setData({ stats, comparison, history, projects, models, tools });
      })
      .catch((err) => console.warn("[OverviewDashboard] fetch:", err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll(period);
  }, [period, fetchAll]);

  const s = data.stats;
  const totalTokens = s
    ? s.totalInput + s.totalOutput + s.totalCacheRead + s.totalCacheWrite
    : 0;
  const cacheHit = totalTokens > 0 && s ? (s.totalCacheRead / totalTokens) * 100 : 0;

  // Compute comparison delta
  const prev = data.comparison?.previous;
  const prevCost = prev?.totalCost ?? 0;
  const costDelta =
    prevCost > 0 && s ? ((s.totalCost - prevCost) / prevCost) * 100 : null;

  // Separate tools vs MCP servers
  const allTools = data.tools?.tools ?? [];
  const coreTools = allTools.filter((t) => !t.name.startsWith("mcp__"));
  const mcpTools = allTools.filter((t) => t.name.startsWith("mcp__"));

  // Merge child project paths into their parent (e.g. claude-monitoring/scripts → claude-monitoring)
  const mergedProjects = mergeSubProjects(data.projects);

  // Max values for bar scaling
  const maxDayCost = Math.max(...data.history.map((d) => d.cost), 0.01);
  const maxProjectCost = Math.max(...mergedProjects.map((p) => p.totalCost), 0.01);
  const maxModelCost = Math.max(
    ...data.models.map(
      (m) => m.totalCost
    ),
    0.01
  );
  const maxToolCount = Math.max(...coreTools.map((t) => t.count), 1);
  const maxMcpCount = Math.max(...mcpTools.map((t) => t.count), 1);

  return (
    <div className="overview-dashboard">
      {/* Header */}
      <header className="ov-header">
        <div className="ov-header-left">
          <h1 className="ov-title">Claude Monitor</h1>
          {activeSessions > 0 && (
            <span className="ov-active-badge">{activeSessions} active</span>
          )}
        </div>
        <div className="ov-header-right">
          <div className="ov-period-tabs">
            {periods.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`ov-period-btn ${period === key ? "ov-period-btn--active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span
            className="ov-ws-dot"
            style={{
              color:
                wsStatus === "connected"
                  ? "var(--ctp-green)"
                  : wsStatus === "connecting"
                  ? "var(--ctp-yellow)"
                  : "var(--ctp-red)",
            }}
            title={`WebSocket: ${wsStatus}`}
          >
            <span className="ov-dot" />
            {wsStatus === "disconnected" ? "reconnecting" : "live"}
          </span>
        </div>
      </header>

      {/* Overview stats bar */}
      <div className="ov-stats-bar">
        <div className="ov-stat-primary">
          <span className="ov-stat-value" style={{ color: "var(--ctp-peach)" }}>
            {s ? formatCost(s.totalCost) : "$0.00"}
          </span>
          {costDelta !== null && (
            <span
              className={`ov-stat-delta ${costDelta <= 0 ? "ov-stat-delta--good" : "ov-stat-delta--bad"}`}
            >
              {costDelta >= 0 ? "+" : ""}
              {costDelta.toFixed(1)}% vs prev
            </span>
          )}
        </div>
        <div className="ov-stat-group">
          <div className="ov-stat-item">
            <span className="ov-stat-label">tokens</span>
            <span className="ov-stat-num">{formatCompact(totalTokens)}</span>
          </div>
          <div className="ov-stat-item">
            <span className="ov-stat-label">sessions</span>
            <span className="ov-stat-num">{s?.sessionCount ?? 0}</span>
          </div>
          <div className="ov-stat-item">
            <span className="ov-stat-label">cache hit</span>
            <span className="ov-stat-num">{cacheHit.toFixed(0)}%</span>
          </div>
        </div>
        {s && (
          <div className="ov-token-breakdown">
            <span>
              <b style={{ color: "var(--ctp-blue)" }}>{formatCompact(s.totalInput)}</b> in
            </span>
            <span>
              <b style={{ color: "var(--ctp-green)" }}>{formatCompact(s.totalOutput)}</b> out
            </span>
            <span>
              <b style={{ color: "var(--ctp-mauve)" }}>{formatCompact(s.totalCacheRead)}</b>{" "}
              cached
            </span>
            <span>
              <b style={{ color: "var(--ctp-yellow)" }}>{formatCompact(s.totalCacheWrite)}</b>{" "}
              written
            </span>
          </div>
        )}
      </div>

      {/* Rate Limits */}
      <div className="card" style={{ marginBottom: "1.25rem", padding: "0.9rem 1rem" }}>
        <RateLimits pollInterval={60000} />
      </div>

      {loading && !s ? (
        <div style={{ padding: "2rem", color: "var(--ctp-subtext0)", textAlign: "center" }}>
          Loading...
        </div>
      ) : (
        <div className="ov-grid">
          {/* Daily Activity */}
          <Panel title="Daily Activity" accent="blue">
            {data.history.length === 0 ? (
              <EmptyPanel />
            ) : (
              data.history
                .slice(-14)
                .reverse()
                .map((d) => (
                  <div key={d.date} className="ov-row">
                    <span className="ov-row-label">
                      {new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <HBar value={d.cost / maxDayCost} width={90} height={8} />
                    <span className="ov-row-value">{formatCost(d.cost)}</span>
                    <span className="ov-row-sub">{formatCompact(d.input + d.output)}</span>
                  </div>
                ))
            )}
          </Panel>

          {/* By Project */}
          <Panel title="By Project" accent="green">
            {mergedProjects.length === 0 ? (
              <EmptyPanel />
            ) : (
              mergedProjects.slice(0, 10).map((p) => (
                <div key={p.projectPath} className="ov-row">
                  <span className="ov-row-label" title={p.projectPath}>
                    {projectName(p.projectPath)}
                  </span>
                  <HBar value={p.totalCost / maxProjectCost} width={70} height={8} />
                  <span className="ov-row-value">{formatCost(p.totalCost)}</span>
                  <span className="ov-row-sub">{p.sessionCount}s</span>
                </div>
              ))
            )}
          </Panel>

          {/* By Model */}
          <Panel title="By Model" accent="mauve">
            {data.models.length === 0 ? (
              <EmptyPanel />
            ) : (
              data.models.map((m) => {
                const modelTokens = m.totalInput + m.totalOutput + m.totalCacheRead + m.totalCacheWrite;
                return (
                  <div key={m.model} className="ov-row">
                    <span className="ov-row-label">{m.model}</span>
                    <HBar value={m.totalCost / maxModelCost} width={70} height={8} />
                    <span className="ov-row-value">{formatCost(m.totalCost)}</span>
                    <span className="ov-row-sub">{formatCompact(modelTokens)}</span>
                  </div>
                );
              })
            )}
          </Panel>

          {/* By Activity (tool categories) */}
          <Panel title="By Activity" accent="yellow">
            {coreTools.length === 0 && mcpTools.length === 0 ? (
              <EmptyPanel hint="Enable OTEL to see activity" />
            ) : (
              <ActivityBreakdown tools={coreTools} />
            )}
          </Panel>

          {/* Core Tools */}
          <Panel title="Core Tools" accent="teal">
            {coreTools.length === 0 ? (
              <EmptyPanel hint="Enable OTEL to see tools" />
            ) : (
              coreTools.slice(0, 12).map((t) => (
                <div key={t.name} className="ov-row">
                  <span className="ov-row-label">{t.name}</span>
                  <HBar value={t.count / maxToolCount} width={70} height={8} />
                  <span className="ov-row-value">{formatCompact(t.count)}</span>
                </div>
              ))
            )}
          </Panel>

          {/* MCP Servers */}
          <Panel title="MCP Servers" accent="pink">
            {mcpTools.length === 0 ? (
              <EmptyPanel hint="No MCP tool calls recorded" />
            ) : (
              mcpTools.slice(0, 10).map((t) => {
                // mcp__serverName__toolName → show serverName/toolName
                const parts = t.name.split("__");
                const display =
                  parts.length >= 3
                    ? `${parts[1]}/${parts.slice(2).join("_")}`
                    : t.name;
                return (
                  <div key={t.name} className="ov-row">
                    <span className="ov-row-label" title={t.name}>
                      {display}
                    </span>
                    <HBar value={t.count / maxMcpCount} width={70} height={8} />
                    <span className="ov-row-value">{formatCompact(t.count)}</span>
                  </div>
                );
              })
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────── */

function Panel({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`ov-panel card card--${accent}`}>
      <h3
        className="ov-panel-title"
        style={{ color: `var(--ctp-${accent})` }}
      >
        {title}
      </h3>
      <div className="ov-panel-body">{children}</div>
    </div>
  );
}

function EmptyPanel({ hint }: { hint?: string }) {
  return (
    <div className="ov-empty">
      {hint || "No data for this period"}
    </div>
  );
}

/** Group tools into activity categories like CodeBurn */
const ACTIVITY_CATEGORIES: Record<string, { label: string; tools: string[] }> = {
  coding: {
    label: "Coding",
    tools: ["Edit", "Write", "MultiEdit"],
  },
  exploration: {
    label: "Exploration",
    tools: ["Read", "Glob", "Grep", "LS"],
  },
  testing: {
    label: "Testing",
    tools: ["Bash"],
  },
  planning: {
    label: "Planning",
    tools: ["TodoWrite", "TodoRead", "Task", "TaskCreate", "TaskUpdate"],
  },
  git: {
    label: "Git",
    tools: ["GitDiff", "GitLog", "GitCommit"],
  },
  delegation: {
    label: "Delegation",
    tools: ["Agent", "Subagent"],
  },
};

function ActivityBreakdown({ tools }: { tools: { name: string; count: number; totalDurationMs: number }[] }) {
  const categories: { label: string; count: number; duration: number }[] = [];
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const claimed = new Set<string>();

  for (const [, cat] of Object.entries(ACTIVITY_CATEGORIES)) {
    let count = 0;
    let duration = 0;
    for (const toolName of cat.tools) {
      const t = toolMap.get(toolName);
      if (t) {
        count += t.count;
        duration += t.totalDurationMs;
        claimed.add(toolName);
      }
    }
    if (count > 0) {
      categories.push({ label: cat.label, count, duration });
    }
  }

  // "Other" bucket for unclaimed tools
  let otherCount = 0;
  let otherDuration = 0;
  for (const t of tools) {
    if (!claimed.has(t.name)) {
      otherCount += t.count;
      otherDuration += t.totalDurationMs;
    }
  }
  if (otherCount > 0) {
    categories.push({ label: "Other", count: otherCount, duration: otherDuration });
  }

  categories.sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...categories.map((c) => c.count), 1);

  return (
    <>
      {categories.map((c) => (
        <div key={c.label} className="ov-row">
          <span className="ov-row-label">{c.label}</span>
          <HBar value={c.count / maxCount} width={70} height={8} />
          <span className="ov-row-value">{formatCompact(c.count)}</span>
        </div>
      ))}
    </>
  );
}
