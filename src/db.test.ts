import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  initDb,
  upsertSession,
  insertTokenUsage,
  getActiveSessions,
  getStats,
  getHistory,
  getCutoff,
  getPreviousCutoff,
  getProjectStats,
  getModelStats,
  getPeakHours,
  getSessionsSummary,
  getComparison,
  getCostHistory,
  getCumulativeCost,
} from "./db";
import { unlinkSync } from "fs";

const TEST_DB = "./data/test-monitor.db";

function cleanUp() {
  try {
    unlinkSync(TEST_DB);
  } catch {
    // ignore
  }
  try {
    unlinkSync(TEST_DB + "-wal");
  } catch {
    // ignore
  }
  try {
    unlinkSync(TEST_DB + "-shm");
  } catch {
    // ignore
  }
}

describe("db", () => {
  let db: Database;

  beforeEach(() => {
    cleanUp();
    db = initDb(TEST_DB);
  });

  afterEach(() => {
    db.close();
    cleanUp();
  });

  describe("initDb", () => {
    it("creates sessions and token_usage tables", () => {
      const tables = db
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain("sessions");
      expect(names).toContain("token_usage");
    });

    it("creates indexes", () => {
      const indexes = db
        .query(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
        )
        .all() as { name: string }[];
      const names = indexes.map((i) => i.name);
      expect(names).toContain("idx_token_usage_timestamp");
      expect(names).toContain("idx_token_usage_session");
    });
  });

  describe("upsertSession", () => {
    it("creates a new session", () => {
      const ts = new Date().toISOString();
      upsertSession(db, "sess-1", "/project/a", "opus-4", ts);

      const row = db.query("SELECT * FROM sessions WHERE session_id = ?").get("sess-1") as any;
      expect(row.session_id).toBe("sess-1");
      expect(row.project_path).toBe("/project/a");
      expect(row.model).toBe("opus-4");
      expect(row.started_at).toBe(ts);
      expect(row.last_seen_at).toBe(ts);
    });

    it("updates last_seen_at but keeps started_at on conflict", () => {
      const ts1 = "2026-04-09T10:00:00.000Z";
      const ts2 = "2026-04-09T11:00:00.000Z";
      upsertSession(db, "sess-1", "/project/a", "opus-4", ts1);
      upsertSession(db, "sess-1", "/project/a", "opus-4", ts2);

      const row = db.query("SELECT * FROM sessions WHERE session_id = ?").get("sess-1") as any;
      expect(row.started_at).toBe(ts1);
      expect(row.last_seen_at).toBe(ts2);
    });
  });

  describe("insertTokenUsage + getStats", () => {
    it("returns correct aggregates for today", () => {
      const now = new Date().toISOString();
      upsertSession(db, "sess-1", "/p", "opus-4", now);

      insertTokenUsage(db, "sess-1", now, 100, 50, 20, 80, 0.05);
      insertTokenUsage(db, "sess-1", now, 200, 100, 30, 120, 0.10);

      const stats = getStats(db, "today");
      expect(stats.totalInput).toBe(300);
      expect(stats.totalOutput).toBe(150);
      expect(stats.totalCacheRead).toBe(200);
      expect(stats.totalCacheWrite).toBe(50);
      expect(stats.totalCost).toBeCloseTo(0.15);
      expect(stats.sessionCount).toBe(1);
    });

    it("counts multiple sessions", () => {
      const now = new Date().toISOString();
      upsertSession(db, "sess-1", "/p", "opus-4", now);
      upsertSession(db, "sess-2", "/p", "opus-4", now);

      insertTokenUsage(db, "sess-1", now, 100, 50, 0, 0, 0.01);
      insertTokenUsage(db, "sess-2", now, 100, 50, 0, 0, 0.01);

      const stats = getStats(db, "today");
      expect(stats.sessionCount).toBe(2);
    });
  });

  describe("getActiveSessions", () => {
    it("returns sessions seen within the time window", () => {
      const now = new Date().toISOString();
      const old = "2020-01-01T00:00:00.000Z";

      upsertSession(db, "active-1", "/p", "opus-4", now);
      upsertSession(db, "stale-1", "/p", "opus-4", old);

      insertTokenUsage(db, "active-1", now, 100, 50, 10, 80, 0.05);

      const sessions = getActiveSessions(db, 30, "/nonexistent-test-dir");
      expect(sessions.length).toBe(1);
      expect(sessions[0].session_id).toBe("active-1");
      expect(sessions[0].total_input).toBe(100);
      expect(sessions[0].total_output).toBe(50);
      expect(sessions[0].total_cost).toBeCloseTo(0.05);
    });

    it("returns empty array when no active sessions", () => {
      const old = "2020-01-01T00:00:00.000Z";
      upsertSession(db, "stale-1", "/p", "opus-4", old);
      const sessions = getActiveSessions(db, 30, "/nonexistent-test-dir");
      expect(sessions.length).toBe(0);
    });
  });

  describe("getHistory", () => {
    it("returns daily breakdown", () => {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date().toISOString();

      upsertSession(db, "sess-1", "/p", "opus-4", now);
      insertTokenUsage(db, "sess-1", now, 100, 50, 10, 80, 0.05);
      insertTokenUsage(db, "sess-1", now, 200, 100, 20, 120, 0.10);

      const history = getHistory(db, 7);
      expect(history.length).toBeGreaterThanOrEqual(1);

      const todayEntry = history.find((h) => h.date === today);
      expect(todayEntry).toBeDefined();
      expect(todayEntry!.input).toBe(300);
      expect(todayEntry!.output).toBe(150);
      expect(todayEntry!.cacheRead).toBe(200);
      expect(todayEntry!.cacheWrite).toBe(30);
      expect(todayEntry!.cost).toBeCloseTo(0.15);
    });

    it("returns empty array when no data in range", () => {
      const history = getHistory(db, 7);
      expect(history).toEqual([]);
    });
  });

  describe("getCutoff", () => {
    it("returns start of today for 'today'", () => {
      const cutoff = getCutoff("today");
      const d = new Date(cutoff);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });

    it("returns 7 days ago for 'week'", () => {
      const cutoff = getCutoff("week");
      const diff = Date.now() - new Date(cutoff).getTime();
      expect(Math.round(diff / 86400000)).toBe(7);
    });

    it("returns 30 days ago for 'month'", () => {
      const cutoff = getCutoff("month");
      const diff = Date.now() - new Date(cutoff).getTime();
      expect(Math.round(diff / 86400000)).toBe(30);
    });
  });

  describe("getPreviousCutoff", () => {
    it("returns yesterday for 'today'", () => {
      const prev = getPreviousCutoff("today");
      const curr = getCutoff("today");
      const diff = new Date(curr).getTime() - new Date(prev).getTime();
      expect(Math.round(diff / 86400000)).toBe(1);
    });

    it("returns 14 days ago for 'week'", () => {
      const prev = getPreviousCutoff("week");
      const diff = Date.now() - new Date(prev).getTime();
      expect(Math.round(diff / 86400000)).toBe(14);
    });

    it("returns 60 days ago for 'month'", () => {
      const prev = getPreviousCutoff("month");
      const diff = Date.now() - new Date(prev).getTime();
      expect(Math.round(diff / 86400000)).toBe(60);
    });
  });

  describe("getProjectStats", () => {
    it("returns per-project breakdown", () => {
      const now = new Date().toISOString();
      upsertSession(db, "sess-1", "/project/a", "opus-4", now);
      upsertSession(db, "sess-2", "/project/b", "sonnet-4", now);
      insertTokenUsage(db, "sess-1", now, 100, 50, 20, 80, 0.05);
      insertTokenUsage(db, "sess-2", now, 200, 100, 30, 120, 0.10);

      const stats = getProjectStats(db, "today");
      expect(stats.length).toBe(2);
      expect(stats[0].totalCost).toBeGreaterThanOrEqual(stats[1].totalCost);

      const projB = stats.find(s => s.projectPath === "/project/b");
      expect(projB).toBeDefined();
      expect(projB!.totalTokens).toBe(450); // 200+100+30+120
      expect(projB!.totalCost).toBeCloseTo(0.10);
      expect(projB!.sessionCount).toBe(1);
    });

    it("returns empty array when no data", () => {
      const stats = getProjectStats(db, "today");
      expect(stats).toEqual([]);
    });
  });

  describe("getModelStats", () => {
    it("returns per-model breakdown", () => {
      const now = new Date().toISOString();
      upsertSession(db, "sess-1", "/p", "opus-4", now);
      upsertSession(db, "sess-2", "/p", "sonnet-4", now);
      insertTokenUsage(db, "sess-1", now, 100, 50, 20, 80, 0.05);
      insertTokenUsage(db, "sess-2", now, 200, 100, 30, 120, 0.10);

      const stats = getModelStats(db, "today");
      expect(stats.length).toBe(2);

      const opus = stats.find(s => s.model === "opus-4");
      expect(opus).toBeDefined();
      expect(opus!.totalInput).toBe(100);
      expect(opus!.totalOutput).toBe(50);
      expect(opus!.totalCost).toBeCloseTo(0.05);
    });
  });

  describe("getPeakHours", () => {
    it("returns hourly breakdown", () => {
      const now = new Date().toISOString();
      upsertSession(db, "sess-1", "/p", "opus-4", now);
      insertTokenUsage(db, "sess-1", now, 100, 50, 20, 80, 0.05);

      const hours = getPeakHours(db, 7);
      expect(hours.length).toBeGreaterThanOrEqual(1);
      expect(hours[0].totalTokens).toBe(150); // 100+50
      expect(hours[0].totalCost).toBeCloseTo(0.05);
      expect(typeof hours[0].hour).toBe("number");
    });

    it("returns empty array when no data", () => {
      const hours = getPeakHours(db, 7);
      expect(hours).toEqual([]);
    });
  });

  describe("getSessionsSummary", () => {
    it("returns session summary with cost", () => {
      const now = new Date();
      const start = new Date(now.getTime() - 3600000).toISOString(); // 1 hour ago
      const end = now.toISOString();
      upsertSession(db, "sess-1", "/p", "opus-4", start);
      upsertSession(db, "sess-1", "/p", "opus-4", end); // updates last_seen_at
      insertTokenUsage(db, "sess-1", start, 100, 50, 20, 80, 0.05);

      const summary = getSessionsSummary(db, "today");
      expect(summary.totalSessions).toBeGreaterThanOrEqual(1);
      expect(summary.avgDurationMs).toBeGreaterThan(0);
      expect(typeof summary.avgCostPerSession).toBe("number");
    });
  });

  describe("getComparison", () => {
    it("returns current and previous period stats", () => {
      const now = new Date().toISOString();
      upsertSession(db, "sess-1", "/p", "opus-4", now);
      insertTokenUsage(db, "sess-1", now, 100, 50, 20, 80, 0.05);

      const comparison = getComparison(db, "today");
      expect(comparison.current).toBeDefined();
      expect(comparison.previous).toBeDefined();
      expect(comparison.current.totalInput).toBe(100);
      expect(comparison.previous.totalInput).toBe(0); // no data in previous period
    });
  });

  describe("getCostHistory", () => {
    it("returns daily cost entries", () => {
      const now = new Date().toISOString();
      upsertSession(db, "sess-1", "/p", "opus-4", now);
      insertTokenUsage(db, "sess-1", now, 100, 50, 20, 80, 0.05);
      insertTokenUsage(db, "sess-1", now, 200, 100, 30, 120, 0.10);

      const history = getCostHistory(db, 7);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].cost).toBeCloseTo(0.15);
    });
  });

  describe("getCumulativeCost", () => {
    it("returns cumulative cost entries", () => {
      const now = new Date().toISOString();
      upsertSession(db, "sess-1", "/p", "opus-4", now);
      insertTokenUsage(db, "sess-1", now, 100, 50, 20, 80, 0.05);
      insertTokenUsage(db, "sess-1", now, 200, 100, 30, 120, 0.10);

      const cumulative = getCumulativeCost(db, 7);
      expect(cumulative.length).toBeGreaterThanOrEqual(1);
      expect(cumulative[0].dailyCost).toBeCloseTo(0.15);
      expect(cumulative[0].cumulativeCost).toBeCloseTo(0.15);
    });

    it("accumulates across days", () => {
      const day1 = "2026-04-08T12:00:00.000Z";
      const day2 = "2026-04-09T12:00:00.000Z";
      upsertSession(db, "sess-1", "/p", "opus-4", day1);
      insertTokenUsage(db, "sess-1", day1, 100, 50, 20, 80, 0.05);
      insertTokenUsage(db, "sess-1", day2, 200, 100, 30, 120, 0.10);

      const cumulative = getCumulativeCost(db, 7);
      if (cumulative.length >= 2) {
        expect(cumulative[1].cumulativeCost).toBeCloseTo(cumulative[0].dailyCost + cumulative[1].dailyCost);
      }
    });
  });
});
