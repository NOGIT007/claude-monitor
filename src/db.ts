import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id   TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  model        TEXT NOT NULL,
  effort       TEXT NOT NULL DEFAULT '',
  started_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS token_usage (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id             TEXT NOT NULL REFERENCES sessions(session_id),
  timestamp              TEXT NOT NULL,
  input_tokens           INTEGER NOT NULL DEFAULT 0,
  output_tokens          INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens      INTEGER NOT NULL DEFAULT 0,
  cost_usd               REAL NOT NULL DEFAULT 0,
  thinking_turns         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_usage_session   ON token_usage(session_id);

CREATE TABLE IF NOT EXISTS otel_spans (
  span_id        TEXT PRIMARY KEY,
  trace_id       TEXT NOT NULL,
  parent_span_id TEXT NOT NULL DEFAULT '',
  session_id     TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  kind           INTEGER NOT NULL DEFAULT 0,
  start_time     TEXT NOT NULL,
  end_time       TEXT NOT NULL DEFAULT '',
  duration_ms    REAL NOT NULL DEFAULT 0,
  status         INTEGER NOT NULL DEFAULT 0,
  attributes     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_otel_spans_session   ON otel_spans(session_id);
CREATE INDEX IF NOT EXISTS idx_otel_spans_trace     ON otel_spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_otel_spans_time      ON otel_spans(start_time);

CREATE TABLE IF NOT EXISTS otel_tool_calls (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  span_id        TEXT NOT NULL,
  session_id     TEXT NOT NULL DEFAULT '',
  tool_name      TEXT NOT NULL,
  timestamp      TEXT NOT NULL,
  duration_ms    REAL NOT NULL DEFAULT 0,
  input_summary  TEXT NOT NULL DEFAULT '',
  output_summary TEXT NOT NULL DEFAULT '',
  status         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_otel_tools_session ON otel_tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_otel_tools_name    ON otel_tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_otel_tools_time    ON otel_tool_calls(timestamp);

CREATE TABLE IF NOT EXISTS otel_prompts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  span_id        TEXT NOT NULL,
  session_id     TEXT NOT NULL DEFAULT '',
  timestamp      TEXT NOT NULL,
  prompt_text    TEXT NOT NULL DEFAULT '',
  token_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_otel_prompts_session ON otel_prompts(session_id);
CREATE INDEX IF NOT EXISTS idx_otel_prompts_time    ON otel_prompts(timestamp);
`;

export function initDb(dbPath = join(import.meta.dir, "../data/monitor.db")): Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  // Migration: add effort column if missing
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN effort TEXT NOT NULL DEFAULT ''");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("duplicate column")) {
      console.error("[db] Migration error:", msg);
    }
  }
  // Migration: add thinking_turns column if missing
  try {
    db.exec("ALTER TABLE token_usage ADD COLUMN thinking_turns INTEGER NOT NULL DEFAULT 0");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("duplicate column")) {
      console.error("[db] Migration error:", msg);
    }
  }
  return db;
}

export function upsertSession(
  db: Database,
  sessionId: string,
  projectPath: string,
  model: string,
  timestamp: string,
  effort?: string,
): void {
  const effortVal = effort || getCurrentEffort();
  db.run(
    `INSERT INTO sessions (session_id, project_path, model, effort, started_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       project_path = excluded.project_path,
       model        = excluded.model,
       effort       = CASE WHEN excluded.effort != '' THEN excluded.effort ELSE sessions.effort END,
       last_seen_at = excluded.last_seen_at`,
    [sessionId, projectPath, model, effortVal, timestamp, timestamp],
  );
}

function getCurrentEffort(): string {
  try {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    const raw = readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    return settings.effortLevel || "";
  } catch {
    return "";
  }
}

export function insertTokenUsage(
  db: Database,
  sessionId: string,
  timestamp: string,
  input: number,
  output: number,
  cacheCreate: number,
  cacheRead: number,
  costUsd: number,
  thinkingTurns = 0,
): void {
  db.run(
    `INSERT INTO token_usage (session_id, timestamp, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd, thinking_turns)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, timestamp, input, output, cacheCreate, cacheRead, costUsd, thinkingTurns],
  );
}

export interface ActiveSession {
  session_id: string;
  project_path: string;
  model: string;
  started_at: string;
  last_seen_at: string;
  total_input: number;
  total_output: number;
  total_cache_read: number;
  total_cache_creation: number;
  total_cost: number;
}

export function getSessionsByIds(
  db: Database,
  sessionIds: string[],
): ActiveSession[] {
  if (sessionIds.length === 0) return [];
  const placeholders = sessionIds.map(() => "?").join(",");
  return db
    .query(
      `SELECT
         s.session_id,
         s.project_path,
         s.model,
         s.started_at,
         s.last_seen_at,
         COALESCE(SUM(t.input_tokens), 0)          AS total_input,
         COALESCE(SUM(t.output_tokens), 0)         AS total_output,
         COALESCE(SUM(t.cache_read_tokens), 0)     AS total_cache_read,
         COALESCE(SUM(t.cache_creation_tokens), 0) AS total_cache_creation,
         COALESCE(SUM(t.cost_usd), 0)              AS total_cost
       FROM sessions s
       LEFT JOIN token_usage t ON t.session_id = s.session_id
       WHERE s.session_id IN (${placeholders})
       GROUP BY s.session_id`,
    )
    .all(...sessionIds) as ActiveSession[];
}

export function getActiveSessions(
  db: Database,
  withinMinutes = 30,
  sessionsDir?: string,
): (ActiveSession & { entrypoint: string })[] {
  // Use ~/.claude/sessions/ to find truly live sessions
  const liveMetas = getLiveSessionMeta(sessionsDir);

  if (liveMetas.length === 0) {
    // Fallback to time-based if no session files found
    const rows = db
      .query(
        `SELECT
           s.session_id,
           s.project_path,
           s.model,
           s.started_at,
           s.last_seen_at,
           COALESCE(SUM(t.input_tokens), 0)          AS total_input,
           COALESCE(SUM(t.output_tokens), 0)         AS total_output,
           COALESCE(SUM(t.cache_read_tokens), 0)     AS total_cache_read,
           COALESCE(SUM(t.cache_creation_tokens), 0) AS total_cache_creation,
           COALESCE(SUM(t.cost_usd), 0)              AS total_cost
         FROM sessions s
         LEFT JOIN token_usage t ON t.session_id = s.session_id
         WHERE s.last_seen_at >= datetime('now', '-' || ? || ' minutes')
         GROUP BY s.session_id
         ORDER BY s.last_seen_at DESC`,
      )
      .all(withinMinutes) as ActiveSession[];
    return rows.map((r) => ({ ...r, entrypoint: "cli" }));
  }

  const entrypointMap = new Map(liveMetas.map((m) => [m.sessionId, m.entrypoint]));
  const ids = liveMetas.map((m) => m.sessionId);
  const sessions = getSessionsByIds(db, ids);
  return sessions.map((s) => ({
    ...s,
    entrypoint: entrypointMap.get(s.session_id) ?? "cli",
  }));
}

export interface LiveSessionMeta {
  sessionId: string;
  entrypoint: string;
}

function getLiveSessionMeta(overrideDir?: string): LiveSessionMeta[] {
  const sessionsDir = overrideDir ?? join(homedir(), ".claude", "sessions");
  try {
    const files = readdirSync(sessionsDir);
    const metas: LiveSessionMeta[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = readFileSync(join(sessionsDir, file), "utf-8");
        const data = JSON.parse(raw);
        if (data.sessionId) {
          metas.push({
            sessionId: data.sessionId,
            entrypoint: data.entrypoint ?? "cli",
          });
        }
      } catch {
        // skip unreadable
      }
    }
    return metas;
  } catch {
    return [];
  }
}

export interface PeriodStats {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  sessionCount: number;
}

export function getCutoff(period: "today" | "week" | "month"): string {
  const now = new Date();
  if (period === "today") {
    // Use local date, convert to start-of-day in UTC properly
    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return localMidnight.toISOString();
  }
  if (period === "week") return new Date(now.getTime() - 7 * 86400000).toISOString();
  return new Date(now.getTime() - 30 * 86400000).toISOString();
}

export function getPreviousCutoff(period: "today" | "week" | "month"): string {
  const now = new Date();
  if (period === "today") {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return yesterday.toISOString();
  }
  if (period === "week") return new Date(now.getTime() - 14 * 86400000).toISOString();
  return new Date(now.getTime() - 60 * 86400000).toISOString();
}

export function getStats(
  db: Database,
  period: "today" | "week" | "month",
): PeriodStats {
  const cutoff = getCutoff(period);

  const row = db
    .query(
      `SELECT
         COALESCE(SUM(t.input_tokens), 0)          AS totalInput,
         COALESCE(SUM(t.output_tokens), 0)         AS totalOutput,
         COALESCE(SUM(t.cache_read_tokens), 0)     AS totalCacheRead,
         COALESCE(SUM(t.cache_creation_tokens), 0) AS totalCacheWrite,
         COALESCE(SUM(t.cost_usd), 0)              AS totalCost,
         COUNT(DISTINCT t.session_id)               AS sessionCount
       FROM token_usage t
       WHERE t.timestamp >= ?`,
    )
    .get(cutoff) as PeriodStats;

  return row;
}

export interface ProjectStats {
  projectPath: string;
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
}

export function getProjectStats(
  db: Database,
  period: "today" | "week" | "month",
): ProjectStats[] {
  const cutoff = getCutoff(period);
  return db
    .query(
      `SELECT
         s.project_path AS projectPath,
         COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS totalTokens,
         COALESCE(SUM(t.cost_usd), 0) AS totalCost,
         COUNT(DISTINCT t.session_id) AS sessionCount
       FROM token_usage t
       JOIN sessions s ON s.session_id = t.session_id
       WHERE t.timestamp >= ?
       GROUP BY s.project_path
       ORDER BY totalCost DESC`,
    )
    .all(cutoff) as ProjectStats[];
}

export interface ModelStats {
  model: string;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
}

export function getModelStats(
  db: Database,
  period: "today" | "week" | "month",
): ModelStats[] {
  const cutoff = getCutoff(period);
  return db
    .query(
      `SELECT
         s.model,
         COALESCE(SUM(t.input_tokens), 0) AS totalInput,
         COALESCE(SUM(t.output_tokens), 0) AS totalOutput,
         COALESCE(SUM(t.cache_read_tokens), 0) AS totalCacheRead,
         COALESCE(SUM(t.cache_creation_tokens), 0) AS totalCacheWrite,
         COALESCE(SUM(t.cost_usd), 0) AS totalCost
       FROM token_usage t
       JOIN sessions s ON s.session_id = t.session_id
       WHERE t.timestamp >= ?
       GROUP BY s.model
       ORDER BY totalCost DESC`,
    )
    .all(cutoff) as ModelStats[];
}

export interface HourStats {
  hour: number;
  totalTokens: number;
  totalCost: number;
}

export function getPeakHours(db: Database, days: number): HourStats[] {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return db
    .query(
      `SELECT
         CAST(strftime('%H', t.timestamp, 'localtime') AS INTEGER) AS hour,
         COALESCE(SUM(t.input_tokens + t.output_tokens), 0) AS totalTokens,
         COALESCE(SUM(t.cost_usd), 0) AS totalCost
       FROM token_usage t
       WHERE t.timestamp >= ?
       GROUP BY hour
       ORDER BY hour`,
    )
    .all(cutoff) as HourStats[];
}

export function getPeakHoursByPeriod(
  db: Database,
  period: "today" | "week" | "month",
): HourStats[] {
  const cutoff = getCutoff(period);
  return db
    .query(
      `SELECT
         CAST(strftime('%H', t.timestamp, 'localtime') AS INTEGER) AS hour,
         COALESCE(SUM(t.input_tokens + t.output_tokens), 0) AS totalTokens,
         COALESCE(SUM(t.cost_usd), 0) AS totalCost
       FROM token_usage t
       WHERE t.timestamp >= ?
       GROUP BY hour
       ORDER BY hour`,
    )
    .all(cutoff) as HourStats[];
}

export interface SessionsSummary {
  totalSessions: number;
  avgDurationMs: number;
  longestDurationMs: number;
  avgCostPerSession: number;
}

export function getSessionsSummary(
  db: Database,
  period: "today" | "week" | "month",
): SessionsSummary {
  const cutoff = getCutoff(period);
  const row = db
    .query(
      `SELECT
         COUNT(*) AS totalSessions,
         COALESCE(AVG((julianday(s.last_seen_at) - julianday(s.started_at)) * 86400000), 0) AS avgDurationMs,
         COALESCE(MAX((julianday(s.last_seen_at) - julianday(s.started_at)) * 86400000), 0) AS longestDurationMs
       FROM sessions s
       WHERE s.started_at >= ?`,
    )
    .get(cutoff) as { totalSessions: number; avgDurationMs: number; longestDurationMs: number };

  const stats = getStats(db, period);
  const avgCostPerSession = stats.sessionCount > 0 ? stats.totalCost / stats.sessionCount : 0;

  return {
    totalSessions: row.totalSessions,
    avgDurationMs: row.avgDurationMs,
    longestDurationMs: row.longestDurationMs,
    avgCostPerSession,
  };
}

export interface Comparison {
  current: PeriodStats;
  previous: PeriodStats;
}

export function getComparison(
  db: Database,
  period: "today" | "week" | "month",
): Comparison {
  const current = getStats(db, period);

  const prevCutoff = getPreviousCutoff(period);
  const currCutoff = getCutoff(period);

  const previous = db
    .query(
      `SELECT
         COALESCE(SUM(t.input_tokens), 0)          AS totalInput,
         COALESCE(SUM(t.output_tokens), 0)         AS totalOutput,
         COALESCE(SUM(t.cache_read_tokens), 0)     AS totalCacheRead,
         COALESCE(SUM(t.cache_creation_tokens), 0) AS totalCacheWrite,
         COALESCE(SUM(t.cost_usd), 0)              AS totalCost,
         COUNT(DISTINCT t.session_id)               AS sessionCount
       FROM token_usage t
       WHERE t.timestamp >= ? AND t.timestamp < ?`,
    )
    .get(prevCutoff, currCutoff) as PeriodStats;

  return { current, previous };
}

export interface CostHistoryEntry {
  date: string;
  cost: number;
}

export function getCostHistory(db: Database, days: number): CostHistoryEntry[] {
  return db
    .query(
      `SELECT date(t.timestamp) AS date, COALESCE(SUM(t.cost_usd), 0) AS cost
       FROM token_usage t
       WHERE t.timestamp >= datetime('now', '-' || ? || ' days')
       GROUP BY date(t.timestamp)
       ORDER BY date ASC`,
    )
    .all(days) as CostHistoryEntry[];
}

export interface CumulativeCostEntry {
  date: string;
  dailyCost: number;
  cumulativeCost: number;
}

export function getCumulativeCost(db: Database, days: number): CumulativeCostEntry[] {
  const costHistory = getCostHistory(db, days);
  let cumulative = 0;
  return costHistory.map(entry => {
    cumulative += entry.cost;
    return { date: entry.date, dailyCost: entry.cost, cumulativeCost: cumulative };
  });
}

export interface DayEntry {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface SessionHistoryEntry {
  session_id: string;
  project_path: string;
  model: string;
  effort: string;
  started_at: string;
  last_seen_at: string;
  duration_ms: number;
  total_input: number;
  total_output: number;
  total_cache_read: number;
  total_cache_creation: number;
  total_cost: number;
}

export function getSessionHistory(
  db: Database,
  period: "today" | "week" | "month",
): SessionHistoryEntry[] {
  const cutoff = getCutoff(period);
  return db
    .query(
      `SELECT
         s.session_id,
         s.project_path,
         s.model,
         s.effort,
         s.started_at,
         s.last_seen_at,
         CAST((julianday(s.last_seen_at) - julianday(s.started_at)) * 86400000 AS INTEGER) AS duration_ms,
         COALESCE(SUM(t.input_tokens), 0)          AS total_input,
         COALESCE(SUM(t.output_tokens), 0)         AS total_output,
         COALESCE(SUM(t.cache_read_tokens), 0)     AS total_cache_read,
         COALESCE(SUM(t.cache_creation_tokens), 0) AS total_cache_creation,
         COALESCE(SUM(t.cost_usd), 0)              AS total_cost
       FROM sessions s
       LEFT JOIN token_usage t ON t.session_id = s.session_id
       WHERE s.started_at >= ? OR s.last_seen_at >= ?
       GROUP BY s.session_id
       ORDER BY s.started_at DESC`,
    )
    .all(cutoff, cutoff) as SessionHistoryEntry[];
}

export interface UsageSnapshot {
  captured_at: string;
  session_id: string;
  model: string;
  effort: string;
  context_pct: number | null;
  session_pct: number | null;
  weekly_pct: number | null;
}

export function getUsageSnapshots(db: Database, limit = 50): UsageSnapshot[] {
  // Create table if not exists (migration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_snapshots (
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      session_id TEXT,
      model TEXT,
      effort TEXT,
      context_pct REAL,
      session_pct REAL,
      weekly_pct REAL
    )
  `);
  return db
    .query(
      `SELECT * FROM usage_snapshots ORDER BY captured_at DESC LIMIT ?`,
    )
    .all(limit) as UsageSnapshot[];
}

/** Rate limit analytics — timeline of session_pct and weekly_pct snapshots */
export interface RateLimitTimelineEntry {
  captured_at: string;
  session_id: string;
  model: string;
  session_pct: number;
  weekly_pct: number;
}

export function getRateLimitTimeline(db: Database, hours = 24): RateLimitTimelineEntry[] {
  return db
    .query(
      `SELECT captured_at, session_id, model,
              COALESCE(session_pct, 0) AS session_pct,
              COALESCE(weekly_pct, 0) AS weekly_pct
       FROM usage_snapshots
       WHERE captured_at >= datetime('now', '-' || ? || ' hours')
       ORDER BY captured_at ASC`,
    )
    .all(hours) as RateLimitTimelineEntry[];
}

/** Detect stopouts: sessions where session_pct reached >= threshold */
export interface StopoutEvent {
  session_id: string;
  model: string;
  peak_session_pct: number;
  peak_weekly_pct: number;
  first_seen: string;
  last_seen: string;
  duration_min: number;
  snapshots: number;
}

export function getStopoutEvents(db: Database, threshold = 80): StopoutEvent[] {
  return db
    .query(
      `SELECT
         session_id,
         MAX(model) AS model,
         MAX(COALESCE(session_pct, 0)) AS peak_session_pct,
         MAX(COALESCE(weekly_pct, 0)) AS peak_weekly_pct,
         MIN(captured_at) AS first_seen,
         MAX(captured_at) AS last_seen,
         CAST((julianday(MAX(captured_at)) - julianday(MIN(captured_at))) * 1440 AS INTEGER) AS duration_min,
         COUNT(*) AS snapshots
       FROM usage_snapshots
       WHERE session_pct >= ?
       GROUP BY session_id
       ORDER BY first_seen DESC`,
    )
    .all(threshold) as StopoutEvent[];
}

/** Burn rate: how fast session_pct increased per session */
export interface SessionBurnRate {
  session_id: string;
  model: string;
  start_pct: number;
  end_pct: number;
  duration_min: number;
  burn_rate_per_min: number;
  first_seen: string;
}

export function getSessionBurnRates(db: Database): SessionBurnRate[] {
  return db
    .query(
      `WITH session_bounds AS (
         SELECT
           session_id,
           MAX(model) AS model,
           MIN(COALESCE(session_pct, 0)) AS start_pct,
           MAX(COALESCE(session_pct, 0)) AS end_pct,
           MIN(captured_at) AS first_seen,
           MAX(captured_at) AS last_seen,
           CAST((julianday(MAX(captured_at)) - julianday(MIN(captured_at))) * 1440 AS REAL) AS duration_min,
           COUNT(*) AS snapshots
         FROM usage_snapshots
         GROUP BY session_id
         HAVING snapshots >= 2 AND duration_min > 0
       )
       SELECT
         session_id,
         model,
         start_pct,
         end_pct,
         CAST(duration_min AS INTEGER) AS duration_min,
         ROUND((end_pct - start_pct) / duration_min, 2) AS burn_rate_per_min,
         first_seen
       FROM session_bounds
       WHERE end_pct > start_pct
       ORDER BY first_seen DESC`,
    )
    .all() as SessionBurnRate[];
}

/** Aggregate rate limit stats */
export interface RateLimitStats {
  totalSnapshots: number;
  totalSessions: number;
  stopoutSessions: number;
  avgPeakSessionPct: number;
  maxSessionPct: number;
  avgBurnRatePerMin: number;
  currentSessionPct: number | null;
  currentWeeklyPct: number | null;
}

export function getRateLimitStats(db: Database): RateLimitStats {
  const agg = db
    .query(
      `SELECT
         COUNT(*) AS totalSnapshots,
         COUNT(DISTINCT session_id) AS totalSessions,
         MAX(COALESCE(session_pct, 0)) AS maxSessionPct
       FROM usage_snapshots`,
    )
    .get() as { totalSnapshots: number; totalSessions: number; maxSessionPct: number };

  const stopouts = db
    .query(
      `SELECT COUNT(DISTINCT session_id) AS stopoutSessions
       FROM usage_snapshots WHERE session_pct >= 80`,
    )
    .get() as { stopoutSessions: number };

  const avgPeak = db
    .query(
      `SELECT ROUND(AVG(peak), 1) AS avgPeak FROM (
         SELECT session_id, MAX(COALESCE(session_pct, 0)) AS peak
         FROM usage_snapshots GROUP BY session_id
       )`,
    )
    .get() as { avgPeak: number };

  const burnRates = getSessionBurnRates(db);
  const avgBurn = burnRates.length > 0
    ? burnRates.reduce((s, b) => s + b.burn_rate_per_min, 0) / burnRates.length
    : 0;

  const latest = db
    .query(
      `SELECT session_pct, weekly_pct FROM usage_snapshots ORDER BY captured_at DESC LIMIT 1`,
    )
    .get() as { session_pct: number | null; weekly_pct: number | null } | null;

  return {
    totalSnapshots: agg.totalSnapshots,
    totalSessions: agg.totalSessions,
    stopoutSessions: stopouts.stopoutSessions,
    avgPeakSessionPct: avgPeak.avgPeak ?? 0,
    maxSessionPct: agg.maxSessionPct,
    avgBurnRatePerMin: Math.round(avgBurn * 100) / 100,
    currentSessionPct: latest?.session_pct ?? null,
    currentWeeklyPct: latest?.weekly_pct ?? null,
  };
}

export function getHistory(db: Database, days: number): DayEntry[] {
  return db
    .query(
      `SELECT
         date(t.timestamp)                          AS date,
         COALESCE(SUM(t.input_tokens), 0)          AS input,
         COALESCE(SUM(t.output_tokens), 0)         AS output,
         COALESCE(SUM(t.cache_read_tokens), 0)     AS cacheRead,
         COALESCE(SUM(t.cache_creation_tokens), 0) AS cacheWrite,
         COALESCE(SUM(t.cost_usd), 0)              AS cost
       FROM token_usage t
       WHERE t.timestamp >= datetime('now', '-' || ? || ' days')
       GROUP BY date(t.timestamp)
       ORDER BY date ASC`,
    )
    .all(days) as DayEntry[];
}

/** Matches client/types.ts ActivityDay — keep in sync */
export interface ActivityDay {
  date: string;
  count: number;
  cost: number;
}

export function getActivityHeatmap(db: Database, weeks: number): ActivityDay[] {
  const days = weeks * 7;
  return db
    .query(
      `SELECT date(t.timestamp) AS date, COUNT(*) AS count, COALESCE(SUM(t.cost_usd), 0) AS cost
       FROM token_usage t
       WHERE t.timestamp >= datetime('now', '-' || ? || ' days')
       GROUP BY date(t.timestamp)
       ORDER BY date ASC`,
    )
    .all(days) as ActivityDay[];
}

export interface ThinkingDepthEntry {
  date: string;
  totalMessages: number;
  thinkingMessages: number;
  thinkingRate: number;
  avgOutputTokens: number;
  avgOutputPerThinking: number;
}

export function getThinkingDepth(
  db: Database,
  period: "today" | "week" | "month",
): ThinkingDepthEntry[] {
  const cutoff = getCutoff(period);
  return db
    .query(
      `SELECT
         date(t.timestamp) AS date,
         COUNT(*)                                       AS totalMessages,
         SUM(CASE WHEN t.thinking_turns > 0 THEN 1 ELSE 0 END) AS thinkingMessages,
         CASE WHEN COUNT(*) > 0
           THEN ROUND(100.0 * SUM(CASE WHEN t.thinking_turns > 0 THEN 1 ELSE 0 END) / COUNT(*), 1)
           ELSE 0 END                                  AS thinkingRate,
         ROUND(AVG(t.output_tokens), 0)                AS avgOutputTokens,
         CASE WHEN SUM(CASE WHEN t.thinking_turns > 0 THEN 1 ELSE 0 END) > 0
           THEN ROUND(
             SUM(CASE WHEN t.thinking_turns > 0 THEN t.output_tokens ELSE 0 END) * 1.0
             / SUM(CASE WHEN t.thinking_turns > 0 THEN 1 ELSE 0 END), 0)
           ELSE 0 END                                  AS avgOutputPerThinking
       FROM token_usage t
       WHERE t.timestamp >= ?
       GROUP BY date(t.timestamp)
       ORDER BY date ASC`,
    )
    .all(cutoff) as ThinkingDepthEntry[];
}
