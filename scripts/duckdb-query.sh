#!/bin/bash
# Quick DuckDB query helper for Claude Code session data
# Usage: ./scripts/duckdb-query.sh [command]
#
# Commands:
#   today     - Today's session summary
#   week      - This week's summary
#   recent    - Last 10 sessions
#   projects  - Project breakdown
#   models    - Model usage breakdown
#   hours     - Hourly usage pattern
#   trend     - Daily token trend (last 14 days)
#   usage     - Recent usage snapshots (rate limits)
#   sql       - Open interactive DuckDB shell
#   <query>   - Run custom SQL

DB="$(dirname "$0")/../data/sessions.duckdb"

case "${1:-today}" in
  today)
    duckdb "$DB" <<'SQL'
SELECT '📊 Today' AS period;
SELECT * FROM v_session_summary WHERE date = current_date;
SELECT
  count(*) AS sessions,
  sum(user_message_count) AS messages,
  sum(total_tokens) AS tokens,
  sum(output_tokens) AS output_tokens,
  sum(lines_added) AS lines_added,
  round(avg(duration_minutes), 1) AS avg_min
FROM sessions
WHERE session_date = current_date;
SQL
    ;;
  week)
    duckdb "$DB" <<'SQL'
SELECT '📊 This Week' AS period;
SELECT * FROM v_session_summary WHERE date >= current_date - 7 ORDER BY date;
SQL
    ;;
  recent)
    duckdb "$DB" <<'SQL'
SELECT
  left(session_id::VARCHAR, 8) AS id,
  split_part(project_path, '/', -1) AS project,
  strftime(started_at::TIMESTAMPTZ, '%H:%M') AS time,
  duration_minutes AS mins,
  total_tokens AS tokens,
  output_tokens AS output,
  lines_added AS added,
  tokens_per_minute AS tok_min
FROM sessions
ORDER BY started_at DESC
LIMIT 10;
SQL
    ;;
  projects)
    duckdb "$DB" <<'SQL'
SELECT * FROM v_project_breakdown LIMIT 15;
SQL
    ;;
  models)
    duckdb "$DB" <<'SQL'
SELECT * FROM v_daily_model_mix LIMIT 14;
SQL
    ;;
  hours)
    duckdb "$DB" <<'SQL'
SELECT * FROM v_hourly_pattern;
SQL
    ;;
  trend)
    duckdb "$DB" <<'SQL'
SELECT
  date,
  message_count AS msgs,
  session_count AS sessions,
  tool_call_count AS tools
FROM daily_activity
WHERE date >= current_date - 14
ORDER BY date;
SQL
    ;;
  usage)
    duckdb "$DB" <<'SQL'
SELECT
  captured_at::TIME AS time,
  left(session_id::VARCHAR, 8) AS session,
  current_session_pct AS sess_pct,
  weekly_all_pct AS week_pct,
  weekly_sonnet_pct AS son_pct,
  session_reset_minutes AS reset_min
FROM v_usage_trend
LIMIT 20;
SQL
    ;;
  sql)
    duckdb "$DB"
    ;;
  *)
    duckdb "$DB" -c "$1"
    ;;
esac
