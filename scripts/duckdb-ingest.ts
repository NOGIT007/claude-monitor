#!/usr/bin/env bun
/**
 * Ingests Claude Code session data into DuckDB.
 * Reads from ~/.claude/usage-data/ and ~/.claude/stats-cache.json
 *
 * Usage: bun run scripts/duckdb-ingest.ts
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const CLAUDE_DIR = join(homedir(), ".claude");
const DATA_DIR = resolve(import.meta.dir, "../data");
const DB_PATH = join(DATA_DIR, "sessions.duckdb");
const NDJSON_PATH = join(DATA_DIR, "sessions.ndjson");
const STATS_NDJSON_PATH = join(DATA_DIR, "daily_activity.ndjson");
const MODEL_NDJSON_PATH = join(DATA_DIR, "daily_model_tokens.ndjson");

mkdirSync(DATA_DIR, { recursive: true });

// Step 1: Convert session-meta JSON files to NDJSON
console.log("📦 Reading session-meta files...");
const sessionMetaDir = join(CLAUDE_DIR, "usage-data", "session-meta");
const files = readdirSync(sessionMetaDir).filter((f) => f.endsWith(".json"));

let validCount = 0;
let errorCount = 0;
const ndjsonLines: string[] = [];

for (const file of files) {
  try {
    const raw = readFileSync(join(sessionMetaDir, file), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.session_id) {
      // Flatten tool_counts to a total
      const toolCounts = parsed.tool_counts ?? {};
      const totalToolCalls = Object.values(toolCounts).reduce(
        (a: number, b: any) => a + (b as number),
        0,
      );

      // Get primary language
      const languages = parsed.languages ?? {};
      const primaryLang =
        Object.entries(languages).sort(
          ([, a]: any, [, b]: any) => b - a,
        )[0]?.[0] ?? "";

      ndjsonLines.push(
        JSON.stringify({
          session_id: parsed.session_id,
          project_path: parsed.project_path ?? "",
          started_at: parsed.start_time ?? "",
          duration_minutes: parsed.duration_minutes ?? 0,
          user_message_count: parsed.user_message_count ?? 0,
          assistant_message_count: parsed.assistant_message_count ?? 0,
          input_tokens: parsed.input_tokens ?? 0,
          output_tokens: parsed.output_tokens ?? 0,
          total_tokens:
            (parsed.input_tokens ?? 0) + (parsed.output_tokens ?? 0),
          lines_added: parsed.lines_added ?? 0,
          lines_removed: parsed.lines_removed ?? 0,
          files_modified: parsed.files_modified ?? 0,
          git_commits: parsed.git_commits ?? 0,
          git_pushes: parsed.git_pushes ?? 0,
          tool_calls: totalToolCalls,
          tool_errors: parsed.tool_errors ?? 0,
          uses_task_agent: parsed.uses_task_agent ?? false,
          uses_mcp: parsed.uses_mcp ?? false,
          uses_web_search: parsed.uses_web_search ?? false,
          primary_language: primaryLang,
          first_prompt: (parsed.first_prompt ?? "").slice(0, 200),
        }),
      );
      validCount++;
    }
  } catch {
    errorCount++;
  }
}

writeFileSync(NDJSON_PATH, ndjsonLines.join("\n") + "\n");
console.log(`  ✅ ${validCount} sessions (${errorCount} skipped)`);

// Step 2: Extract daily activity from stats-cache
console.log("📦 Reading stats-cache...");
try {
  const statsRaw = readFileSync(
    join(CLAUDE_DIR, "stats-cache.json"),
    "utf-8",
  );
  const stats = JSON.parse(statsRaw);

  // Daily activity
  const dailyLines = (stats.dailyActivity ?? []).map((d: any) =>
    JSON.stringify({
      date: d.date,
      message_count: d.messageCount ?? 0,
      session_count: d.sessionCount ?? 0,
      tool_call_count: d.toolCallCount ?? 0,
    }),
  );
  writeFileSync(STATS_NDJSON_PATH, dailyLines.join("\n") + "\n");
  console.log(`  ✅ ${dailyLines.length} daily activity records`);

  // Daily model tokens
  const modelLines = (stats.dailyModelTokens ?? []).map((d: any) => {
    const t = d.tokensByModel ?? {};
    return JSON.stringify({
      date: d.date,
      opus_tokens: t["claude-opus-4-6"] ?? 0,
      sonnet_tokens: t["claude-sonnet-4-6"] ?? 0,
      haiku_tokens: t["claude-haiku-4-5-20251001"] ?? 0,
      opus_legacy_tokens: t["claude-opus-4-5-20251101"] ?? 0,
      total_tokens:
        (t["claude-opus-4-6"] ?? 0) +
        (t["claude-sonnet-4-6"] ?? 0) +
        (t["claude-haiku-4-5-20251001"] ?? 0) +
        (t["claude-opus-4-5-20251101"] ?? 0),
    });
  });
  writeFileSync(MODEL_NDJSON_PATH, modelLines.join("\n") + "\n");
  console.log(`  ✅ ${modelLines.length} daily model token records`);
} catch (e) {
  console.error("  ⚠️  Could not read stats-cache.json:", e);
}

// Step 3: Create DuckDB database
console.log("🦆 Building DuckDB database...");

const sql = `
-- Sessions
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions AS
SELECT
  *,
  CASE WHEN duration_minutes > 0
    THEN round(output_tokens::DOUBLE / duration_minutes, 1)
    ELSE 0 END AS tokens_per_minute,
  started_at::DATE AS session_date,
  extract('hour' FROM started_at::TIMESTAMPTZ) AS session_hour,
  extract('dow' FROM started_at::TIMESTAMPTZ) AS day_of_week
FROM read_json('${NDJSON_PATH}', format='newline_delimited', ignore_errors=true);

-- Daily activity
DROP TABLE IF EXISTS daily_activity;
CREATE TABLE daily_activity AS
SELECT * FROM read_json('${STATS_NDJSON_PATH}', format='newline_delimited', ignore_errors=true);

-- Daily model tokens
DROP TABLE IF EXISTS daily_model_tokens;
CREATE TABLE daily_model_tokens AS
SELECT
  *,
  round(100.0 * opus_tokens / nullif(total_tokens, 0), 1) AS opus_pct,
  round(100.0 * sonnet_tokens / nullif(total_tokens, 0), 1) AS sonnet_pct,
  round(100.0 * haiku_tokens / nullif(total_tokens, 0), 1) AS haiku_pct
FROM read_json('${MODEL_NDJSON_PATH}', format='newline_delimited', ignore_errors=true);

-- Usage snapshots (for tracking rate limit percentages)
CREATE TABLE IF NOT EXISTS usage_snapshots (
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id TEXT,
  current_session_pct DOUBLE,
  weekly_all_pct DOUBLE,
  weekly_sonnet_pct DOUBLE,
  session_reset_minutes INTEGER,
  weekly_reset_minutes INTEGER
);

-- Views
CREATE OR REPLACE VIEW v_session_summary AS
SELECT
  session_date AS date,
  count(*) AS sessions,
  sum(user_message_count) AS messages,
  sum(input_tokens) AS total_input,
  sum(output_tokens) AS total_output,
  sum(total_tokens) AS total_tokens,
  sum(lines_added) AS lines_added,
  sum(lines_removed) AS lines_removed,
  round(avg(duration_minutes), 1) AS avg_duration_min,
  round(avg(tokens_per_minute), 1) AS avg_tokens_per_min
FROM sessions
GROUP BY session_date
ORDER BY session_date DESC;

CREATE OR REPLACE VIEW v_weekly_rollup AS
SELECT
  date_trunc('week', session_date)::DATE AS week_start,
  count(*) AS sessions,
  sum(user_message_count) AS messages,
  sum(total_tokens) AS total_tokens,
  sum(lines_added) AS lines_added,
  round(avg(duration_minutes), 1) AS avg_duration_min
FROM sessions
GROUP BY week_start
ORDER BY week_start DESC;

CREATE OR REPLACE VIEW v_project_breakdown AS
SELECT
  project_path,
  count(*) AS sessions,
  sum(total_tokens) AS total_tokens,
  sum(lines_added) AS lines_added,
  sum(lines_removed) AS lines_removed,
  round(avg(duration_minutes), 1) AS avg_duration_min,
  max(started_at) AS last_used
FROM sessions
GROUP BY project_path
ORDER BY sessions DESC;

CREATE OR REPLACE VIEW v_hourly_pattern AS
SELECT
  session_hour AS hour,
  count(*) AS sessions,
  sum(total_tokens) AS total_tokens,
  round(avg(duration_minutes), 1) AS avg_duration_min
FROM sessions
GROUP BY session_hour
ORDER BY session_hour;

CREATE OR REPLACE VIEW v_daily_model_mix AS
SELECT * FROM daily_model_tokens ORDER BY date DESC;
`;

try {
  execSync(`duckdb "${DB_PATH}" <<'ENDSQL'\n${sql}\nENDSQL`, {
    shell: "/bin/bash",
    stdio: "inherit",
  });
} catch {
  // Try writing SQL to a temp file instead
  const tmpSql = join(DATA_DIR, "_ingest.sql");
  writeFileSync(tmpSql, sql);
  execSync(`duckdb "${DB_PATH}" < "${tmpSql}"`, {
    shell: "/bin/bash",
    stdio: "inherit",
  });
}

console.log("\n🦆 DuckDB database ready at:", DB_PATH);

// Quick summary
const summary = execSync(
  `duckdb "${DB_PATH}" -c "SELECT count(*) AS sessions, min(session_date) AS first, max(session_date) AS last, sum(total_tokens) AS tokens FROM sessions;"`,
  { encoding: "utf-8" },
);
console.log(summary);
