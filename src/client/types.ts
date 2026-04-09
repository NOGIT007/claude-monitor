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

export interface ProjectStats {
  projectPath: string;
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
}

export interface ModelStats {
  model: string;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
}

export interface HourStats {
  hour: number;
  totalTokens: number;
  totalCost: number;
}

export interface SessionsSummary {
  totalSessions: number;
  avgDurationMs: number;
  longestDurationMs: number;
  avgCostPerSession: number;
}

export interface Comparison {
  current: PeriodStats;
  previous: PeriodStats;
}

export interface CumulativeCostEntry {
  date: string;
  dailyCost: number;
  cumulativeCost: number;
}
