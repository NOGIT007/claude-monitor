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
  entrypoint?: string;
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

export interface SessionHistoryEntry {
  sessionId: string;
  projectPath: string;
  model: string;
  effort?: string;
  startedAt: string;
  durationMs: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

/** Matches db.ts ActivityDay — keep in sync */
export interface ActivityDay {
  date: string;
  count: number;
  cost: number;
}

export type AnalyticsTab = "tokens" | "workflow" | "productivity" | "thinking" | "ratelimits" | "tools";

export interface RateLimitTimelineEntry {
  captured_at: string;
  session_id: string;
  model: string;
  session_pct: number;
  weekly_pct: number;
}

export interface StopoutEvent {
  session_id: string;
  model: string;
  peak_session_pct: number;
  peak_weekly_pct: number;
  first_seen: string;
  last_seen: string;
  duration_min: number;
  snapshots: number;
}

export interface SessionBurnRate {
  session_id: string;
  model: string;
  start_pct: number;
  end_pct: number;
  duration_min: number;
  burn_rate_per_min: number;
  first_seen: string;
}

export interface RateLimitStats {
  totalSnapshots: number;
  totalSessions: number;
  stopoutSessions: number;
  avgPeakSessionPct: number;
  maxSessionPct: number;
  avgBurnRatePerMin: number;
  currentSessionPct: number | null;
  currentWeeklyPct: number | null;
}

export interface RateLimitData {
  stats: RateLimitStats;
  timeline: RateLimitTimelineEntry[];
  stopouts: StopoutEvent[];
  burnRates: SessionBurnRate[];
}

export interface ThinkingDepthEntry {
  date: string;
  totalMessages: number;
  thinkingMessages: number;
  thinkingRate: number;
  avgOutputTokens: number;
  avgOutputPerThinking: number;
}

export interface CumulativeCostEntry {
  date: string;
  dailyCost: number;
  cumulativeCost: number;
}

// OTEL trace types

export interface OtelSpan {
  spanId: string;
  traceId: string;
  parentSpanId: string;
  name: string;
  kind: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: number;
  attributes: string;
}

export interface OtelToolCall {
  id: number;
  spanId: string;
  toolName: string;
  timestamp: string;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
  status: number;
}

export interface OtelPrompt {
  id: number;
  spanId: string;
  timestamp: string;
  promptText: string;
  tokenCount: number;
}

export interface SessionTrace {
  spans: OtelSpan[];
  toolCalls: OtelToolCall[];
  prompts: OtelPrompt[];
}

export interface ToolStatsEntry {
  name: string;
  count: number;
  avgDurationMs: number;
  errorRate: number;
  totalDurationMs: number;
}

export interface ToolStatsResult {
  tools: ToolStatsEntry[];
  totalCalls: number;
  totalDurationMs: number;
}

export interface ToolTimelineEntry {
  bucket: string;
  toolName: string;
  count: number;
}

export interface PromptStatsResult {
  totalPrompts: number;
  avgLength: number;
  promptsPerSession: number;
}
