#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
PID_FILE="$HOME/.claude-monitor.pid"

# Check if already running
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Claude Monitor is already running (PID: $(cat "$PID_FILE"))"
  exit 0
fi

# Start the server
if [[ -x "./claude-monitor" ]]; then
  PORT="$PORT" ./claude-monitor &
else
  PORT="$PORT" bun run src/server.ts &
fi

PID=$!
echo "$PID" > "$PID_FILE"
echo "Claude Monitor started on http://localhost:$PORT (PID: $PID)"

# Open browser on macOS
if command -v open &>/dev/null; then
  open "http://localhost:$PORT"
fi
