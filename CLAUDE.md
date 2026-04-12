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
bun run export           # Export static snapshot HTML (server must be running)
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

## Dev Workflow

When working on this project, use the Monitor tool to stream server errors in real-time:

```
# Start server in background, then monitor its output for errors
kill $(lsof -ti :4500) 2>/dev/null
PORT=4500 bun run src/server.ts 2>&1 | grep --line-buffered -iE "error|exception|fail|warn|panic" 
```

- Always run the server on port 4500 (not default 3000)
- After code changes, restart the server and re-attach the monitor
- Use `Monitor` (persistent, streaming) for log tailing — not `Bash run_in_background`

## Code Style

- TypeScript strict mode, ESNext target
- No build toolchain — Bun handles bundling, testing, and compilation
- React 19 with recharts for charts
- Tests colocated with source (`*.test.ts`)
