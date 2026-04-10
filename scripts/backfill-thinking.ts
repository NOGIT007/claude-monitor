#!/usr/bin/env bun
/**
 * Backfill thinking_turns for existing token_usage rows.
 * Scans all JSONL session files and matches entries to existing DB rows
 * by (session_id, timestamp) to update thinking_turns.
 */
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const dbPath = join(import.meta.dir, "../data/monitor.db");
const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

// Ensure column exists
try {
  db.exec("ALTER TABLE token_usage ADD COLUMN thinking_turns INTEGER NOT NULL DEFAULT 0");
} catch { /* already exists */ }

const projectsDir = join(homedir(), ".claude", "projects");
let updated = 0;
let scanned = 0;

const update = db.prepare(
  `UPDATE token_usage SET thinking_turns = ?
   WHERE session_id = ? AND timestamp = ? AND thinking_turns = 0`,
);

function scanDir(dir: string) {
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as any;
  } catch {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.name.endsWith(".jsonl")) {
      processFile(fullPath);
    }
  }
}

function processFile(filePath: string) {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    scanned++;

    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const usage = entry?.message?.usage;
    if (!usage) continue;

    const sessionId = entry.sessionId;
    const timestamp = entry.timestamp;
    if (!sessionId || !timestamp) continue;

    const contentBlocks: any[] = entry?.message?.content ?? [];
    const thinkingTurns = contentBlocks.filter((c: any) => c.type === "thinking").length;

    if (thinkingTurns > 0) {
      const result = update.run(thinkingTurns, sessionId, timestamp);
      if (result.changes > 0) updated++;
    }
  }
}

console.log(`Scanning ${projectsDir}...`);
scanDir(projectsDir);
console.log(`Scanned ${scanned} JSONL lines, updated ${updated} rows with thinking_turns.`);
