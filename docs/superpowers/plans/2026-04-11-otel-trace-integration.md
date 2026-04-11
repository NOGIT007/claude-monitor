# OTEL Trace Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Claude Code's OTEL tracing into the dashboard so users see tool usage analytics and per-session drill-downs alongside existing token/cost data.

**Architecture:** The OTEL collector stops being a standalone server and becomes embedded route handlers in the main `server.ts`. Trace data flows into three new SQLite tables (`otel_spans`, `otel_tool_calls`, `otel_prompts`), queried by new API endpoints, and rendered by two new frontend components — a Tool Usage tab and a Session Drill-Down panel.

**Tech Stack:** Bun, SQLite (bun:sqlite), React 19, Recharts

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/db.ts` | Add OTEL schema, migration, query functions |
| Modify | `src/otel-collector.ts` | Remove standalone server, export handler + DB ingest functions |
| Modify | `src/server.ts` | Mount OTLP routes, pass DB to collector |
| Modify | `src/api.ts` | Add `/api/traces/session/:id`, `/api/stats/tools`, `/api/stats/tools/timeline`, `/api/stats/prompts` |
| Modify | `src/client/types.ts` | Add OTEL-related TypeScript interfaces |
| Modify | `src/client/components/AnalyticsTabs.tsx` | Add "Tool Usage" tab |
| Modify | `src/client/components/SessionHistory.tsx` | Add expandable drill-down panel per row |
| Create | `src/client/components/ToolUsageChart.tsx` | Bar chart + timeline for tool analytics |
| Create | `src/client/components/SessionDrillDown.tsx` | Summary + timeline for a single session's trace |
| Modify | `scripts/start.sh` | Auto-set OTEL env vars |
| Create | `src/otel-db.test.ts` | Tests for OTEL DB schema + queries |
| Create | `src/otel-collector.test.ts` | Tests for collector ingest logic |
| Modify | `src/api.test.ts` | Tests for new API endpoints |

---

### Task 1: OTEL Database Schema

**Files:**
- Modify: `src/db.ts`

- [ ] **Step 1: Write failing test for OTEL tables**

Create `src/otel-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb } from "./db";
import { unlinkSync } from "fs";

const TEST_DB = "./data/test-otel-db.db";

function cleanUp() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(TEST_DB + suffix); } catch {}
  }
}

describe("otel schema", () => {
  let db: Database;

  beforeEach(() => {
    cleanUp();
    db = initDb(TEST_DB);
  });

  afterEach(() => {
    db.close();
    cleanUp();
  });

  it("creates otel_spans table", () => {
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='otel_spans'")
      .all();
    expect(tables.length).toBe(1);
  });

  it("creates otel_tool_calls table", () => {
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='otel_tool_calls'")
      .all();
    expect(tables.length).toBe(1);
  });

  it("creates otel_prompts table", () => {
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='otel_prompts'")
      .all();
    expect(tables.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test src/otel-db.test.ts`
Expected: FAIL — tables don't exist yet

- [ ] **Step 3: Add OTEL schema to db.ts**

Add these table definitions to the `SCHEMA` constant in `src/db.ts`, after the existing `CREATE INDEX` statements:

```sql
CREATE TABLE IF NOT EXISTS otel_spans (
  span_id        TEXT PRIMARY KEY,
  trace_id       TEXT NOT NULL,
  parent_span_id TEXT NOT NULL DEFAULT '',
  session_id     TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  kind           INTEGER NOT NULL DEFAULT 0,
  start_time     TEXT NOT NULL,
  end_time       TEXT NOT NULL DEFAULT '',
  duration_ms    REAL NOT NULL DEFAULT 0,
  status         INTEGER NOT NULL DEFAULT 0,
  attributes     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_otel_spans_session   ON otel_spans(session_id);
CREATE INDEX IF NOT EXISTS idx_otel_spans_trace     ON otel_spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_otel_spans_time      ON otel_spans(start_time);

CREATE TABLE IF NOT EXISTS otel_tool_calls (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  span_id        TEXT NOT NULL,
  session_id     TEXT NOT NULL DEFAULT '',
  tool_name      TEXT NOT NULL,
  timestamp      TEXT NOT NULL,
  duration_ms    REAL NOT NULL DEFAULT 0,
  input_summary  TEXT NOT NULL DEFAULT '',
  output_summary TEXT NOT NULL DEFAULT '',
  status         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_otel_tools_session ON otel_tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_otel_tools_name    ON otel_tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_otel_tools_time    ON otel_tool_calls(timestamp);

CREATE TABLE IF NOT EXISTS otel_prompts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  span_id        TEXT NOT NULL,
  session_id     TEXT NOT NULL DEFAULT '',
  timestamp      TEXT NOT NULL,
  prompt_text    TEXT NOT NULL DEFAULT '',
  token_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_otel_prompts_session ON otel_prompts(session_id);
CREATE INDEX IF NOT EXISTS idx_otel_prompts_time    ON otel_prompts(timestamp);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test src/otel-db.test.ts`
Expected: PASS

- [ ] **Step 5: Run all existing tests to check for regressions**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/db.ts src/otel-db.test.ts
git commit -m "feat: add OTEL schema tables (otel_spans, otel_tool_calls, otel_prompts)"
```

---

### Task 2: OTEL DB Insert + Query Functions

**Files:**
- Modify: `src/db.ts`
- Modify: `src/otel-db.test.ts`

- [ ] **Step 1: Write failing tests for insert and query functions**

Append to `src/otel-db.test.ts`:

```typescript
import {
  initDb,
  insertOtelSpan,
  insertOtelToolCall,
  insertOtelPrompt,
  getSessionTrace,
  getToolStats,
  getToolTimeline,
  getPromptStats,
} from "./db";

// ... inside the describe("otel schema") block, add:

describe("otel inserts and queries", () => {
  let db: Database;

  beforeEach(() => {
    cleanUp();
    db = initDb(TEST_DB);

    // Seed: two spans for session "s1", one tool call each, one prompt
    insertOtelSpan(db, {
      spanId: "span-1",
      traceId: "trace-1",
      parentSpanId: "",
      sessionId: "s1",
      name: "interaction",
      kind: 1,
      startTime: "2026-04-11T10:00:00.000Z",
      endTime: "2026-04-11T10:00:05.000Z",
      durationMs: 5000,
      status: 0,
      attributes: "{}",
    });

    insertOtelSpan(db, {
      spanId: "span-2",
      traceId: "trace-1",
      parentSpanId: "span-1",
      sessionId: "s1",
      name: "tool_use",
      kind: 1,
      startTime: "2026-04-11T10:00:01.000Z",
      endTime: "2026-04-11T10:00:02.500Z",
      durationMs: 1500,
      status: 0,
      attributes: '{"tool.name":"Bash"}',
    });

    insertOtelToolCall(db, {
      spanId: "span-2",
      sessionId: "s1",
      toolName: "Bash",
      timestamp: "2026-04-11T10:00:01.000Z",
      durationMs: 1500,
      inputSummary: "ls -la",
      outputSummary: "total 42...",
      status: 0,
    });

    insertOtelPrompt(db, {
      spanId: "span-1",
      sessionId: "s1",
      timestamp: "2026-04-11T10:00:00.000Z",
      promptText: "List the files in this directory",
      tokenCount: 8,
    });
  });

  afterEach(() => {
    db.close();
    cleanUp();
  });

  it("getSessionTrace returns spans for a session", () => {
    const trace = getSessionTrace(db, "s1");
    expect(trace.spans.length).toBe(2);
    expect(trace.toolCalls.length).toBe(1);
    expect(trace.prompts.length).toBe(1);
    expect(trace.toolCalls[0].toolName).toBe("Bash");
    expect(trace.prompts[0].promptText).toBe("List the files in this directory");
  });

  it("getSessionTrace returns empty for unknown session", () => {
    const trace = getSessionTrace(db, "nonexistent");
    expect(trace.spans.length).toBe(0);
    expect(trace.toolCalls.length).toBe(0);
    expect(trace.prompts.length).toBe(0);
  });

  it("getToolStats returns aggregated tool stats", () => {
    const stats = getToolStats(db, "today");
    expect(stats.tools.length).toBe(1);
    expect(stats.tools[0].name).toBe("Bash");
    expect(stats.tools[0].count).toBe(1);
    expect(stats.tools[0].avgDurationMs).toBe(1500);
    expect(stats.totalCalls).toBe(1);
  });

  it("getPromptStats returns aggregated prompt stats", () => {
    const stats = getPromptStats(db, "today");
    expect(stats.totalPrompts).toBe(1);
    expect(stats.avgLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test src/otel-db.test.ts`
Expected: FAIL — functions not exported from db.ts yet

- [ ] **Step 3: Implement insert functions in db.ts**

Add to `src/db.ts`:

```typescript
export interface OtelSpanInput {
  spanId: string;
  traceId: string;
  parentSpanId: string;
  sessionId: string;
  name: string;
  kind: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: number;
  attributes: string;
}

export function insertOtelSpan(db: Database, span: OtelSpanInput): void {
  db.run(
    `INSERT OR IGNORE INTO otel_spans (span_id, trace_id, parent_span_id, session_id, name, kind, start_time, end_time, duration_ms, status, attributes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [span.spanId, span.traceId, span.parentSpanId, span.sessionId, span.name, span.kind, span.startTime, span.endTime, span.durationMs, span.status, span.attributes],
  );
}

export interface OtelToolCallInput {
  spanId: string;
  sessionId: string;
  toolName: string;
  timestamp: string;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
  status: number;
}

export function insertOtelToolCall(db: Database, tc: OtelToolCallInput): void {
  db.run(
    `INSERT INTO otel_tool_calls (span_id, session_id, tool_name, timestamp, duration_ms, input_summary, output_summary, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tc.spanId, tc.sessionId, tc.toolName, tc.timestamp, tc.durationMs, tc.inputSummary, tc.outputSummary, tc.status],
  );
}

export interface OtelPromptInput {
  spanId: string;
  sessionId: string;
  timestamp: string;
  promptText: string;
  tokenCount: number;
}

export function insertOtelPrompt(db: Database, p: OtelPromptInput): void {
  db.run(
    `INSERT INTO otel_prompts (span_id, session_id, timestamp, prompt_text, token_count)
     VALUES (?, ?, ?, ?, ?)`,
    [p.spanId, p.sessionId, p.timestamp, p.promptText, p.tokenCount],
  );
}
```

- [ ] **Step 4: Implement query functions in db.ts**

Add to `src/db.ts`:

```typescript
export interface SessionTrace {
  spans: {
    spanId: string;
    traceId: string;
    parentSpanId: string;
    name: string;
    kind: number;
    startTime: string;
    endTime: string;
    durationMs: number;
    status: number;
    attributes: string;
  }[];
  toolCalls: {
    id: number;
    spanId: string;
    toolName: string;
    timestamp: string;
    durationMs: number;
    inputSummary: string;
    outputSummary: string;
    status: number;
  }[];
  prompts: {
    id: number;
    spanId: string;
    timestamp: string;
    promptText: string;
    tokenCount: number;
  }[];
}

export function getSessionTrace(db: Database, sessionId: string): SessionTrace {
  const spans = db
    .query(
      `SELECT span_id AS spanId, trace_id AS traceId, parent_span_id AS parentSpanId,
              name, kind, start_time AS startTime, end_time AS endTime,
              duration_ms AS durationMs, status, attributes
       FROM otel_spans WHERE session_id = ? ORDER BY start_time ASC`,
    )
    .all(sessionId) as SessionTrace["spans"];

  const toolCalls = db
    .query(
      `SELECT id, span_id AS spanId, tool_name AS toolName, timestamp,
              duration_ms AS durationMs, input_summary AS inputSummary,
              output_summary AS outputSummary, status
       FROM otel_tool_calls WHERE session_id = ? ORDER BY timestamp ASC`,
    )
    .all(sessionId) as SessionTrace["toolCalls"];

  const prompts = db
    .query(
      `SELECT id, span_id AS spanId, timestamp, prompt_text AS promptText, token_count AS tokenCount
       FROM otel_prompts WHERE session_id = ? ORDER BY timestamp ASC`,
    )
    .all(sessionId) as SessionTrace["prompts"];

  return { spans, toolCalls, prompts };
}

export interface ToolStatsEntry {
  name: string;
  count: number;
  avgDurationMs: number;
  errorRate: number;
  totalDurationMs: number;
}

export interface ToolStatsResult {
  tools: ToolStatsEntry[];
  totalCalls: number;
  totalDurationMs: number;
}

export function getToolStats(db: Database, period: "today" | "week" | "month"): ToolStatsResult {
  const cutoff = getCutoff(period);
  const tools = db
    .query(
      `SELECT
         tool_name AS name,
         COUNT(*) AS count,
         ROUND(AVG(duration_ms), 0) AS avgDurationMs,
         ROUND(1.0 * SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) / COUNT(*), 3) AS errorRate,
         ROUND(SUM(duration_ms), 0) AS totalDurationMs
       FROM otel_tool_calls
       WHERE timestamp >= ?
       GROUP BY tool_name
       ORDER BY count DESC`,
    )
    .all(cutoff) as ToolStatsEntry[];

  const totalCalls = tools.reduce((s, t) => s + t.count, 0);
  const totalDurationMs = tools.reduce((s, t) => s + t.totalDurationMs, 0);

  return { tools, totalCalls, totalDurationMs };
}

export interface ToolTimelineEntry {
  bucket: string;
  toolName: string;
  count: number;
}

export function getToolTimeline(db: Database, period: "today" | "week" | "month"): ToolTimelineEntry[] {
  const cutoff = getCutoff(period);
  const groupBy = period === "today" ? "strftime('%H:00', timestamp)" : "date(timestamp)";
  return db
    .query(
      `SELECT
         ${groupBy} AS bucket,
         tool_name AS toolName,
         COUNT(*) AS count
       FROM otel_tool_calls
       WHERE timestamp >= ?
       GROUP BY bucket, tool_name
       ORDER BY bucket ASC`,
    )
    .all(cutoff) as ToolTimelineEntry[];
}

export interface PromptStatsResult {
  totalPrompts: number;
  avgLength: number;
  promptsPerSession: number;
}

export function getPromptStats(db: Database, period: "today" | "week" | "month"): PromptStatsResult {
  const cutoff = getCutoff(period);
  const row = db
    .query(
      `SELECT
         COUNT(*) AS totalPrompts,
         COALESCE(ROUND(AVG(LENGTH(prompt_text)), 0), 0) AS avgLength,
         CASE WHEN COUNT(DISTINCT session_id) > 0
           THEN ROUND(1.0 * COUNT(*) / COUNT(DISTINCT session_id), 1)
           ELSE 0 END AS promptsPerSession
       FROM otel_prompts
       WHERE timestamp >= ?`,
    )
    .get(cutoff) as PromptStatsResult;

  return row;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test src/otel-db.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/db.ts src/otel-db.test.ts
git commit -m "feat: add OTEL insert and query functions for spans, tool calls, prompts"
```

---

### Task 3: Refactor OTEL Collector to Embed in Server

**Files:**
- Modify: `src/otel-collector.ts`
- Create: `src/otel-collector.test.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write failing test for collector ingest**

Create `src/otel-collector.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb } from "./db";
import { handleOtelRequest } from "./otel-collector";
import { unlinkSync } from "fs";

const TEST_DB = "./data/test-otel-collector.db";

function cleanUp() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(TEST_DB + suffix); } catch {}
  }
}

function makePost(path: string, body: object): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("otel-collector", () => {
  let db: Database;

  beforeEach(() => {
    cleanUp();
    db = initDb(TEST_DB);
  });

  afterEach(() => {
    db.close();
    cleanUp();
  });

  it("ingests a trace span into otel_spans", async () => {
    const payload = {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: "session.id", value: { stringValue: "sess-abc" } },
          ],
        },
        scopeSpans: [{
          spans: [{
            traceId: "t1",
            spanId: "s1",
            parentSpanId: "",
            name: "interaction",
            kind: 1,
            startTimeUnixNano: String(Date.now() * 1e6),
            endTimeUnixNano: String((Date.now() + 5000) * 1e6),
            status: { code: 0 },
            attributes: [],
          }],
        }],
      }],
    };

    const res = await handleOtelRequest(makePost("/v1/traces", payload), db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);

    const spans = db.query("SELECT * FROM otel_spans").all() as any[];
    expect(spans.length).toBe(1);
    expect(spans[0].span_id).toBe("s1");
    expect(spans[0].session_id).toBe("sess-abc");
  });

  it("extracts tool calls from tool_use spans", async () => {
    const payload = {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: "session.id", value: { stringValue: "sess-abc" } },
          ],
        },
        scopeSpans: [{
          spans: [{
            traceId: "t1",
            spanId: "s2",
            parentSpanId: "s1",
            name: "tool_use",
            kind: 1,
            startTimeUnixNano: String(Date.now() * 1e6),
            endTimeUnixNano: String((Date.now() + 1500) * 1e6),
            status: { code: 0 },
            attributes: [
              { key: "tool.name", value: { stringValue: "Read" } },
              { key: "tool.input", value: { stringValue: "/src/db.ts" } },
              { key: "tool.output", value: { stringValue: "file contents here..." } },
            ],
          }],
        }],
      }],
    };

    const res = await handleOtelRequest(makePost("/v1/traces", payload), db);
    expect(res!.status).toBe(200);

    const tools = db.query("SELECT * FROM otel_tool_calls").all() as any[];
    expect(tools.length).toBe(1);
    expect(tools[0].tool_name).toBe("Read");
    expect(tools[0].input_summary).toBe("/src/db.ts");
  });

  it("extracts prompts from spans with user.prompt attribute", async () => {
    const payload = {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: "session.id", value: { stringValue: "sess-abc" } },
          ],
        },
        scopeSpans: [{
          spans: [{
            traceId: "t1",
            spanId: "s3",
            parentSpanId: "",
            name: "interaction",
            kind: 1,
            startTimeUnixNano: String(Date.now() * 1e6),
            endTimeUnixNano: String((Date.now() + 3000) * 1e6),
            status: { code: 0 },
            attributes: [
              { key: "user.prompt", value: { stringValue: "Fix the bug in db.ts" } },
              { key: "user.prompt.token_count", value: { intValue: "7" } },
            ],
          }],
        }],
      }],
    };

    const res = await handleOtelRequest(makePost("/v1/traces", payload), db);
    expect(res!.status).toBe(200);

    const prompts = db.query("SELECT * FROM otel_prompts").all() as any[];
    expect(prompts.length).toBe(1);
    expect(prompts[0].prompt_text).toBe("Fix the bug in db.ts");
    expect(prompts[0].token_count).toBe(7);
  });

  it("returns null for non-OTLP paths", async () => {
    const res = await handleOtelRequest(makePost("/api/stats/today", {}), db);
    expect(res).toBeNull();
  });

  it("handles /v1/metrics and /v1/logs without crashing", async () => {
    const metricsRes = await handleOtelRequest(makePost("/v1/metrics", { resourceMetrics: [] }), db);
    expect(metricsRes!.status).toBe(200);

    const logsRes = await handleOtelRequest(makePost("/v1/logs", { resourceLogs: [] }), db);
    expect(logsRes!.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test src/otel-collector.test.ts`
Expected: FAIL — `handleOtelRequest` doesn't exist

- [ ] **Step 3: Rewrite otel-collector.ts**

Replace the contents of `src/otel-collector.ts` with:

```typescript
/**
 * OTEL collector — embedded in main server.
 * Receives OTLP/HTTP JSON, writes spans to SQLite,
 * extracts tool calls and prompts into dedicated tables.
 * Metrics and logs still go to NDJSON files for debugging.
 */

import { mkdirSync, appendFileSync } from "fs";
import { join, resolve } from "path";
import type { Database } from "bun:sqlite";
import { insertOtelSpan, insertOtelToolCall, insertOtelPrompt } from "./db";

const DATA_DIR = resolve(import.meta.dir, "../data");
const EVENTS_PATH = join(DATA_DIR, "otel_events.ndjson");
const METRICS_PATH = join(DATA_DIR, "otel_metrics.ndjson");

mkdirSync(DATA_DIR, { recursive: true });

const MAX_SUMMARY_LENGTH = 1000;

function truncate(s: string): string {
  return s.length > MAX_SUMMARY_LENGTH ? s.slice(0, MAX_SUMMARY_LENGTH) : s;
}

function safeTimestamp(nanoStr: string | undefined): string {
  if (!nanoStr) return new Date().toISOString();
  const ms = Number(nanoStr) / 1e6;
  if (isNaN(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function flattenAttributes(attrs: any[]): Record<string, any> {
  const result: Record<string, any> = {};
  if (!Array.isArray(attrs)) return result;
  for (const attr of attrs) {
    if (!attr || !attr.key) continue;
    const val = attr.value;
    if (!val) continue;
    if (val.stringValue !== undefined) result[attr.key] = val.stringValue;
    else if (val.intValue !== undefined) result[attr.key] = Number(val.intValue);
    else if (val.doubleValue !== undefined) result[attr.key] = val.doubleValue;
    else if (val.boolValue !== undefined) result[attr.key] = val.boolValue;
  }
  return result;
}

function processTraces(db: Database, body: any): number {
  let count = 0;
  for (const rs of body.resourceSpans ?? []) {
    const resourceAttrs = flattenAttributes(rs.resource?.attributes ?? []);
    const sessionId = resourceAttrs["session.id"] ?? "";

    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        const attrs = flattenAttributes(span.attributes ?? []);
        const startTime = safeTimestamp(span.startTimeUnixNano);
        const endTime = span.endTimeUnixNano ? safeTimestamp(span.endTimeUnixNano) : "";
        const durationMs = span.startTimeUnixNano && span.endTimeUnixNano
          ? (Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / 1e6
          : 0;

        // Insert span
        insertOtelSpan(db, {
          spanId: span.spanId ?? "",
          traceId: span.traceId ?? "",
          parentSpanId: span.parentSpanId ?? "",
          sessionId,
          name: span.name ?? "",
          kind: span.kind ?? 0,
          startTime,
          endTime,
          durationMs,
          status: span.status?.code ?? 0,
          attributes: JSON.stringify({ ...resourceAttrs, ...attrs }),
        });

        // Extract tool calls
        const toolName = attrs["tool.name"];
        if (toolName || (span.name ?? "").includes("tool")) {
          insertOtelToolCall(db, {
            spanId: span.spanId ?? "",
            sessionId,
            toolName: toolName ?? span.name ?? "unknown",
            timestamp: startTime,
            durationMs,
            inputSummary: truncate(String(attrs["tool.input"] ?? "")),
            outputSummary: truncate(String(attrs["tool.output"] ?? "")),
            status: span.status?.code ?? 0,
          });
        }

        // Extract prompts
        const promptText = attrs["user.prompt"];
        if (promptText) {
          insertOtelPrompt(db, {
            spanId: span.spanId ?? "",
            sessionId,
            timestamp: startTime,
            promptText: truncate(String(promptText)),
            tokenCount: Number(attrs["user.prompt.token_count"] ?? 0),
          });
        }

        count++;
      }
    }
  }
  return count;
}

function processMetrics(body: any): void {
  for (const rm of body.resourceMetrics ?? []) {
    const resourceAttrs = flattenAttributes(rm.resource?.attributes ?? []);
    for (const sm of rm.scopeMetrics ?? []) {
      for (const metric of sm.metrics ?? []) {
        const dataPoints =
          metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? metric.histogram?.dataPoints ?? [];
        for (const dp of dataPoints) {
          const attrs = flattenAttributes(dp.attributes ?? []);
          const record = {
            timestamp: safeTimestamp(dp.timeUnixNano),
            metric: metric.name,
            value: dp.asDouble ?? dp.asInt ?? dp.value ?? 0,
            ...resourceAttrs,
            ...attrs,
          };
          appendFileSync(METRICS_PATH, JSON.stringify(record) + "\n");
        }
      }
    }
  }
}

function processLogs(body: any): void {
  for (const rl of body.resourceLogs ?? []) {
    const resourceAttrs = flattenAttributes(rl.resource?.attributes ?? []);
    for (const sl of rl.scopeLogs ?? []) {
      for (const log of sl.logRecords ?? []) {
        const attrs = flattenAttributes(log.attributes ?? []);
        const record: any = {
          timestamp: safeTimestamp(log.timeUnixNano),
          event: attrs["event.name"] ?? "unknown",
          severity: log.severityText ?? "",
          ...resourceAttrs,
          ...attrs,
        };
        if (log.body?.stringValue) {
          try { Object.assign(record, JSON.parse(log.body.stringValue)); }
          catch { record.body = log.body.stringValue; }
        }
        appendFileSync(EVENTS_PATH, JSON.stringify(record) + "\n");
      }
    }
  }
}

/**
 * Handle an OTLP request. Returns a Response if the path matches
 * /v1/traces, /v1/metrics, or /v1/logs. Returns null otherwise.
 */
export async function handleOtelRequest(req: Request, db: Database): Promise<Response | null> {
  const url = new URL(req.url);

  if (req.method !== "POST") return null;

  if (url.pathname === "/v1/traces") {
    try {
      const body = await req.json();
      processTraces(db, body);
      return Response.json({ partialSuccess: {} });
    } catch (err) {
      console.error("[otel] Trace parse error:", err);
      return new Response("Bad request", { status: 400 });
    }
  }

  if (url.pathname === "/v1/metrics") {
    try {
      const body = await req.json();
      processMetrics(body);
      return Response.json({ partialSuccess: {} });
    } catch (err) {
      console.error("[otel] Metrics parse error:", err);
      return new Response("Bad request", { status: 400 });
    }
  }

  if (url.pathname === "/v1/logs") {
    try {
      const body = await req.json();
      processLogs(body);
      return Response.json({ partialSuccess: {} });
    } catch (err) {
      console.error("[otel] Logs parse error:", err);
      return new Response("Bad request", { status: 400 });
    }
  }

  return null;
}
```

- [ ] **Step 4: Update server.ts to use embedded collector**

In `src/server.ts`, replace `import "./otel-collector";` with:

```typescript
import { handleOtelRequest } from "./otel-collector";
```

Then in the `fetch` handler, add the OTEL check right after the API check:

```typescript
fetch(req, server) {
  const apiResponse = handleApiRequest(req, db);
  if (apiResponse) return apiResponse;

  // OTEL collector — handle /v1/traces, /v1/metrics, /v1/logs
  const otelPromise = handleOtelRequest(req, db);
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/v1/")) {
      return otelPromise as Promise<Response>;
    }
  }

  // ... rest unchanged
```

**Important:** Since `handleOtelRequest` is async (needs `req.json()`), and Bun.serve's `fetch` can return a `Promise<Response>`, this works directly. But we need a synchronous check first to avoid awaiting on non-OTEL paths. The approach above checks `POST /v1/*` synchronously before delegating.

Simplify to:

```typescript
async fetch(req, server) {
  const apiResponse = handleApiRequest(req, db);
  if (apiResponse) return apiResponse;

  const otelResponse = await handleOtelRequest(req, db);
  if (otelResponse) return otelResponse;

  // ... rest unchanged
```

- [ ] **Step 5: Run collector tests**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test src/otel-collector.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/otel-collector.ts src/otel-collector.test.ts src/server.ts
git commit -m "refactor: embed OTEL collector in main server, ingest traces to SQLite"
```

---

### Task 4: New API Endpoints

**Files:**
- Modify: `src/api.ts`
- Modify: `src/api.test.ts`

- [ ] **Step 1: Write failing tests for new endpoints**

Append to `src/api.test.ts` inside the existing `describe("api")` block. First update the imports at the top to add:

```typescript
import { initDb, upsertSession, insertTokenUsage, insertOtelSpan, insertOtelToolCall, insertOtelPrompt } from "./db";
```

Then add a new inner `describe`:

```typescript
describe("OTEL endpoints", () => {
  beforeEach(() => {
    // Seed OTEL data
    const now = new Date().toISOString();
    insertOtelSpan(db, {
      spanId: "span-1", traceId: "trace-1", parentSpanId: "", sessionId: "sess-1",
      name: "interaction", kind: 1, startTime: now, endTime: now,
      durationMs: 5000, status: 0, attributes: "{}",
    });
    insertOtelToolCall(db, {
      spanId: "span-1", sessionId: "sess-1", toolName: "Bash",
      timestamp: now, durationMs: 1200, inputSummary: "ls", outputSummary: "files...", status: 0,
    });
    insertOtelToolCall(db, {
      spanId: "span-1", sessionId: "sess-1", toolName: "Read",
      timestamp: now, durationMs: 50, inputSummary: "db.ts", outputSummary: "content...", status: 0,
    });
    insertOtelPrompt(db, {
      spanId: "span-1", sessionId: "sess-1", timestamp: now,
      promptText: "List files", tokenCount: 3,
    });
  });

  it("GET /api/traces/session/sess-1 returns trace data", async () => {
    const res = handleApiRequest(makeRequest("/api/traces/session/sess-1"), db, testApiOptions);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.spans.length).toBe(1);
    expect(data.toolCalls.length).toBe(2);
    expect(data.prompts.length).toBe(1);
  });

  it("GET /api/stats/tools returns tool stats", async () => {
    const res = handleApiRequest(makeRequest("/api/stats/tools?period=today"), db, testApiOptions);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.tools.length).toBe(2);
    expect(data.totalCalls).toBe(2);
  });

  it("GET /api/stats/tools/timeline returns timeline", async () => {
    const res = handleApiRequest(makeRequest("/api/stats/tools/timeline?period=today"), db, testApiOptions);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/stats/prompts returns prompt stats", async () => {
    const res = handleApiRequest(makeRequest("/api/stats/prompts?period=today"), db, testApiOptions);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.totalPrompts).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test src/api.test.ts`
Expected: FAIL — endpoints don't exist yet

- [ ] **Step 3: Add endpoints to api.ts**

Add these imports at the top of `src/api.ts`:

```typescript
import {
  // ... existing imports ...
  getSessionTrace,
  getToolStats,
  getToolTimeline,
  getPromptStats,
} from "./db";
```

Add these routes inside `handleApiRequest`, before the final `return null`:

```typescript
// Session trace drill-down
const traceMatch = pathname.match(/^\/api\/traces\/session\/(.+)$/);
if (traceMatch) {
  const sessionId = decodeURIComponent(traceMatch[1]);
  return json(getSessionTrace(db, sessionId));
}

if (pathname === "/api/stats/tools") {
  const period = parsePeriod(url);
  if (!period) return json({ error: "Invalid period" }, 400);
  return json(getToolStats(db, period));
}

if (pathname === "/api/stats/tools/timeline") {
  const period = parsePeriod(url);
  if (!period) return json({ error: "Invalid period" }, 400);
  return json(getToolTimeline(db, period));
}

if (pathname === "/api/stats/prompts") {
  const period = parsePeriod(url);
  if (!period) return json({ error: "Invalid period" }, 400);
  return json(getPromptStats(db, period));
}
```

**Important:** Place the `/api/stats/tools` and `/api/stats/tools/timeline` routes BEFORE the existing `pathname.startsWith("/api/stats/")` catch-all route, otherwise they'll be intercepted.

- [ ] **Step 4: Run API tests**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test src/api.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/api.ts src/api.test.ts
git commit -m "feat: add API endpoints for session traces, tool stats, prompts"
```

---

### Task 5: Client Types for OTEL Data

**Files:**
- Modify: `src/client/types.ts`

- [ ] **Step 1: Add OTEL interfaces to types.ts**

Append to `src/client/types.ts`:

```typescript
// OTEL trace types

export interface OtelSpan {
  spanId: string;
  traceId: string;
  parentSpanId: string;
  name: string;
  kind: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: number;
  attributes: string;
}

export interface OtelToolCall {
  id: number;
  spanId: string;
  toolName: string;
  timestamp: string;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
  status: number;
}

export interface OtelPrompt {
  id: number;
  spanId: string;
  timestamp: string;
  promptText: string;
  tokenCount: number;
}

export interface SessionTrace {
  spans: OtelSpan[];
  toolCalls: OtelToolCall[];
  prompts: OtelPrompt[];
}

export interface ToolStatsEntry {
  name: string;
  count: number;
  avgDurationMs: number;
  errorRate: number;
  totalDurationMs: number;
}

export interface ToolStatsResult {
  tools: ToolStatsEntry[];
  totalCalls: number;
  totalDurationMs: number;
}

export interface ToolTimelineEntry {
  bucket: string;
  toolName: string;
  count: number;
}

export interface PromptStatsResult {
  totalPrompts: number;
  avgLength: number;
  promptsPerSession: number;
}

export type AnalyticsTab = "tokens" | "workflow" | "productivity" | "thinking" | "ratelimits" | "tools";
```

**Important:** The last line replaces the existing `AnalyticsTab` type — add `"tools"` to the union.

- [ ] **Step 2: Commit**

```bash
git add src/client/types.ts
git commit -m "feat: add OTEL TypeScript interfaces and 'tools' analytics tab type"
```

---

### Task 6: Tool Usage Chart Component

**Files:**
- Create: `src/client/components/ToolUsageChart.tsx`

- [ ] **Step 1: Create ToolUsageChart.tsx**

Create `src/client/components/ToolUsageChart.tsx`:

```tsx
import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import type { ToolStatsResult, ToolTimelineEntry, PromptStatsResult } from "../types";
import { CHART_THEME } from "../chart-theme";

interface Props {
  period: "today" | "week" | "month";
}

const TOOL_COLORS = [
  "var(--ctp-blue)",
  "var(--ctp-green)",
  "var(--ctp-mauve)",
  "var(--ctp-peach)",
  "var(--ctp-teal)",
  "var(--ctp-red)",
  "var(--ctp-yellow)",
  "var(--ctp-pink)",
];

export function ToolUsageChart({ period }: Props) {
  const [toolStats, setToolStats] = useState<ToolStatsResult | null>(null);
  const [timeline, setTimeline] = useState<ToolTimelineEntry[]>([]);
  const [promptStats, setPromptStats] = useState<PromptStatsResult | null>(null);

  useEffect(() => {
    fetch(`/api/stats/tools?period=${period}`)
      .then((r) => r.json())
      .then(setToolStats)
      .catch(() => setToolStats(null));

    fetch(`/api/stats/tools/timeline?period=${period}`)
      .then((r) => r.json())
      .then(setTimeline)
      .catch(() => setTimeline([]));

    fetch(`/api/stats/prompts?period=${period}`)
      .then((r) => r.json())
      .then(setPromptStats)
      .catch(() => setPromptStats(null));
  }, [period]);

  if (!toolStats || toolStats.tools.length === 0) {
    return (
      <div className="card">
        <p style={{ color: "var(--ctp-subtext0)", margin: 0 }}>
          No OTEL tool data yet. Enable tracing with OTEL_LOG_TOOL_DETAILS=true to see tool analytics.
        </p>
      </div>
    );
  }

  // Build timeline data: pivot toolName into columns per bucket
  const toolNames = [...new Set(timeline.map((t) => t.toolName))];
  const bucketMap = new Map<string, Record<string, number>>();
  for (const entry of timeline) {
    if (!bucketMap.has(entry.bucket)) bucketMap.set(entry.bucket, {});
    bucketMap.get(entry.bucket)![entry.toolName] = entry.count;
  }
  const timelineData = [...bucketMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, tools]) => ({ bucket, ...tools }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ctp-blue)", fontFamily: "var(--font-mono)" }}>
            {toolStats.totalCalls}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)", marginTop: "0.25rem" }}>
            Total Tool Calls
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ctp-green)", fontFamily: "var(--font-mono)" }}>
            {toolStats.tools.length}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)", marginTop: "0.25rem" }}>
            Unique Tools
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ctp-peach)", fontFamily: "var(--font-mono)" }}>
            {Math.round(toolStats.totalDurationMs / 1000)}s
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)", marginTop: "0.25rem" }}>
            Total Tool Time
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ctp-mauve)", fontFamily: "var(--font-mono)" }}>
            {promptStats?.totalPrompts ?? 0}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)", marginTop: "0.25rem" }}>
            User Prompts
          </div>
        </div>
      </div>

      {/* Tool usage bar chart */}
      <div className="card">
        <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
          Tool Calls by Type
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(200, toolStats.tools.length * 40)}>
          <BarChart data={toolStats.tools} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,71,90,0.2)" />
            <XAxis type="number" tick={{ fill: "var(--ctp-subtext0)", fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: "var(--ctp-text)", fontSize: 12, fontFamily: "var(--font-mono)" }} width={60} />
            <Tooltip
              contentStyle={{ background: "var(--ctp-surface0)", border: "1px solid var(--ctp-surface1)", borderRadius: 8, fontSize: 12 }}
              formatter={(value: number, name: string) => {
                if (name === "count") return [value, "Calls"];
                return [value, name];
              }}
              labelFormatter={(label) => label}
            />
            <Bar dataKey="count" fill="var(--ctp-blue)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {/* Error rates inline */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.75rem" }}>
          {toolStats.tools.map((t) => (
            <span key={t.name} style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-subtext0)" }}>
              {t.name}: avg {Math.round(t.avgDurationMs)}ms
              {t.errorRate > 0 && (
                <span style={{ color: "var(--ctp-red)", marginLeft: "0.3rem" }}>
                  ({(t.errorRate * 100).toFixed(1)}% err)
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Timeline chart */}
      {timelineData.length > 1 && (
        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Tool Calls Over Time
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={timelineData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,71,90,0.2)" />
              <XAxis dataKey="bucket" tick={{ fill: "var(--ctp-subtext0)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--ctp-subtext0)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "var(--ctp-surface0)", border: "1px solid var(--ctp-surface1)", borderRadius: 8, fontSize: 12 }}
              />
              {toolNames.map((name, i) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stackId="1"
                  fill={TOOL_COLORS[i % TOOL_COLORS.length]}
                  stroke={TOOL_COLORS[i % TOOL_COLORS.length]}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Prompt stats */}
      {promptStats && promptStats.totalPrompts > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--ctp-text)" }}>
            Prompt Analytics
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ctp-lavender)", fontFamily: "var(--font-mono)" }}>
                {promptStats.totalPrompts}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)" }}>Total Prompts</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ctp-teal)", fontFamily: "var(--font-mono)" }}>
                {promptStats.avgLength}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)" }}>Avg Length (chars)</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ctp-flamingo)", fontFamily: "var(--font-mono)" }}>
                {promptStats.promptsPerSession}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--ctp-subtext0)" }}>Per Session</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/ToolUsageChart.tsx
git commit -m "feat: add ToolUsageChart component with bar chart, timeline, prompt stats"
```

---

### Task 7: Session Drill-Down Component

**Files:**
- Create: `src/client/components/SessionDrillDown.tsx`

- [ ] **Step 1: Create SessionDrillDown.tsx**

Create `src/client/components/SessionDrillDown.tsx`:

```tsx
import { useState, useEffect } from "react";
import type { SessionTrace } from "../types";

interface Props {
  sessionId: string;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatusBadge({ status }: { status: number }) {
  const isError = status === 2;
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: isError ? "var(--ctp-red)" : "var(--ctp-green)",
        marginRight: "0.3rem",
      }}
      title={isError ? "Error" : "OK"}
    />
  );
}

export function SessionDrillDown({ sessionId }: Props) {
  const [trace, setTrace] = useState<SessionTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/traces/session/${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data: SessionTrace) => {
        setTrace(data);
        setLoading(false);
      })
      .catch(() => {
        setTrace(null);
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div style={{ padding: "1rem", color: "var(--ctp-subtext0)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        Loading trace data...
      </div>
    );
  }

  if (!trace || (trace.spans.length === 0 && trace.toolCalls.length === 0 && trace.prompts.length === 0)) {
    return (
      <div style={{ padding: "1rem", color: "var(--ctp-subtext0)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        No OTEL trace data for this session. Enable OTEL_LOG_TOOL_DETAILS=true to capture traces.
      </div>
    );
  }

  const toggleSpan = (spanId: string) => {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  };

  // Summary
  const uniqueTools = new Set(trace.toolCalls.map((tc) => tc.toolName));
  const totalToolTime = trace.toolCalls.reduce((s, tc) => s + tc.durationMs, 0);
  const errorCount = trace.toolCalls.filter((tc) => tc.status === 2).length;

  // Merge prompts and tool calls into a timeline
  type TimelineItem =
    | { type: "prompt"; timestamp: string; data: SessionTrace["prompts"][0] }
    | { type: "tool"; timestamp: string; data: SessionTrace["toolCalls"][0] };

  const timelineItems: TimelineItem[] = [
    ...trace.prompts.map((p) => ({ type: "prompt" as const, timestamp: p.timestamp, data: p })),
    ...trace.toolCalls.map((tc) => ({ type: "tool" as const, timestamp: tc.timestamp, data: tc })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Summary */}
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-blue)" }}>
          {trace.toolCalls.length} tool calls
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-green)" }}>
          {uniqueTools.size} unique tools
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-peach)" }}>
          {formatMs(totalToolTime)} total tool time
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-mauve)" }}>
          {trace.prompts.length} prompts
        </span>
        {errorCount > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ctp-red)" }}>
            {errorCount} errors
          </span>
        )}
      </div>

      {/* Timeline */}
      <div style={{ borderLeft: "2px solid rgba(69,71,90,0.3)", paddingLeft: "1rem" }}>
        {timelineItems.map((item, i) => {
          if (item.type === "prompt") {
            const p = item.data;
            return (
              <div key={`p-${p.id}`} style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--ctp-overlay0)", fontFamily: "var(--font-mono)", marginBottom: "0.2rem" }}>
                  {formatTime(p.timestamp)}
                </div>
                <div
                  style={{
                    background: "rgba(137, 180, 250, 0.08)",
                    border: "1px solid rgba(137, 180, 250, 0.15)",
                    borderRadius: 6,
                    padding: "0.5rem 0.75rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    color: "var(--ctp-lavender)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {p.promptText}
                </div>
              </div>
            );
          }

          const tc = item.data;
          const isExpanded = expandedSpans.has(tc.spanId);
          return (
            <div key={`tc-${tc.id}`} style={{ marginBottom: "0.75rem" }}>
              <div
                onClick={() => toggleSpan(tc.spanId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span style={{ fontSize: "0.65rem", color: "var(--ctp-overlay0)", fontFamily: "var(--font-mono)" }}>
                  {formatTime(tc.timestamp)}
                </span>
                <StatusBadge status={tc.status} />
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 600,
                  color: "var(--ctp-text)",
                }}>
                  {tc.toolName}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--ctp-subtext0)" }}>
                  {formatMs(tc.durationMs)}
                </span>
                <span style={{ fontSize: "0.65rem", color: "var(--ctp-overlay0)" }}>
                  {isExpanded ? "▼" : "▶"}
                </span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: "0.4rem", marginLeft: "1rem" }}>
                  {tc.inputSummary && (
                    <div style={{ marginBottom: "0.3rem" }}>
                      <div style={{ fontSize: "0.6rem", color: "var(--ctp-overlay1)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.15rem" }}>
                        Input
                      </div>
                      <pre style={{
                        background: "rgba(30, 30, 46, 0.5)",
                        borderRadius: 4,
                        padding: "0.4rem 0.6rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        color: "var(--ctp-subtext1)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        margin: 0,
                        maxHeight: 200,
                        overflow: "auto",
                      }}>
                        {tc.inputSummary}
                      </pre>
                    </div>
                  )}
                  {tc.outputSummary && (
                    <div>
                      <div style={{ fontSize: "0.6rem", color: "var(--ctp-overlay1)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.15rem" }}>
                        Output
                      </div>
                      <pre style={{
                        background: "rgba(30, 30, 46, 0.5)",
                        borderRadius: 4,
                        padding: "0.4rem 0.6rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        color: "var(--ctp-subtext1)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        margin: 0,
                        maxHeight: 200,
                        overflow: "auto",
                      }}>
                        {tc.outputSummary}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/SessionDrillDown.tsx
git commit -m "feat: add SessionDrillDown component with timeline and expandable details"
```

---

### Task 8: Wire Up AnalyticsTabs and SessionHistory

**Files:**
- Modify: `src/client/components/AnalyticsTabs.tsx`
- Modify: `src/client/components/SessionHistory.tsx`

- [ ] **Step 1: Add Tool Usage tab to AnalyticsTabs**

In `src/client/components/AnalyticsTabs.tsx`:

Add import:
```typescript
import { ToolUsageChart } from "./ToolUsageChart";
```

Add to the `tabs` array:
```typescript
{ key: "tools", label: "Tool Usage" },
```

Add the tab panel after the Rate Limits section (before the closing `</div>`):
```tsx
{/* Tool Usage */}
<div style={{ display: active === "tools" ? "block" : "none" }}>
  <ToolUsageChart period={period} />
</div>
```

- [ ] **Step 2: Add drill-down to SessionHistory**

In `src/client/components/SessionHistory.tsx`:

Add import:
```typescript
import { SessionDrillDown } from "./SessionDrillDown";
```

Add state for expanded session:
```typescript
const [expandedSession, setExpandedSession] = useState<string | null>(null);
```

Make the table row clickable by adding an `onClick` handler to the `<tr>`:
```tsx
<tr
  key={s.sessionId}
  className="session-row"
  onClick={() => setExpandedSession(expandedSession === s.sessionId ? null : s.sessionId)}
  style={{ cursor: "pointer" }}
>
```

Add the drill-down panel right after the `</tr>`:
```tsx
{expandedSession === s.sessionId && (
  <tr>
    <td colSpan={10} style={{ padding: 0, borderTop: "none" }}>
      <SessionDrillDown sessionId={s.sessionId} />
    </td>
  </tr>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/AnalyticsTabs.tsx src/client/components/SessionHistory.tsx
git commit -m "feat: wire Tool Usage tab and session drill-down into dashboard"
```

---

### Task 9: Update start.sh

**Files:**
- Modify: `scripts/start.sh`

- [ ] **Step 1: Add OTEL env vars to start.sh**

In `scripts/start.sh`, add these lines right before the `# Start the server` comment:

```bash
# Auto-enable OTEL tracing for Claude Code
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:${PORT}"
export OTEL_LOG_USER_PROMPTS=true
export OTEL_LOG_TOOL_DETAILS=true
export OTEL_LOG_TOOL_CONTENT=true
```

- [ ] **Step 2: Commit**

```bash
git add scripts/start.sh
git commit -m "feat: auto-enable OTEL tracing env vars in start.sh"
```

---

### Task 10: Integration Test and Manual Verification

**Files:** None new

- [ ] **Step 1: Run all tests**

Run: `cd /Users/kennetkusk/code/claude-monitoring && bun test`
Expected: All PASS

- [ ] **Step 2: Start the dev server**

Run: `cd /Users/kennetkusk/code/claude-monitoring && kill $(lsof -ti :4500) 2>/dev/null; PORT=4500 bun run src/server.ts`

- [ ] **Step 3: Verify OTLP endpoint responds**

Run: `curl -s -X POST http://localhost:4500/v1/traces -H 'Content-Type: application/json' -d '{"resourceSpans":[]}' | head`
Expected: `{"partialSuccess":{}}`

- [ ] **Step 4: Verify new API endpoints respond**

Run:
```bash
curl -s http://localhost:4500/api/stats/tools?period=today | head
curl -s http://localhost:4500/api/stats/prompts?period=today | head
curl -s http://localhost:4500/api/stats/tools/timeline?period=today | head
```
Expected: JSON responses (may be empty if no OTEL data yet)

- [ ] **Step 5: Open dashboard in browser and verify Tool Usage tab exists**

Open `http://localhost:4500` in a browser. Verify:
- "Tool Usage" tab appears in Analytics section
- Clicking it shows the empty-state message (no OTEL data yet)
- Session History rows are clickable and show drill-down panel

- [ ] **Step 6: Send test OTEL data and verify it appears**

Run:
```bash
curl -s -X POST http://localhost:4500/v1/traces -H 'Content-Type: application/json' -d '{
  "resourceSpans": [{
    "resource": {"attributes": [{"key": "session.id", "value": {"stringValue": "test-session"}}]},
    "scopeSpans": [{"spans": [{
      "traceId": "abc123", "spanId": "def456", "name": "tool_use", "kind": 1,
      "startTimeUnixNano": "'$(python3 -c "import time; print(int(time.time()*1e9))")'",
      "endTimeUnixNano": "'$(python3 -c "import time; print(int((time.time()+1.5)*1e9))")'",
      "status": {"code": 0},
      "attributes": [
        {"key": "tool.name", "value": {"stringValue": "Bash"}},
        {"key": "tool.input", "value": {"stringValue": "ls -la"}},
        {"key": "tool.output", "value": {"stringValue": "total 42"}}
      ]
    }]}]
  }]
}'
```

Refresh the Tool Usage tab — should now show 1 Bash call.

- [ ] **Step 7: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: integration test adjustments"
```
