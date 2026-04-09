#!/bin/bash
# Captures a usage snapshot to DuckDB.
# Usage: ./scripts/snapshot-usage.sh [session_pct] [weekly_pct] [sonnet_pct] [session_reset_min] [weekly_reset_min]
#
# Example: ./scripts/snapshot-usage.sh 97 59 17 181 841
# Or without args to just record a timestamp marker.

DB="$(dirname "$0")/../data/sessions.duckdb"
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
SESSION_PCT="${1:-null}"
WEEKLY_PCT="${2:-null}"
SONNET_PCT="${3:-null}"
SESSION_RESET="${4:-null}"
WEEKLY_RESET="${5:-null}"

duckdb "$DB" <<SQL
INSERT INTO usage_snapshots (captured_at, session_id, current_session_pct, weekly_all_pct, weekly_sonnet_pct, session_reset_minutes, weekly_reset_minutes)
VALUES (now(), '${SESSION_ID}', ${SESSION_PCT}, ${WEEKLY_PCT}, ${SONNET_PCT}, ${SESSION_RESET}, ${WEEKLY_RESET});
SQL
