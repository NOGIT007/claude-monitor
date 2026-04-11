# OTEL Trace Integration Design

**Date:** 2026-04-11
**Status:** Approved

## Overview

Integrate Claude Code's improved OTEL tracing (`OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_TOOL_CONTENT`) into the claude-monitoring dashboard. This connects token/cost data with what Claude actually did — which tools it called, how long they took, what prompts were sent.

## Goals

1. **Tool usage analytics** — which tools are called most, duration, failure rates
2. **Session drill-down** — see conversation flow (prompts, tool calls, responses) per session
3. **Zero config** — `start.sh` auto-enables OTEL env vars; rich tracing works out of the box

## Data Model

### New SQLite Tables

#### `otel_spans`

Every OTEL span, linked to sessions.

| Column | Type | Notes |
|--------|------|-------|
| span_id | TEXT PK | OTEL span ID |
| trace_id | TEXT | Links spans in same trace |
| parent_span_id | TEXT | For building tree |
| session_id | TEXT | Extracted from span resource attributes, soft FK to sessions |
| name | TEXT | Span name (e.g. "tool_use", "interaction") |
| kind | INTEGER | OTEL span kind |
| start_time | TEXT | ISO timestamp |
| end_time | TEXT | ISO timestamp |
| duration_ms | REAL | Computed from start/end |
| status | INTEGER | 0=ok, 2=error |
| attributes | TEXT | JSON blob of all span attributes |

#### `otel_tool_calls`

Extracted from spans where name indicates tool use.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto |
| span_id | TEXT | FK to otel_spans |
| session_id | TEXT | Soft FK to sessions |
| tool_name | TEXT | e.g. "Bash", "Read", "Edit" |
| timestamp | TEXT | From span start_time |
| duration_ms | REAL | How long the tool ran |
| input_summary | TEXT | Truncated tool input (max 1000 chars) |
| output_summary | TEXT | Truncated tool output (max 1000 chars) |
| status | INTEGER | Success/error |

#### `otel_prompts`

Extracted from spans with user prompt data.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto |
| span_id | TEXT | FK to otel_spans |
| session_id | TEXT | Soft FK to sessions |
| timestamp | TEXT | |
| prompt_text | TEXT | From OTEL_LOG_USER_PROMPTS |
| token_count | INTEGER | If available in attributes |

**Indexes:** `session_id`, `trace_id`, `timestamp`, `tool_name` on all relevant tables.

### Session Linking

Claude Code spans include a `session_id` resource attribute. The collector extracts this as a soft FK (not enforced). OTEL data may arrive before JSONL ingestion — the link resolves once the watcher catches up.

## Collector Integration

### Changes to `otel-collector.ts`

- Remove standalone Bun.serve server
- Export route handler functions that accept the shared DB instance
- `processTraces()` becomes the main workhorse:
  - Writes every span to `otel_spans`
  - Detects tool-use spans by name/attributes → extracts into `otel_tool_calls`
  - Detects prompt spans → extracts into `otel_prompts`
  - Links to sessions via `session_id` resource attribute
- `processMetrics()` and `processLogs()` continue writing to NDJSON files (useful for debugging, not needed for dashboard)
- Truncation: `input_summary` and `output_summary` capped at 1000 chars

### Changes to `server.ts`

- Mount OTLP endpoints (`/v1/traces`, `/v1/metrics`, `/v1/logs`) alongside existing API routes
- One server, one port, one DB connection
- Remove need for separate collector process

## API Endpoints

### `GET /api/traces/session/:sessionId`

Full trace for a session. Returns spans as a tree (parent/child) with tool calls and prompts inlined. Powers the session drill-down timeline.

### `GET /api/stats/tools?period=today|week|month`

Tool usage analytics:

```json
{
  "tools": [
    { "name": "Bash", "count": 142, "avgDurationMs": 1230, "errorRate": 0.03, "totalDurationMs": 174660 },
    { "name": "Read", "count": 89, "avgDurationMs": 45, "errorRate": 0, "totalDurationMs": 4005 }
  ],
  "totalCalls": 312,
  "totalDurationMs": 245000
}
```

### `GET /api/stats/tools/timeline?period=today|week|month`

Tool calls over time, grouped by hour/day for charting.

### `GET /api/stats/prompts?period=today|week|month`

Prompt analytics: count, average length, prompts per session.

## Dashboard UI

### Tool Usage Analytics (`ToolUsageChart.tsx`)

New tab in AnalyticsTabs:

- Horizontal bar chart of top tools by call count (sorted)
- Average duration as secondary metric per bar
- Error rate highlighted in red for tools with failures
- Stacked area chart showing tool calls over time by tool name
- Respects existing period selector (today/week/month)

### Session Drill-Down (extends `SessionHistory`)

Clicking a session row opens an expandable panel:

**Summary section (top):**
- Tool call count, unique tools used, total tool time
- Prompt count, avg prompt length
- Error count if any

**Timeline section (below, expandable):**
- Chronological list of turns: prompt -> tool calls -> response
- Each turn shows timestamp, duration
- Tool calls show: tool name, duration, status badge (green/red)
- Expandable detail: input summary and output summary (truncated OTEL data)
- Prompts shown as quoted text blocks

### No new dependencies

Uses existing theme, chart conventions, and recharts.

## start.sh Changes

Auto-enable OTEL tracing by setting these env vars:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:${PORT:-3000}"
export OTEL_LOG_USER_PROMPTS=true
export OTEL_LOG_TOOL_DETAILS=true
export OTEL_LOG_TOOL_CONTENT=true
```

Remove separate collector process — OTLP endpoints are now embedded in the main server.

## Implementation Order

1. DB schema (new tables + indexes in `db.ts`)
2. Collector refactor (embed in server, write to SQLite)
3. DB query functions for new tables
4. API endpoints
5. Frontend: ToolUsageChart component
6. Frontend: Session drill-down panel
7. `start.sh` env var auto-enable
8. Testing
