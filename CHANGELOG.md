# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-04-11

### Added
- **macOS menu bar app** (`ClaudeMonitorBar`) — native Swift/SwiftUI app that lives in the menu bar, shows live session count and token burn rate, with Start/Stop/Restart server controls and dashboard quick-open. Installs as `Claude Code Monitor.app`.
- **Tool Usage analytics tab** — tracks every tool Claude Code calls (Bash, Read, Write, Edit, Grep, Glob, Agent, etc.) with call counts, average duration, error rates, and a stacked area timeline.
- **Session drill-down** — click any session row in Workflow Intelligence → Session History to expand a merged timeline of prompts and tool calls with expandable input/output detail.
- **OTEL ingestion** — embedded OTLP/HTTP collector now stores tool calls and prompts in SQLite (`otel_tool_calls`, `otel_prompts` tables). Listens on both port 4500 (main server) and port 4318 (standard OTLP default) so Claude Code works without any configuration change.
- **"What is this?" explainer** on the Tool Usage tab — modal with setup instructions, chart descriptions, and tool name reference.
- `~/.claude-monitor.env` written on every server start — source it from `~/.zshrc` to enable persistent OTEL tracing across all terminals.

### Fixed
- Server now survives `start.sh` exit — uses `nohup` + `disown` so the process stays alive after the shell that launched it closes.
- macOS menu bar app `PATH` — explicitly includes `~/.bun/bin` and `/opt/homebrew/bin` so `bun` is found in GUI app environment.
- Restart, Open Dashboard, and Open in Browser buttons are disabled when the server is not running.
- App appears as "Claude Code Monitor" in Spotlight — bundle renamed from `ClaudeMonitorBar.app`.
- Tab switching layout bounce — all tab panels use `display` toggle with `minHeight: 400` instead of mount/unmount.
- OTEL tool calls now only captured from `claude_code.tool` root spans with explicit `tool_name` attribute — sub-spans (`tool.execution`, `tool.blocked_on_user`) are no longer counted as separate tool calls.
- OTEL env vars written to `~/.claude-monitor.env` so tracing persists across terminal sessions.

## [1.2.1] - 2026-04-10

### Fixed
- Analytics tabs no longer bounce/shift when switching — tab bar is sticky and panels use display toggle instead of mount/unmount
- Weekly limit rate bar now shows correct percentage instead of 0% when latest snapshot has no weekly data
- SQLite "database is locked" errors resolved with `PRAGMA busy_timeout = 5000`

### Added
- Dev workflow section in CLAUDE.md documenting Monitor tool usage and port 4500 convention

## [1.2.0] - 2026-04-10

### Added
- **Thinking Depth analytics tab** — tracks thinking block frequency, output tokens per message, and thinking-only output over time with daily breakdown table
- **Rate Limit analytics tab** — usage timeline chart (session 5h + weekly 7d), session burn rate chart, high usage sessions table, and time range selector (6h–7d)
- **Explainer modals** — "What is this?" button on both new tabs explaining metrics, how to read charts, and what patterns to watch for
- Backfill script (`scripts/backfill-thinking.ts`) to populate thinking data from existing JSONL files
- `thinking_turns` column on `token_usage` table with auto-migration
- Thinking block extraction in JSONL ingest pipeline
- Analytics tabs: Activity Heatmap, Sparkline, Token Distribution, AnalyticsTabs container
- ESLint and Prettier configuration

### Changed
- Analytics section reorganized into 5 tabs: Token Analytics, Workflow Intelligence, Productivity Analytics, Thinking Depth, Rate Limits
- Tab switching now scrolls to tab bar instead of jumping to page top
- Rate limit timeline chart X-axis thinned to ~12 readable labels with date+time for multi-day ranges
- Improved pricing model support and chart theming

### Fixed
- API route ordering: named `/api/stats/*` routes now registered before the catch-all period route

## [1.1.0] - 2026-04-10

### Removed
- DuckDB dependency and all related scripts (duckdb-ingest, duckdb-query, otel-to-duckdb, snapshot-usage)
- DuckDB references from README and package.json

### Added
- CLAUDE.md with project context for Claude Code

### Changed
- Simplified tech stack to SQLite-only (was SQLite + DuckDB)

## [0.1.0] - 2026-04-09

### Added
- Project scaffold with Bun, React 19, Recharts, bun:sqlite
- SQLite database layer with sessions and token_usage tables
- Model pricing constants for Sonnet, Opus, and Haiku
- JSONL parser and ingestion pipeline
- File watcher with byte-offset tailing for live session tracking
- WebSocket handler for real-time session updates
- REST API endpoints: sessions, stats (today/week/month), history
- Bun.serve entry point with static file serving and SPA fallback
- React dashboard with Catppuccin Mocha theme
- Live session cards with token breakdown and cost display
- Usage statistics with period tabs (Today/Week/Month)
- Token history bar chart and breakdown progress bars
- Start/stop convenience scripts with PID management
- Single binary compilation via `bun build --compile`
