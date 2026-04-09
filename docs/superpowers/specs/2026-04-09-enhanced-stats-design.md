# Enhanced Stats Features — Design Spec

**Date:** 2026-04-09
**Status:** Approved

---

## Overview

Add 10 new statistical features to the Claude Monitor dashboard, organized into new API endpoints, DB queries, and React components. All features build on the existing `sessions` + `token_usage` schema — no schema changes needed.

---

## New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/stats/projects?period=today\|week\|month` | Cost & tokens grouped by project |
| `GET` | `/api/stats/models?period=today\|week\|month` | Cost & tokens grouped by model |
| `GET` | `/api/stats/peak-hours?days=30` | Token usage grouped by hour of day (0-23) |
| `GET` | `/api/stats/sessions-summary?period=today\|week\|month` | Session count, avg duration, avg cost, longest session |
| `GET` | `/api/stats/comparison?period=today\|week\|month` | Current period stats + previous period stats for delta calculation |
| `GET` | `/api/history/cost?days=30` | Daily cost as separate series (for cost trend overlay) |
| `GET` | `/api/history/cumulative?days=30` | Running cumulative cost total per day |

---

## New DB Query Helpers

### `getProjectStats(db, period)`
```sql
SELECT
  s.project_path,
  COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS totalTokens,
  COALESCE(SUM(t.cost_usd), 0) AS totalCost,
  COUNT(DISTINCT t.session_id) AS sessionCount
FROM token_usage t
JOIN sessions s ON s.session_id = t.session_id
WHERE t.timestamp >= ?
GROUP BY s.project_path
ORDER BY totalCost DESC
```
Returns: `{ projectPath, projectName (basename), totalTokens, totalCost, sessionCount }[]`

### `getModelStats(db, period)`
```sql
SELECT
  s.model,
  COALESCE(SUM(t.input_tokens), 0) AS totalInput,
  COALESCE(SUM(t.output_tokens), 0) AS totalOutput,
  COALESCE(SUM(t.cache_read_tokens), 0) AS totalCacheRead,
  COALESCE(SUM(t.cache_creation_tokens), 0) AS totalCacheWrite,
  COALESCE(SUM(t.cost_usd), 0) AS totalCost
FROM token_usage t
JOIN sessions s ON s.session_id = t.session_id
WHERE t.timestamp >= ?
GROUP BY s.model
ORDER BY totalCost DESC
```
Returns: `{ model, totalInput, totalOutput, totalCacheRead, totalCacheWrite, totalCost }[]`

### `getPeakHours(db, days)`
```sql
SELECT
  CAST(strftime('%H', t.timestamp) AS INTEGER) AS hour,
  COALESCE(SUM(t.input_tokens + t.output_tokens), 0) AS totalTokens,
  COALESCE(SUM(t.cost_usd), 0) AS totalCost
FROM token_usage t
WHERE t.timestamp >= datetime('now', '-' || ? || ' days')
GROUP BY hour
ORDER BY hour
```
Returns: `{ hour, totalTokens, totalCost }[]` (0-23)

### `getSessionsSummary(db, period)`
```sql
SELECT
  COUNT(*) AS totalSessions,
  COALESCE(AVG(
    (julianday(s.last_seen_at) - julianday(s.started_at)) * 86400000
  ), 0) AS avgDurationMs,
  COALESCE(MAX(
    (julianday(s.last_seen_at) - julianday(s.started_at)) * 86400000
  ), 0) AS longestDurationMs,
  COALESCE(SUM(sub.cost), 0) / NULLIF(COUNT(*), 0) AS avgCostPerSession
FROM sessions s
LEFT JOIN (
  SELECT session_id, SUM(cost_usd) AS cost
  FROM token_usage WHERE timestamp >= ?
  GROUP BY session_id
) sub ON sub.session_id = s.session_id
WHERE s.started_at >= ?
```
Returns: `{ totalSessions, avgDurationMs, longestDurationMs, avgCostPerSession }`

### `getComparison(db, period)`
Runs `getStats` for current period AND previous period (e.g. today vs yesterday, this week vs last week, this month vs last month). Returns both sets of stats so the client can compute deltas.

### `getCostHistory(db, days)`
Same as `getHistory` but returns only `{ date, cost }[]`.

### `getCumulativeCost(db, days)`
Same query as `getCostHistory` but post-processed to add a running total field: `{ date, dailyCost, cumulativeCost }[]`

---

## New React Components

### Enhanced `SummaryCards.tsx`
Add to existing 3 cards:
- **Total Sessions** count (4th card, ctp-yellow accent)
- Each card shows **+/-X%** comparison badge vs previous period (green for decrease in cost, red for increase; green for increase in sessions/tokens)

### `ProjectCosts.tsx`
- Horizontal bar chart (Recharts) showing cost per project
- Sorted descending by cost
- Each bar labeled with project name (basename of path) + cost
- Uses ctp-blue gradient

### `ModelBreakdown.tsx`
- Donut/pie chart showing cost split by model
- Legend with model name, cost, percentage
- Uses distinct Catppuccin colors per model (blue=sonnet, mauve=opus, teal=haiku)

### `PeakHours.tsx`
- 24-column bar chart, X axis 0-23
- Color intensity based on token volume (darker = more usage)
- Tooltip shows hour range + token count + cost

### `SessionStats.tsx`
- Cards showing: total sessions, average duration, longest session, avg cost per session
- Uses ctp-flamingo accent

### `EfficiencyMetrics.tsx`
- Output/Input ratio display (e.g. "4.2x" meaning Claude outputs 4.2 tokens per input token)
- Cache hit rate (cache reads / total input+cache reads)
- Simple metric cards with sparkline-style indicators

### `CostTrendChart.tsx`
- Line chart overlay on daily cost data
- Shows daily cost + cumulative running total as second Y axis
- Dual axis: left = daily cost, right = cumulative

---

## UI Layout Changes

Current layout:
```
[Header]
[Live Sessions]
[Usage Statistics: tabs + 3 summary cards]
[Token History | Token Breakdown]
```

New layout:
```
[Header]
[Live Sessions]
[Usage Statistics: tabs + 4 summary cards with comparison badges]
[Session Stats row: 4 metric cards]
[Efficiency: Output/Input ratio | Cache hit rate]
[Cost per Project | Model Breakdown]
[Cost Trend + Cumulative | Peak Hours]
[Token History | Token Breakdown]
```

All new sections use the same Catppuccin Mocha card styling. Responsive grid — 2 columns on desktop, 1 on mobile.

---

## Implementation Notes

- All new queries use parameterized cutoffs (no SQL string interpolation)
- Period cutoff calculation reused from existing `getStats` helper — extract to shared `getCutoff(period)` utility
- Previous period cutoff: today→yesterday, week→prev 7 days, month→prev 30 days
- Comparison deltas computed client-side from the two period stats objects
- New API routes added to existing `handleApiRequest` in api.ts
- No schema changes — everything derived from existing tables

---

## Verification

1. All new API endpoints return correct JSON
2. Dashboard renders all new sections without console errors
3. Comparison badges show correct +/- percentages
4. Charts render with real data from JSONL ingestion
5. Verify with playwright-cli before handoff
