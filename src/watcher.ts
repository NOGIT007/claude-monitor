import { watch, statSync, openSync, readSync, closeSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import type { Database } from "bun:sqlite";
import type { FSWatcher } from "fs";
import { processBuffer } from "./ingest";
import { broadcastSessionUpdate } from "./ws";
import { getSessionsByIds } from "./db";

export interface WatcherOptions {
  db: Database;
  watchPath?: string; // default: ~/.claude/projects
}

function scanExistingFiles(
  dir: string,
  offsets: Map<string, number>,
): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".jsonl")) continue;
      const parentPath =
        "parentPath" in entry
          ? (entry as any).parentPath
          : (entry as any).path;
      const fullPath = join(parentPath, entry.name);
      try {
        const stat = statSync(fullPath);
        offsets.set(fullPath, stat.size);
      } catch {
        // file may have disappeared
      }
    }
  } catch {
    // watch dir may not exist yet
  }
}

function readNewBytes(
  filePath: string,
  offsets: Map<string, number>,
): string | null {
  try {
    const stat = statSync(filePath);
    const currentOffset = offsets.get(filePath) ?? 0;

    if (stat.size <= currentOffset) {
      offsets.set(filePath, stat.size);
      return null;
    }

    const bytesToRead = stat.size - currentOffset;
    const buffer = Buffer.alloc(bytesToRead);
    const fd = openSync(filePath, "r");
    try {
      readSync(fd, buffer, 0, bytesToRead, currentOffset);
    } finally {
      closeSync(fd);
    }

    offsets.set(filePath, stat.size);
    return buffer.toString("utf-8");
  } catch {
    return null;
  }
}

function handleFileChange(
  db: Database,
  filePath: string,
  offsets: Map<string, number>,
): void {
  const newData = readNewBytes(filePath, offsets);
  if (!newData) return;

  const updates = processBuffer(db, newData);
  if (updates.length === 0) return;

  const sessionIds = [...new Set(updates.map((u) => u.sessionId))];
  const sessions = getSessionsByIds(db, sessionIds);

  for (const s of sessions) {
    broadcastSessionUpdate({
      sessionId: s.session_id,
      projectPath: s.project_path,
      model: s.model,
      startedAt: s.started_at,
      lastSeenAt: s.last_seen_at,
      totals: {
        input: s.total_input,
        output: s.total_output,
        cacheRead: s.total_cache_read,
        cacheWrite: s.total_cache_creation,
        costUsd: s.total_cost,
      },
    });
  }
}

export function startWatcher(options: WatcherOptions): { close: () => void } {
  const { db } = options;
  const watchPath = resolve(
    options.watchPath ?? join(homedir(), ".claude", "projects"),
  );
  const offsets = new Map<string, number>();

  // Record current sizes so we don't re-process old data
  scanExistingFiles(watchPath, offsets);

  let watcher: FSWatcher;
  try {
    watcher = watch(watchPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".jsonl")) return;

      const fullPath = join(watchPath, filename);
      try {
        handleFileChange(db, fullPath, offsets);
      } catch (err) {
        console.error(`[watcher] Error processing ${fullPath}:`, err);
      }
    });
  } catch (err) {
    console.error(`[watcher] Failed to watch ${watchPath}:`, err);
    return { close: () => {} };
  }

  watcher.on("error", (err) => {
    console.error("[watcher] FSWatcher error:", err);
  });

  return {
    close: () => {
      watcher.close();
    },
    /** Exposed for testing only */
    _offsets: offsets,
  };
}
