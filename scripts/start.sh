#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
PID_FILE="$HOME/.claude-monitor.pid"

# Stop existing instance if running
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping existing Claude Monitor (PID: $OLD_PID)..."
    kill "$OLD_PID"
    # Wait for clean shutdown (up to 5s)
    for i in $(seq 1 50); do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.1
    done
    # Force kill if still alive
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
    echo "Stopped."
  fi
  rm -f "$PID_FILE"
fi

# Start the server
if [[ -x "$SCRIPT_DIR/claude-monitor" ]]; then
  PORT="$PORT" "$SCRIPT_DIR/claude-monitor" &
else
  PORT="$PORT" bun run "$SCRIPT_DIR/src/server.ts" &
fi

PID=$!
echo "$PID" > "$PID_FILE"
echo "Claude Monitor started on http://localhost:$PORT (PID: $PID)"

# Open browser on macOS
if command -v open &>/dev/null; then
  open "http://localhost:$PORT"
fi
