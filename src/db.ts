import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id   TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  model        TEXT NOT NULL,
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
  cost_usd               REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_usage_session   ON token_usage(session_id);
`;

export function initDb(dbPath = "./data/monitor.db"): Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

export function upsertSession(
  db: Database,
  sessionId: string,
  projectPath: string,
  model: string,
  timestamp: string,
): void {
  db.run(
    `INSERT INTO sessions (session_id, project_path, model, started_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       project_path = excluded.project_path,
       model        = excluded.model,
       last_seen_at = excluded.last_seen_at`,
    [sessionId, projectPath, model, timestamp, timestamp],
  );
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
): void {
  db.run(
    `INSERT INTO token_usage (session_id, timestamp, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, timestamp, input, output, cacheCreate, cacheRead, costUsd],
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
): ActiveSession[] {
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
       WHERE s.last_seen_at >= datetime('now', '-' || ? || ' minutes')
       GROUP BY s.session_id
       ORDER BY s.last_seen_at DESC`,
    )
    .all(withinMinutes) as ActiveSession[];
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
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
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
         CAST(strftime('%H', t.timestamp) AS INTEGER) AS hour,
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
