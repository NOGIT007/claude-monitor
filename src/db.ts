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

export function getStats(
  db: Database,
  period: "today" | "week" | "month",
): PeriodStats {
  const cutoff =
    period === "today"
      ? "datetime('now', 'start of day')"
      : period === "week"
        ? "datetime('now', '-7 days')"
        : "datetime('now', '-30 days')";

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
       WHERE t.timestamp >= ${cutoff}`,
    )
    .get() as PeriodStats;

  return row;
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
