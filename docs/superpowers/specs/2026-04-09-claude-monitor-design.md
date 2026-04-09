# Claude Monitor — Design Spec

**Date:** 2026-04-09  
**Status:** Approved

---

## Overview

A local web dashboard that monitors Claude Code sessions in real-time and provides historical token usage analytics (daily, weekly, monthly). Built with Bun's full-stack executable feature so it ships as a single binary — no Node, no install, just `./claude-monitor`.

---

## Goals

- Live view of every active Claude Code session: session ID, project path, elapsed time, model, and per-turn token breakdown (input / output / cache-read / cache-write)
- Aggregated statistics by day / week / month stored persistently in SQLite
- Single executable: `bun build --compile` bundles server + React UI into one binary
- `bun run dev` for development with HMR
- Catppuccin Mocha theme throughout
- Graceful start/stop via PID file management

---

## Non-Goals

- Remote/multi-machine monitoring
- Claude API key management
- Alerting / notifications
- Multi-user support

---

## Data Sources

| Source | What it provides |
|--------|-----------------|
| `~/.claude/projects/**/*.jsonl` | Per-message token data written by Claude Code as sessions run. Each assistant message contains a `usage` object with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. |
| `~/.claude/stats-cache.json` | Pre-aggregated daily message/session/tool counts from Claude Code itself. Used to seed historical data. |

### JSONL entry shape (relevant fields)

```json
{
  "type": "attachment",
  "sessionId": "c8c3e586-...",
  "timestamp": "2026-04-09T16:09:23.451Z",
  "cwd": "/Users/me/code/myproject",
  "message": {
    "model": "claude-sonnet-4-6",
    "usage": {
      "input_tokens": 3,
      "cache_creation_input_tokens": 21092,
      "cache_read_input_tokens": 0,
      "output_tokens": 285
    }
  }
}
```

---

## Architecture

```
~/.claude/projects/**/*.jsonl
         │
         ▼
   src/watcher.ts          (fs.watch — tails new JSONL lines by byte offset)
         │
         ▼
   src/ingest.ts           (parse usage fields, calculate cost, upsert to SQLite)
         │
         ▼
   src/db.ts               (bun:sqlite schema + query helpers)
         │
    ┌────┴─────┐
    ▼          ▼
 src/ws.ts   src/api.ts    (WebSocket live push + REST for history queries)
    └────┬─────┘
         ▼
  src/index.html + src/client/  (React app, auto-bundled by Bun)
         │
         ▼
  bun build --compile → ./claude-monitor  (single binary, macOS arm64)
```

---

## File Structure

```
claude-monitoring/
├── src/
│   ├── server.ts          # Bun.serve entry — routes, WebSocket, imports index.html
│   ├── watcher.ts         # fs.watch on ~/.claude/projects/, byte-offset tailing
│   ├── ingest.ts          # JSONL parser → SQLite upserts
│   ├── db.ts              # bun:sqlite schema, migrations, query helpers
│   ├── api.ts             # REST handlers: /api/sessions, /api/stats/:period
│   ├── ws.ts              # WebSocket handler, broadcasts live session diffs
│   ├── pricing.ts         # Model pricing constants, cost calculation
│   ├── index.html         # Shell HTML (imports client/main.tsx)
│   └── client/
│       ├── main.tsx        # React root
│       ├── App.tsx         # Layout: LiveSessions + StatsTabs
│       ├── components/
│       │   ├── LiveSessions.tsx   # Polling WS, renders session cards
│       │   ├── SessionCard.tsx    # Single session: ID, project, time, token grid
│       │   ├── StatsTabs.tsx      # Today/Week/Month tab switcher
│       │   ├── SummaryCards.tsx   # Total tokens, cost, cache savings
│       │   ├── TokenChart.tsx     # Bar chart (Recharts)
│       │   └── BreakdownChart.tsx # Progress bars for input/cache/output
│       └── theme.css       # Catppuccin Mocha CSS variables
├── scripts/
│   ├── start.sh            # Wrapper: starts binary, writes PID, opens browser
│   └── stop.sh             # Reads PID file, kills process
├── package.json            # bun scripts: dev, build, start, stop
└── data/
    └── monitor.db          # SQLite database (gitignored)
```

---

## Database Schema (bun:sqlite)

```sql
-- Active and historical sessions
CREATE TABLE sessions (
  session_id   TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  model        TEXT NOT NULL,
  started_at   TEXT NOT NULL,   -- ISO timestamp of first message
  last_seen_at TEXT NOT NULL    -- ISO timestamp of most recent message
);

-- One row per assistant message turn
CREATE TABLE token_usage (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id             TEXT NOT NULL REFERENCES sessions(session_id),
  timestamp              TEXT NOT NULL,
  input_tokens           INTEGER NOT NULL DEFAULT 0,
  output_tokens          INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens      INTEGER NOT NULL DEFAULT 0,
  cost_usd               REAL NOT NULL DEFAULT 0
);

-- Indexes for period aggregation queries
CREATE INDEX idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX idx_token_usage_session   ON token_usage(session_id);
```

---

## Pricing Constants (pricing.ts)

Sonnet 4.6 per million tokens:

| Type | Price |
|------|-------|
| Input | $3.00 |
| Output | $15.00 |
| Cache write | $3.75 |
| Cache read | $0.30 |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | All sessions active in last 30 min |
| `GET` | `/api/stats/today` | Aggregated totals for today |
| `GET` | `/api/stats/week` | Aggregated totals for current week |
| `GET` | `/api/stats/month` | Aggregated totals for current month |
| `GET` | `/api/history?days=30` | Daily breakdown for chart |
| `WS`  | `/ws` | Live session diffs pushed on every JSONL update |

---

## WebSocket Protocol

Server pushes JSON messages on JSONL file changes:

```json
{
  "type": "session_update",
  "sessionId": "c8c3e586-...",
  "projectPath": "/Users/me/code/myproject",
  "model": "claude-sonnet-4-6",
  "elapsedMs": 2520000,
  "totals": {
    "input": 42103,
    "output": 8421,
    "cacheRead": 180234,
    "cacheWrite": 21092,
    "costUsd": 0.24
  }
}
```

---

## Start/Stop UX

### Dev mode
```bash
bun run dev        # starts server.ts with HMR, opens http://localhost:3000
```

### Build
```bash
bun run build      # bun build --compile ./src/server.ts --outfile ./claude-monitor
```

### Run (compiled binary)
```bash
./claude-monitor           # starts server + opens browser
./claude-monitor --port 4000   # custom port
```

### Convenience scripts
```bash
bun run start      # runs ./scripts/start.sh (starts binary, writes PID, opens browser)
bun run stop       # runs ./scripts/stop.sh  (reads PID, kills process)
```

`start.sh` writes the PID to `~/.claude-monitor.pid`. `stop.sh` reads and kills it.

---

## UI Sections (Catppuccin Mocha)

1. **Top bar** — app name, active session count, tech badge
2. **Live Sessions** — one `SessionCard` per active session (last-seen < 10 min), auto-updates via WebSocket
3. **Usage Summary** — Today / Week / Month tabs, three summary cards (total tokens, estimated cost, cache savings)
4. **Daily Chart** — bar chart of token usage last 7 or 30 days
5. **Token Breakdown** — horizontal progress bars: input / cache-read / output / cache-write

> Frontend implemented with the **frontend-design** skill for production-grade Catppuccin Mocha polish.

---

## Implementation Notes

- **Byte-offset tailing**: watcher tracks the last read position per file, so re-reading on `fs.watch` events never produces duplicates
- **Session detection**: a session is "live" if `last_seen_at` is within the last 10 minutes
- **Historical seed**: on first start, ingest reads `~/.claude/stats-cache.json` to populate daily totals from before the monitor existed
- **No external deps for charts**: Recharts (React-based) — no D3 complexity needed at this scale
- **bun:sqlite is built-in**: works with `bun build --compile`, zero native addon issues

---

## Verification

1. `bun run dev` — dashboard loads at localhost:3000, HMR works on file save
2. Start a Claude Code session in another terminal; session card appears within 2 seconds
3. Token counts increment as Claude responds
4. Navigate Today/Week/Month tabs — numbers match manual counts from JSONL files
5. `bun run build` — produces `./claude-monitor` binary
6. `./claude-monitor` — server starts, browser opens, sessions visible
7. `bun run stop` — process killed cleanly via PID file
