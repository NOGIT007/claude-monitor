import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Database } from "bun:sqlite";
import { initDb } from "./db";
import { startWatcher } from "./watcher";

function makeDb(): Database {
  return initDb(":memory:");
}

const validEntry = {
  type: "assistant",
  sessionId: "watcher-test-session",
  timestamp: "2026-04-09T16:09:23.451Z",
  cwd: "/Users/me/code/myproject",
  message: {
    model: "claude-sonnet-4-6",
    usage: {
      input_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 50,
    },
  },
};

describe("watcher", () => {
  let tmpDir: string;
  let db: Database;
  let watcher: ReturnType<typeof startWatcher>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "watcher-test-"));
    db = makeDb();
  });

  afterEach(() => {
    watcher?.close();
  });

  it("initial scan records file sizes in offsets", () => {
    const subDir = join(tmpDir, "proj", "sub");
    mkdirSync(subDir, { recursive: true });

    const jsonlFile = join(subDir, "session.jsonl");
    writeFileSync(jsonlFile, JSON.stringify(validEntry) + "\n");

    watcher = startWatcher({ db, watchPath: tmpDir });

    // The offset should equal the file size, meaning old data won't be reprocessed
    expect(watcher._offsets.get(jsonlFile)).toBeGreaterThan(0);

    // DB should have no records since initial scan only records sizes, doesn't process
    const rows = db.query("SELECT * FROM sessions").all();
    expect(rows).toHaveLength(0);
  });

  it("processes new bytes appended after watcher starts", async () => {
    const subDir = join(tmpDir, "proj");
    mkdirSync(subDir, { recursive: true });

    const jsonlFile = join(subDir, "session.jsonl");
    writeFileSync(jsonlFile, ""); // empty file

    watcher = startWatcher({ db, watchPath: tmpDir });

    // Append a valid JSONL entry
    appendFileSync(jsonlFile, JSON.stringify(validEntry) + "\n");

    // fs.watch is async; wait a bit for the event to fire
    await new Promise((resolve) => setTimeout(resolve, 300));

    const sessions = db.query("SELECT * FROM sessions").all() as any[];
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0].session_id).toBe("watcher-test-session");

    const usage = db.query("SELECT * FROM token_usage").all() as any[];
    expect(usage.length).toBeGreaterThanOrEqual(1);
    expect(usage[0].input_tokens).toBe(100);
    expect(usage[0].output_tokens).toBe(50);
  });

  it("ignores non-jsonl files", async () => {
    const subDir = join(tmpDir, "proj");
    mkdirSync(subDir, { recursive: true });

    watcher = startWatcher({ db, watchPath: tmpDir });

    const txtFile = join(subDir, "notes.txt");
    writeFileSync(txtFile, JSON.stringify(validEntry) + "\n");

    await new Promise((resolve) => setTimeout(resolve, 300));

    const sessions = db.query("SELECT * FROM sessions").all();
    expect(sessions).toHaveLength(0);
  });

  it("close() stops watching without errors", () => {
    mkdirSync(join(tmpDir, "proj"), { recursive: true });
    watcher = startWatcher({ db, watchPath: tmpDir });
    expect(() => watcher.close()).not.toThrow();
  });
});
