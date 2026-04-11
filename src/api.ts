import type { Database } from "bun:sqlite";
import {
  getActiveSessions,
  getStats,
  getHistory,
  getProjectStats,
  getModelStats,
  getPeakHours,
  getPeakHoursByPeriod,
  getSessionsSummary,
  getComparison,
  getActivityHeatmap,
  getCostHistory,
  getCumulativeCost,
  getSessionHistory,
  getUsageSnapshots,
  getThinkingDepth,
  getRateLimitTimeline,
  getStopoutEvents,
  getSessionBurnRates,
  getRateLimitStats,
  getSessionTrace,
  getToolStats,
  getToolTimeline,
  getPromptStats,
} from "./db";

type StatsPeriod = "today" | "week" | "month";

const VALID_PERIODS = new Set<string>(["today", "week", "month"]);

function parsePeriod(url: URL): StatsPeriod | null {
  const p = url.searchParams.get("period") || "today";
  return VALID_PERIODS.has(p) ? (p as StatsPeriod) : null;
}

function parseDays(url: URL): number | null {
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 30;
  return isNaN(days) || days <= 0 || days > 365 ? null : days;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface ApiOptions {
  sessionsDir?: string;
}

export function handleApiRequest(req: Request, db: Database, options?: ApiOptions): Response | null {
  const url = new URL(req.url);
  const { pathname } = url;

  if (req.method !== "GET") {
    return null;
  }

  if (pathname === "/api/sessions") {
    const sessions = getActiveSessions(db, 30, options?.sessionsDir).map((s) => ({
      sessionId: s.session_id,
      projectPath: s.project_path,
      model: s.model,
      entrypoint: s.entrypoint,
      elapsedMs: Date.now() - new Date(s.started_at).getTime(),
      totals: {
        input: s.total_input,
        output: s.total_output,
        cacheRead: s.total_cache_read,
        cacheWrite: s.total_cache_creation,
        costUsd: s.total_cost,
      },
    }));
    return json(sessions);
  }

  if (pathname === "/api/stats/projects") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getProjectStats(db, period));
  }

  if (pathname === "/api/stats/models") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getModelStats(db, period));
  }

  if (pathname === "/api/stats/peak-hours") {
    const periodParam = url.searchParams.get("period");
    if (periodParam) {
      if (!VALID_PERIODS.has(periodParam)) return json({ error: "Invalid period" }, 400);
      return json(getPeakHoursByPeriod(db, periodParam as StatsPeriod));
    }
    const days = parseDays(url);
    if (!days) return json({ error: "Invalid days parameter" }, 400);
    return json(getPeakHours(db, days));
  }

  if (pathname === "/api/stats/sessions-summary") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getSessionsSummary(db, period));
  }

  if (pathname === "/api/stats/session-history") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    const rows = getSessionHistory(db, period);
    return json(
      rows.map((s) => ({
        sessionId: s.session_id,
        projectPath: s.project_path,
        model: s.model,
        effort: s.effort || undefined,
        startedAt: s.started_at,
        durationMs: s.duration_ms,
        input: s.total_input,
        output: s.total_output,
        cacheRead: s.total_cache_read,
        cacheWrite: s.total_cache_creation,
        costUsd: s.total_cost,
      })),
    );
  }

  if (pathname === "/api/stats/comparison") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getComparison(db, period));
  }

  if (pathname === "/api/stats/thinking-depth") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getThinkingDepth(db, period));
  }

  if (pathname === "/api/stats/activity-heatmap") {
    const weeks = parseInt(url.searchParams.get("weeks") || "52", 10);
    if (isNaN(weeks) || weeks <= 0 || weeks > 104) return json({ error: "Invalid weeks (1-104)" }, 400);
    return json(getActivityHeatmap(db, weeks));
  }

  if (pathname === "/api/stats/rate-limits") {
    const hours = Math.min(parseInt(url.searchParams.get("hours") || "24", 10) || 24, 720);
    const threshold = Math.min(parseInt(url.searchParams.get("threshold") || "80", 10) || 80, 100);
    return json({
      stats: getRateLimitStats(db),
      timeline: getRateLimitTimeline(db, hours),
      stopouts: getStopoutEvents(db, threshold),
      burnRates: getSessionBurnRates(db),
    });
  }

  // Session trace drill-down
  const traceMatch = pathname.match(/^\/api\/traces\/session\/(.+)$/);
  if (traceMatch) {
    const sessionId = decodeURIComponent(traceMatch[1]);
    return json(getSessionTrace(db, sessionId));
  }

  if (pathname === "/api/stats/tools") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getToolStats(db, period));
  }

  if (pathname === "/api/stats/tools/timeline") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getToolTimeline(db, period));
  }

  if (pathname === "/api/stats/prompts") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getPromptStats(db, period));
  }

  if (pathname.startsWith("/api/stats/")) {
    const period = pathname.slice("/api/stats/".length);
    if (!VALID_PERIODS.has(period)) {
      return json({ error: `Invalid period: ${period}` }, 400);
    }
    return json(getStats(db, period as StatsPeriod));
  }

  if (pathname === "/api/usage-snapshots") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 500);
    return json(getUsageSnapshots(db, limit));
  }

  if (pathname === "/api/history/cost") {
    const days = parseDays(url);
    if (!days) return json({ error: "Invalid days parameter" }, 400);
    return json(getCostHistory(db, days));
  }

  if (pathname === "/api/history/cumulative") {
    const days = parseDays(url);
    if (!days) return json({ error: "Invalid days parameter" }, 400);
    return json(getCumulativeCost(db, days));
  }

  if (pathname === "/api/history") {
    const daysParam = url.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;
    if (isNaN(days) || days <= 0) {
      return json({ error: "Invalid days parameter" }, 400);
    }
    return json(getHistory(db, days));
  }

  return null;
}
