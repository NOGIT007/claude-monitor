import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  initDb,
  upsertSession,
  insertTokenUsage,
  getActiveSessions,
  getStats,
  getHistory,
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

      const sessions = getActiveSessions(db, 30);
      expect(sessions.length).toBe(1);
      expect(sessions[0].session_id).toBe("active-1");
      expect(sessions[0].total_input).toBe(100);
      expect(sessions[0].total_output).toBe(50);
      expect(sessions[0].total_cost).toBeCloseTo(0.05);
    });

    it("returns empty array when no active sessions", () => {
      const old = "2020-01-01T00:00:00.000Z";
      upsertSession(db, "stale-1", "/p", "opus-4", old);
      const sessions = getActiveSessions(db, 30);
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
});
