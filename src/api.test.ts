import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb, upsertSession, insertTokenUsage, insertOtelSpan, insertOtelToolCall, insertOtelPrompt } from "./db";
import { handleApiRequest } from "./api";
import { unlinkSync } from "fs";

const TEST_DB = "./data/test-api.db";

function cleanUp() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(TEST_DB + suffix);
    } catch {
      // ignore
    }
  }
}

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

const testApiOptions = { sessionsDir: "/nonexistent-test-dir" };

describe("api", () => {
  let db: Database;

  beforeEach(() => {
    cleanUp();
    db = initDb(TEST_DB);

    // Seed test data
    const now = new Date().toISOString();
    upsertSession(db, "sess-1", "/project/a", "opus-4", now);
    upsertSession(db, "sess-2", "/project/b", "sonnet-4", now);
    insertTokenUsage(db, "sess-1", now, 100, 50, 20, 80, 0.05);
    insertTokenUsage(db, "sess-1", now, 200, 100, 30, 120, 0.10);
    insertTokenUsage(db, "sess-2", now, 150, 75, 10, 60, 0.07);
  });

  afterEach(() => {
    db.close();
    cleanUp();
  });

  describe("GET /api/sessions", () => {
    it("returns active sessions array", async () => {
      const res = handleApiRequest(makeRequest("/api/sessions"), db, testApiOptions);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
      expect(res!.headers.get("Content-Type")).toBe("application/json");

      const data = await res!.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);

      const sess1 = data.find((s: any) => s.sessionId === "sess-1");
      expect(sess1).toBeDefined();
      expect(sess1.totals.input).toBe(300);
      expect(sess1.totals.output).toBe(150);
      expect(sess1.totals.costUsd).toBeCloseTo(0.15);
    });
  });

  describe("GET /api/stats", () => {
    it("/api/stats/today returns period stats", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/today"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(data.totalInput).toBe(450);
      expect(data.totalOutput).toBe(225);
      expect(data.totalCost).toBeCloseTo(0.22);
      expect(data.sessionCount).toBe(2);
    });

    it("/api/stats/week returns period stats", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/week"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(data.sessionCount).toBe(2);
    });

    it("/api/stats/month returns period stats", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/month"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(data.sessionCount).toBe(2);
    });

    it("returns 400 for invalid period", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/year"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(400);

      const data = await res!.json();
      expect(data.error).toContain("Invalid period");
    });
  });

  describe("GET /api/history", () => {
    it("returns daily entries with default 30 days", async () => {
      const res = handleApiRequest(makeRequest("/api/history"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);

      const today = new Date().toISOString().split("T")[0];
      const entry = data.find((d: any) => d.date === today);
      expect(entry).toBeDefined();
      expect(entry.input).toBe(450);
      expect(entry.output).toBe(225);
      expect(entry.cost).toBeCloseTo(0.22);
    });

    it("respects days query param", async () => {
      const res = handleApiRequest(makeRequest("/api/history?days=7"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /api/stats/projects", () => {
    it("returns per-project stats with default period", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/projects"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(data[0].projectPath).toBeDefined();
      expect(data[0].totalTokens).toBeGreaterThan(0);
    });

    it("accepts period query param", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/projects?period=week"), db);
      expect(res!.status).toBe(200);
      const data = await res!.json();
      expect(data.length).toBe(2);
    });

    it("returns 400 for invalid period", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/projects?period=year"), db);
      expect(res!.status).toBe(400);
    });
  });

  describe("GET /api/stats/models", () => {
    it("returns per-model stats", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/models"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      const opus = data.find((m: any) => m.model === "opus-4");
      expect(opus).toBeDefined();
      expect(opus.totalInput).toBe(300);
    });
  });

  describe("GET /api/stats/peak-hours", () => {
    it("returns hourly breakdown with default days", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/peak-hours"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(typeof data[0].hour).toBe("number");
    });

    it("accepts days query param", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/peak-hours?days=7"), db);
      expect(res!.status).toBe(200);
    });

    it("returns 400 for invalid days", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/peak-hours?days=abc"), db);
      expect(res!.status).toBe(400);
    });
  });

  describe("GET /api/stats/sessions-summary", () => {
    it("returns session summary", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/sessions-summary"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(data.totalSessions).toBeGreaterThanOrEqual(1);
      expect(typeof data.avgDurationMs).toBe("number");
      expect(typeof data.avgCostPerSession).toBe("number");
    });
  });

  describe("GET /api/stats/comparison", () => {
    it("returns current and previous period", async () => {
      const res = handleApiRequest(makeRequest("/api/stats/comparison"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(data.current).toBeDefined();
      expect(data.previous).toBeDefined();
      expect(data.current.totalInput).toBe(450);
    });
  });

  describe("GET /api/history/cost", () => {
    it("returns daily cost entries", async () => {
      const res = handleApiRequest(makeRequest("/api/history/cost"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0].cost).toBeGreaterThan(0);
    });

    it("accepts days query param", async () => {
      const res = handleApiRequest(makeRequest("/api/history/cost?days=7"), db);
      expect(res!.status).toBe(200);
    });
  });

  describe("GET /api/history/cumulative", () => {
    it("returns cumulative cost entries", async () => {
      const res = handleApiRequest(makeRequest("/api/history/cumulative"), db);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0].dailyCost).toBeGreaterThan(0);
      expect(data[0].cumulativeCost).toBeGreaterThan(0);
    });
  });

  describe("unknown paths", () => {
    it("returns null for non-API paths", () => {
      expect(handleApiRequest(makeRequest("/"), db)).toBeNull();
      expect(handleApiRequest(makeRequest("/index.html"), db)).toBeNull();
      expect(handleApiRequest(makeRequest("/api/unknown"), db)).toBeNull();
    });
  });

  describe("OTEL endpoints", () => {
    beforeEach(() => {
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
});
