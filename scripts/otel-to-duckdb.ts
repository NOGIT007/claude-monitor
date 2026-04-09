#!/usr/bin/env bun
/**
 * Ingests OTEL NDJSON files (events, metrics, traces) into DuckDB.
 * Run after collecting telemetry: bun run scripts/otel-to-duckdb.ts
 */

import { existsSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";

const DATA_DIR = resolve(import.meta.dir, "../data");
const DB_PATH = join(DATA_DIR, "sessions.duckdb");
const EVENTS_PATH = join(DATA_DIR, "otel_events.ndjson");
const METRICS_PATH = join(DATA_DIR, "otel_metrics.ndjson");
const TRACES_PATH = join(DATA_DIR, "otel_traces.ndjson");

function run(sql: string) {
  try {
    execSync(`duckdb "${DB_PATH}" -c "${sql.replace(/"/g, '\\"')}"`, {
      shell: "/bin/bash",
      stdio: "inherit",
    });
  } catch {
    // ignore errors for missing files
  }
}

console.log("🔭 Ingesting OTEL data into DuckDB...");

// Events (API requests, tool results, user prompts)
if (existsSync(EVENTS_PATH)) {
  const sql = `
    DROP TABLE IF EXISTS otel_events;
    CREATE TABLE otel_events AS
    SELECT * FROM read_json('${EVENTS_PATH}', format='newline_delimited', ignore_errors=true, union_by_name=true);
  `;
  const tmpSql = join(DATA_DIR, "_otel_events.sql");
  Bun.write(tmpSql, sql);
  execSync(`duckdb "${DB_PATH}" < "${tmpSql}"`, { shell: "/bin/bash", stdio: "inherit" });
  const count = execSync(`duckdb "${DB_PATH}" -c "SELECT count(*) FROM otel_events;"`, { encoding: "utf-8" });
  console.log(`  ✅ Events: ${count.trim().split("\n").pop()?.trim()}`);
}

// Metrics (tokens, cost, sessions)
if (existsSync(METRICS_PATH)) {
  const sql = `
    DROP TABLE IF EXISTS otel_metrics;
    CREATE TABLE otel_metrics AS
    SELECT * FROM read_json('${METRICS_PATH}', format='newline_delimited', ignore_errors=true, union_by_name=true);
  `;
  const tmpSql = join(DATA_DIR, "_otel_metrics.sql");
  Bun.write(tmpSql, sql);
  execSync(`duckdb "${DB_PATH}" < "${tmpSql}"`, { shell: "/bin/bash", stdio: "inherit" });
  const count = execSync(`duckdb "${DB_PATH}" -c "SELECT count(*) FROM otel_metrics;"`, { encoding: "utf-8" });
  console.log(`  ✅ Metrics: ${count.trim().split("\n").pop()?.trim()}`);
}

// Traces (spans)
if (existsSync(TRACES_PATH)) {
  const sql = `
    DROP TABLE IF EXISTS otel_traces;
    CREATE TABLE otel_traces AS
    SELECT * FROM read_json('${TRACES_PATH}', format='newline_delimited', ignore_errors=true, union_by_name=true);
  `;
  const tmpSql = join(DATA_DIR, "_otel_traces.sql");
  Bun.write(tmpSql, sql);
  execSync(`duckdb "${DB_PATH}" < "${tmpSql}"`, { shell: "/bin/bash", stdio: "inherit" });
  const count = execSync(`duckdb "${DB_PATH}" -c "SELECT count(*) FROM otel_traces;"`, { encoding: "utf-8" });
  console.log(`  ✅ Traces: ${count.trim().split("\n").pop()?.trim()}`);
}

// Create useful views
const viewsSql = `
-- API request events with cost and duration
CREATE OR REPLACE VIEW v_otel_api_requests AS
SELECT
  timestamp,
  "session.id" AS session_id,
  model,
  cost_usd::DOUBLE AS cost_usd,
  duration_ms::INTEGER AS duration_ms,
  input_tokens::INTEGER AS input_tokens,
  output_tokens::INTEGER AS output_tokens,
  cache_read_tokens::INTEGER AS cache_read_tokens,
  cache_creation_tokens::INTEGER AS cache_creation_tokens,
  speed
FROM otel_events
WHERE event = 'api_request';

-- Tool usage events
CREATE OR REPLACE VIEW v_otel_tool_usage AS
SELECT
  timestamp,
  "session.id" AS session_id,
  tool_name,
  success,
  duration_ms::INTEGER AS duration_ms,
  decision_type,
  decision_source
FROM otel_events
WHERE event = 'tool_result';

-- Cost per session from OTEL
CREATE OR REPLACE VIEW v_otel_session_cost AS
SELECT
  "session.id" AS session_id,
  count(*) AS api_calls,
  sum(cost_usd::DOUBLE) AS total_cost,
  sum(input_tokens::INTEGER) AS total_input,
  sum(output_tokens::INTEGER) AS total_output,
  sum(cache_read_tokens::INTEGER) AS total_cache_read,
  min(timestamp) AS first_request,
  max(timestamp) AS last_request
FROM otel_events
WHERE event = 'api_request'
GROUP BY "session.id";

-- Token metrics time series
CREATE OR REPLACE VIEW v_otel_token_series AS
SELECT
  timestamp,
  metric,
  value,
  type,
  model,
  "session.id" AS session_id
FROM otel_metrics
WHERE metric LIKE 'claude_code.token%' OR metric LIKE 'claude_code.cost%';
`;
const tmpViewsSql = join(DATA_DIR, "_otel_views.sql");
Bun.write(tmpViewsSql, viewsSql);
try {
  execSync(`duckdb "${DB_PATH}" < "${tmpViewsSql}"`, { shell: "/bin/bash", stdio: "inherit" });
  console.log("  ✅ Views created");
} catch {
  console.log("  ⚠️  Some views skipped (tables may be empty)");
}

console.log("\n🦆 OTEL data ingested into", DB_PATH);
