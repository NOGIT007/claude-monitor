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
