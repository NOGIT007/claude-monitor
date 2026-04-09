#!/usr/bin/env bun
/**
 * Backfills historical session data from ~/.claude/projects/ JSONL logs
 * into the SQLite monitor.db.
 *
 * Usage: bun run scripts/backfill.ts
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { initDb, upsertSession, insertTokenUsage } from "../src/db";
import { calculateCost } from "../src/pricing";

const projectsDir = join(homedir(), ".claude", "projects");
const db = initDb();

// Use a transaction for speed
let totalFiles = 0;
let totalRecords = 0;
let skipped = 0;

// Get existing session IDs with their last token_usage timestamp to avoid full re-import
const existingUsage = new Map<string, string>();
const rows = db
  .query("SELECT session_id, MAX(timestamp) as last_ts FROM token_usage GROUP BY session_id")
  .all() as { session_id: string; last_ts: string }[];
for (const r of rows) {
  existingUsage.set(r.session_id, r.last_ts);
}
console.log(`📦 Found ${existingUsage.size} sessions already in DB`);

// Find all JSONL files
const projectDirs = readdirSync(projectsDir, { withFileTypes: true });
const jsonlFiles: string[] = [];

for (const dir of projectDirs) {
  if (!dir.isDirectory()) continue;
  const dirPath = join(projectsDir, dir.name);
  try {
    const files = readdirSync(dirPath);
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      jsonlFiles.push(join(dirPath, file));
    }
  } catch {
    // skip unreadable dirs
  }
}

console.log(`📂 Found ${jsonlFiles.length} JSONL files to scan`);

// Process in batches using transactions
const BATCH_SIZE = 500;
let batchCount = 0;

db.run("BEGIN TRANSACTION");

for (const filePath of jsonlFiles) {
  try {
    const stat = statSync(filePath);
    if (stat.size < 50) continue; // skip tiny files

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const usage = entry?.message?.usage;
      if (!usage) continue;

      const sessionId: string = entry.sessionId;
      const timestamp: string = entry.timestamp;
      if (!sessionId || !timestamp) continue;

      // Skip if we already have this data
      const lastTs = existingUsage.get(sessionId);
      if (lastTs && timestamp <= lastTs) continue;

      const cwd: string = entry.cwd ?? "";
      const model: string = entry.message?.model ?? "unknown";

      const input = usage.input_tokens ?? 0;
      const output = usage.output_tokens ?? 0;
      const cacheWrite = usage.cache_creation_input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;

      const cost = calculateCost(model, input, output, cacheWrite, cacheRead);

      upsertSession(db, sessionId, cwd, model, timestamp);
      insertTokenUsage(db, sessionId, timestamp, input, output, cacheWrite, cacheRead, cost);

      totalRecords++;
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        db.run("COMMIT");
        db.run("BEGIN TRANSACTION");
        batchCount = 0;
      }
    }

    totalFiles++;
  } catch {
    skipped++;
  }
}

db.run("COMMIT");

console.log(`\n✅ Backfill complete:`);
console.log(`   Files processed: ${totalFiles}`);
console.log(`   Records inserted: ${totalRecords}`);
console.log(`   Files skipped: ${skipped}`);

// Show summary
const summary = db
  .query(
    `SELECT
       COUNT(DISTINCT session_id) AS sessions,
       MIN(timestamp) AS earliest,
       MAX(timestamp) AS latest,
       COUNT(*) AS total_records
     FROM token_usage`,
  )
  .get() as any;

console.log(`\n📊 Database now contains:`);
console.log(`   Sessions: ${summary.sessions}`);
console.log(`   Records: ${summary.total_records}`);
console.log(`   Date range: ${summary.earliest?.slice(0, 10)} → ${summary.latest?.slice(0, 10)}`);
