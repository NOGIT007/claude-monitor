# Claude Monitor

Real-time dashboard for tracking Claude Code usage, costs, and session activity. Built with Bun, React, and SQLite.

## Features

- **Live Sessions** — Real-time view of all running Claude Code instances with CLI/Desktop icons
- **Rate Limits** — Session and weekly usage percentage tracking with color-coded bars
- **Session History** — Per-session metadata table with model, effort level, tokens, cost, pagination and sorting
- **Usage Statistics** — Today/week/month breakdowns with period comparison badges
- **Cost per Project** — Top 5 projects + aggregated "Other" bar chart
- **Model Breakdown** — Token distribution across Opus, Sonnet, and Haiku
- **Cost Trend** — Daily and cumulative cost charts
- **Peak Hours** — Hourly usage heatmap
- **Token History** — Daily token breakdown (input, output, cache read, cache write)
- **OTEL Collector** — Built-in OTLP/HTTP endpoint for ingesting OpenTelemetry metrics, events, and traces

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

## Enable OpenTelemetry

Add to `~/.claude/settings.json` under `"env"`:

```json
{
  "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
  "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA": "1",
  "OTEL_METRICS_EXPORTER": "otlp",
  "OTEL_LOGS_EXPORTER": "otlp",
  "OTEL_TRACES_EXPORTER": "otlp",
  "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
  "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
  "OTEL_METRIC_EXPORT_INTERVAL": "30000",
  "OTEL_LOG_TOOL_DETAILS": "1"
}
```

Restart Claude Code sessions after adding these. The built-in collector on port 4318 will capture all telemetry.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Frontend**: React 19 + Recharts
- **Database**: SQLite (WAL mode)
- **Telemetry**: OpenTelemetry OTLP/HTTP

## License

MIT
