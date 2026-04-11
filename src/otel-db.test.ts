import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
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

describe("otel inserts and queries", () => {
  let db: Database;

  beforeEach(() => {
    cleanUp();
    db = initDb(TEST_DB);

    insertOtelSpan(db, {
      spanId: "span-1", traceId: "trace-1", parentSpanId: "", sessionId: "s1",
      name: "interaction", kind: 1, startTime: "2026-04-11T10:00:00.000Z",
      endTime: "2026-04-11T10:00:05.000Z", durationMs: 5000, status: 0, attributes: "{}",
    });

    insertOtelSpan(db, {
      spanId: "span-2", traceId: "trace-1", parentSpanId: "span-1", sessionId: "s1",
      name: "tool_use", kind: 1, startTime: "2026-04-11T10:00:01.000Z",
      endTime: "2026-04-11T10:00:02.500Z", durationMs: 1500, status: 0, attributes: '{"tool.name":"Bash"}',
    });

    insertOtelToolCall(db, {
      spanId: "span-2", sessionId: "s1", toolName: "Bash",
      timestamp: "2026-04-11T10:00:01.000Z", durationMs: 1500,
      inputSummary: "ls -la", outputSummary: "total 42...", status: 0,
    });

    insertOtelPrompt(db, {
      spanId: "span-1", sessionId: "s1", timestamp: "2026-04-11T10:00:00.000Z",
      promptText: "List the files in this directory", tokenCount: 8,
    });
  });

  afterEach(() => { db.close(); cleanUp(); });

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
