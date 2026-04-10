#!/bin/bash
# Hook script: captures rate limit percentages from Claude Code status line JSON
# into the SQLite monitor DB. Called by the status line command.
#
# Reads JSON from stdin (same input as statusline-command.sh).
# Runs silently in background to not block the status line.

DB="${CLAUDE_MONITOR_DB:-$HOME/code/claude-monitoring/data/monitor.db}"
[ ! -f "$DB" ] && exit 0

input=$(cat)

session_id=$(echo "$input" | jq -r '.session_id // empty')
rl_5h=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
rl_7d=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
model=$(echo "$input" | jq -r '.model.display_name // empty')
effort=$(echo "$input" | jq -r '.effort_level // empty')
context_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# Only save if we have rate limit data
[ -z "$rl_5h" ] && [ -z "$rl_7d" ] && exit 0

# Throttle: only save every 60s per session
LOCK="/tmp/claude-monitor-usage-${session_id:-none}.lock"
if [ -f "$LOCK" ]; then
  last=$(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK" 2>/dev/null || echo 0)
  now=$(date +%s)
  diff=$((now - last))
  [ "$diff" -lt 60 ] && exit 0
fi
touch "$LOCK"

# Sanitize inputs: strip any characters that could break SQL strings
sanitize() { printf '%s' "$1" | tr -d "'\"\\\n\r"; }

s_session_id=$(sanitize "$session_id")
s_model=$(sanitize "$model")
s_effort=$(sanitize "$effort")

# Use null for empty numeric values, sanitized strings for text
ctx_val="${context_pct:-null}"
s5h_val="${rl_5h:-null}"
s7d_val="${rl_7d:-null}"

sqlite3 "$DB" <<SQL
CREATE TABLE IF NOT EXISTS usage_snapshots (
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  session_id TEXT,
  model TEXT,
  effort TEXT,
  context_pct REAL,
  session_pct REAL,
  weekly_pct REAL
);
INSERT INTO usage_snapshots (session_id, model, effort, context_pct, session_pct, weekly_pct)
VALUES ('${s_session_id}', '${s_model}', '${s_effort}', ${ctx_val}, ${s5h_val}, ${s7d_val});
SQL
