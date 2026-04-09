import type { Database } from "bun:sqlite";
import { getActiveSessions, getStats, getHistory } from "./db";

type StatsPeriod = "today" | "week" | "month";

const VALID_PERIODS = new Set<string>(["today", "week", "month"]);

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

  if (pathname.startsWith("/api/stats/")) {
    const period = pathname.slice("/api/stats/".length);
    if (!VALID_PERIODS.has(period)) {
      return json({ error: `Invalid period: ${period}` }, 400);
    }
    return json(getStats(db, period as StatsPeriod));
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
