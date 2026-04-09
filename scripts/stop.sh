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
  echo "Claude Monitor stopped (PID: $PID)"
else
  echo "Claude Monitor process not found (stale PID file)"
fi

rm -f "$PID_FILE"
