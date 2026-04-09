export interface SessionTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

export interface ActiveSession {
  sessionId: string;
  projectPath: string;
  model: string;
  elapsedMs: number;
  totals: SessionTotals;
}

export interface PeriodStats {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  sessionCount: number;
}

export interface DayEntry {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface WsMessage {
  type: "session_update";
  sessionId: string;
  projectPath: string;
  model: string;
  elapsedMs: number;
  totals: SessionTotals;
}
