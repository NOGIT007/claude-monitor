import type { Database } from "bun:sqlite";
import {
  getActiveSessions,
  getStats,
  getHistory,
  getProjectStats,
  getModelStats,
  getPeakHours,
  getSessionsSummary,
  getComparison,
  getCostHistory,
  getCumulativeCost,
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
  return isNaN(days) || days <= 0 ? null : days;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function handleApiRequest(req: Request, db: Database): Response | null {
  const url = new URL(req.url);
  const { pathname } = url;

  if (req.method !== "GET") {
    return null;
  }

  if (pathname === "/api/sessions") {
    const sessions = getActiveSessions(db).map((s) => ({
      sessionId: s.session_id,
      projectPath: s.project_path,
      model: s.model,
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
    const days = parseDays(url);
    if (!days) return json({ error: "Invalid days parameter" }, 400);
    return json(getPeakHours(db, days));
  }

  if (pathname === "/api/stats/sessions-summary") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getSessionsSummary(db, period));
  }

  if (pathname === "/api/stats/comparison") {
    const period = parsePeriod(url);
    if (!period) return json({ error: "Invalid period" }, 400);
    return json(getComparison(db, period));
  }

  if (pathname.startsWith("/api/stats/")) {
    const period = pathname.slice("/api/stats/".length);
    if (!VALID_PERIODS.has(period)) {
      return json({ error: `Invalid period: ${period}` }, 400);
    }
    return json(getStats(db, period as StatsPeriod));
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
