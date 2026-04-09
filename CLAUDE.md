# Claude Monitor

Real-time dashboard for monitoring Claude Code token usage and costs.
Bun + React + SQLite. No frameworks — vanilla Bun.serve with in-memory React bundling.

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Hot-reload dev server (port 3000)
bun run build            # Compile to standalone binary ./claude-monitor
bun run start            # Start via scripts/start.sh (auto-restarts if already running)
bun run stop             # Stop background server
bun test                 # Run all tests
bun test src/db.test.ts  # Run single test file
```

## Architecture

- `src/server.ts` — Bun.serve entry point, builds React client bundle at startup
- `src/watcher.ts` — FSWatcher on `~/.claude/projects/**/*.jsonl` for live ingestion
- `src/ingest.ts` — Parses JSONL lines into session/token records
- `src/db.ts` — SQLite schema, queries, stats aggregation (bun:sqlite)
- `src/api.ts` — REST endpoints (`/api/stats`, `/api/sessions`, etc.)
- `src/ws.ts` — WebSocket for live dashboard updates
- `src/otel-collector.ts` — OpenTelemetry span ingestion
- `src/pricing.ts` — Model pricing calculations
- `src/client/` — React dashboard (App.tsx, components/, theme.css)
- `scripts/` — start/stop, backfill utilities

## Key Details

- Data stored in `./data/monitor.db` (SQLite WAL mode)
- Watches `~/.claude/projects/` for JSONL session logs
- Live sessions detected via `~/.claude/sessions/*.json`
- PID file at `~/.claude-monitor.pid`
- PORT env var controls server port (default 3000)
- `start.sh` auto-kills existing instance before starting — never bails

## Code Style

- TypeScript strict mode, ESNext target
- No build toolchain — Bun handles bundling, testing, and compilation
- React 19 with recharts for charts
- Tests colocated with source (`*.test.ts`)
