#!/usr/bin/env bash
set -euo pipefail

PID_FILE="$HOME/.claude-monitor.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Claude Monitor is not running"
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  # Wait for clean shutdown (up to 5s)
  for i in $(seq 1 50); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.1
  done
  # Force kill if still alive
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
    echo "Claude Monitor force-killed (PID: $PID)"
  else
    echo "Claude Monitor stopped (PID: $PID)"
  fi
else
  echo "Claude Monitor process not found (stale PID file)"
fi

rm -f "$PID_FILE"
