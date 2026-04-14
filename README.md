# Claude Monitor

Real-time dashboard for tracking Claude Code usage, costs, and session activity. Built with Bun, React, and SQLite.

## Features

- **Overview Dashboard** — CodeBurn-inspired dense, multi-panel layout showing cost, tokens, sessions, cache hit, daily activity, projects, models, activity types, tools, and MCP servers — all visible at once
- **Live Sessions** — Real-time view of all running Claude Code instances with CLI/Desktop icons
- **Rate Limits** — Session and weekly usage percentage tracking with color-coded bars (60s auto-refresh)
- **Session History** — Per-session metadata table with model, effort level, tokens, cost; click any row for full tool call + prompt timeline
- **Usage Statistics** — Today/7 Days/30 Days breakdowns with period comparison badges
- **Cost per Project** — Projects ranked by cost with automatic subdirectory merging
- **Model Breakdown** — Token distribution across Opus, Sonnet, and Haiku
- **Activity Categories** — Tool calls grouped into Coding, Exploration, Testing, Planning, Git, and Delegation
- **Tool Usage** — Per-tool call counts, durations, error rates, and over-time charts powered by OTEL tracing
- **MCP Server Analytics** — Dedicated panel for MCP tool usage tracking
- **Thinking Depth** — Tracks extended thinking frequency and depth across sessions
- **macOS Menu Bar App** — Native Swift app (`Claude Code Monitor.app`) with live stats, server controls, and quick dashboard access
- **OTEL Collector** — Built-in OTLP/HTTP endpoint on ports 4500 and 4318 for ingesting Claude Code telemetry

## Quick Start

```bash
# Install dependencies
bun install

# Start the dashboard (port 4500)
PORT=4500 bun run dev

# Or use the start script (background process)
PORT=4500 bun run start
```

Open [http://localhost:4500](http://localhost:4500)

## How It Works

The monitor watches `~/.claude/projects/` for JSONL session logs written by Claude Code. Each API response with token usage is parsed, priced, and stored in SQLite. A WebSocket pushes live updates to the dashboard.

### Data Sources

| Source | What it provides |
|--------|-----------------|
| `~/.claude/projects/**/*.jsonl` | Per-request token usage, model, session ID |
| `~/.claude/sessions/*.json` | Live session PIDs and entrypoints (CLI vs Desktop) |
| `~/.claude/usage-data/session-meta/` | Historical session metadata |
| `~/.claude/stats-cache.json` | Daily activity and model token stats |
| Status line hook | Rate limit percentages (session/weekly) |
| OTEL collector (port 4318) | Metrics, events, and distributed traces |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start with hot reload |
| `bun run start` | Start as background process |
| `bun run stop` | Stop background process |
| `bun run build` | Compile to standalone binary |
| `bun run backfill` | Import historical data from JSONL logs |

## macOS Menu Bar App

Install the native menu bar app for quick access:

```bash
cd ClaudeMonitorBar
./build.sh
cp -r "build/Claude Code Monitor.app" /Applications/
open "/Applications/Claude Code Monitor.app"
```

The app shows live session count and token burn rate in the menu bar, with controls to start/stop/restart the server and open the dashboard.

## Enable Tool Usage Analytics (OTEL)

The monitor listens on port 4318 (standard OTLP default) — no endpoint config needed. Just enable tracing in your shell:

```bash
# Add to ~/.zshrc (the monitor writes this file on every start)
source ~/.claude-monitor.env
```

Or set manually:

```bash
export OTEL_LOG_TOOL_DETAILS=true       # required: per-tool call stats
export OTEL_LOG_TOOL_CONTENT=true       # optional: capture input/output
export OTEL_LOG_USER_PROMPTS=true       # optional: capture prompt text
```

Restart your terminal and run `claude` — the Tool Usage tab will populate with real tool call data.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Frontend**: React 19 + Recharts
- **Database**: SQLite (WAL mode)
- **Telemetry**: OpenTelemetry OTLP/HTTP

## License

MIT
