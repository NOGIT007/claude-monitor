import { Database } from "bun:sqlite";
import { upsertSession, insertTokenUsage } from "./db";
import { calculateCost } from "./pricing";

export interface SessionUpdate {
  sessionId: string;
  projectPath: string;
  model: string;
  timestamp: string;
  usage: {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
    cost: number;
  };
}

export function processLine(db: Database, line: string): SessionUpdate | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let entry: any;
  try {
    entry = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const usage = entry?.message?.usage;
  if (!usage) return null;

  const sessionId: string = entry.sessionId;
  const timestamp: string = entry.timestamp;
  const cwd: string = entry.cwd ?? "";
  const rawModel: string | undefined = entry.message.model;
  if (!rawModel) {
    console.warn("[ingest] Missing model in entry, defaulting to claude-sonnet-4-6");
  }
  const model: string = rawModel ?? "claude-sonnet-4-6";

  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  const content: any[] = entry?.message?.content ?? [];
  const thinkingTurns = content.filter((c: any) => c.type === "thinking").length;

  const cost = calculateCost(model, input, output, cacheWrite, cacheRead);

  upsertSession(db, sessionId, cwd, model, timestamp);
  insertTokenUsage(db, sessionId, timestamp, input, output, cacheWrite, cacheRead, cost, thinkingTurns);

  return {
    sessionId,
    projectPath: cwd,
    model,
    timestamp,
    usage: { input, output, cacheWrite, cacheRead, cost },
  };
}

export function processBuffer(db: Database, buffer: string): SessionUpdate[] {
  return buffer
    .split("\n")
    .map((line) => processLine(db, line))
    .filter((update): update is SessionUpdate => update !== null);
}
