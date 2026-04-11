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

  beforeEach(() => { cleanUp(); db = initDb(TEST_DB); });
  afterEach(() => { db.close(); cleanUp(); });

  it("ingests a trace span into otel_spans", async () => {
    const payload = {
      resourceSpans: [{
        resource: { attributes: [{ key: "session.id", value: { stringValue: "sess-abc" } }] },
        scopeSpans: [{ spans: [{
          traceId: "t1", spanId: "s1", parentSpanId: "", name: "interaction", kind: 1,
          startTimeUnixNano: String(Date.now() * 1e6),
          endTimeUnixNano: String((Date.now() + 5000) * 1e6),
          status: { code: 0 }, attributes: [],
        }] }],
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
        resource: { attributes: [{ key: "session.id", value: { stringValue: "sess-abc" } }] },
        scopeSpans: [{ spans: [{
          traceId: "t1", spanId: "s2", parentSpanId: "s1", name: "tool_use", kind: 1,
          startTimeUnixNano: String(Date.now() * 1e6),
          endTimeUnixNano: String((Date.now() + 1500) * 1e6),
          status: { code: 0 },
          attributes: [
            { key: "tool.name", value: { stringValue: "Read" } },
            { key: "tool.input", value: { stringValue: "/src/db.ts" } },
            { key: "tool.output", value: { stringValue: "file contents here..." } },
          ],
        }] }],
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
        resource: { attributes: [{ key: "session.id", value: { stringValue: "sess-abc" } }] },
        scopeSpans: [{ spans: [{
          traceId: "t1", spanId: "s3", parentSpanId: "", name: "interaction", kind: 1,
          startTimeUnixNano: String(Date.now() * 1e6),
          endTimeUnixNano: String((Date.now() + 3000) * 1e6),
          status: { code: 0 },
          attributes: [
            { key: "user.prompt", value: { stringValue: "Fix the bug in db.ts" } },
            { key: "user.prompt.token_count", value: { intValue: "7" } },
          ],
        }] }],
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
