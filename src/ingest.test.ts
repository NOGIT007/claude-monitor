import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { processLine, processBuffer } from "./ingest";
import { initDb } from "./db";
import { calculateCost } from "./pricing";

function makeDb(): Database {
  return initDb(":memory:");
}

const validEntry = {
  type: "assistant",
  sessionId: "c8c3e586-test-1234",
  timestamp: "2026-04-09T16:09:23.451Z",
  cwd: "/Users/me/code/myproject",
  message: {
    model: "claude-sonnet-4-6",
    usage: {
      input_tokens: 3,
      cache_creation_input_tokens: 21092,
      cache_read_input_tokens: 0,
      output_tokens: 285,
    },
  },
};

describe("processLine", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("returns SessionUpdate for valid assistant message with usage", () => {
    const result = processLine(db, JSON.stringify(validEntry));

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("c8c3e586-test-1234");
    expect(result!.projectPath).toBe("/Users/me/code/myproject");
    expect(result!.model).toBe("claude-sonnet-4-6");
    expect(result!.timestamp).toBe("2026-04-09T16:09:23.451Z");
    expect(result!.usage.input).toBe(3);
    expect(result!.usage.output).toBe(285);
    expect(result!.usage.cacheWrite).toBe(21092);
    expect(result!.usage.cacheRead).toBe(0);
    expect(result!.usage.cost).toBeGreaterThan(0);
  });

  it("returns null when message.usage is missing", () => {
    const entry = {
      type: "user",
      sessionId: "abc",
      timestamp: "2026-04-09T16:09:23.451Z",
      message: { role: "user", content: "hello" },
    };
    expect(processLine(db, JSON.stringify(entry))).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(processLine(db, "not json at all{")).toBeNull();
  });

  it("returns null for empty line", () => {
    expect(processLine(db, "")).toBeNull();
    expect(processLine(db, "   ")).toBeNull();
  });

  it("calculates cost correctly against known pricing", () => {
    const result = processLine(db, JSON.stringify(validEntry))!;
    const expectedCost = calculateCost(
      "claude-sonnet-4-6",
      3,    // input
      285,  // output
      21092, // cacheWrite
      0,     // cacheRead
    );
    expect(result.usage.cost).toBeCloseTo(expectedCost, 10);

    // Verify the expected cost manually:
    // input:      3 / 1M * 3.0     = 0.000009
    // output:   285 / 1M * 15.0    = 0.004275
    // cacheW: 21092 / 1M * 3.75    = 0.079095
    // cacheR:     0 / 1M * 0.3     = 0.0
    // total = 0.083379
    expect(result.usage.cost).toBeCloseTo(0.083379, 5);
  });
});

describe("processBuffer", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("handles multiple lines including skippable ones", () => {
    const lines = [
      JSON.stringify(validEntry),
      JSON.stringify({ type: "user", sessionId: "x", message: {} }),
      "",
      JSON.stringify({
        ...validEntry,
        sessionId: "second-session",
      }),
    ].join("\n");

    const results = processBuffer(db, lines);
    expect(results).toHaveLength(2);
    expect(results[0].sessionId).toBe("c8c3e586-test-1234");
    expect(results[1].sessionId).toBe("second-session");
  });

  it("returns empty array for empty buffer", () => {
    expect(processBuffer(db, "")).toEqual([]);
  });
});
