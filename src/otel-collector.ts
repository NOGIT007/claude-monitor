/**
 * OTLP/HTTP JSON collector that ingests Claude Code telemetry into SQLite.
 * Exposes handleOtelRequest(req, db) for embedding in the main server.
 * Metrics and logs still write to NDJSON files for diagnostics.
 */

import { mkdirSync, appendFileSync } from "fs";
import { join, resolve } from "path";
import { Database } from "bun:sqlite";
import {
  insertOtelSpan,
  insertOtelToolCall,
  insertOtelPrompt,
} from "./db";

const DATA_DIR = resolve(import.meta.dir, "../data");
const EVENTS_PATH = join(DATA_DIR, "otel_events.ndjson");
const METRICS_PATH = join(DATA_DIR, "otel_metrics.ndjson");

mkdirSync(DATA_DIR, { recursive: true });

function safeTimestamp(nanoStr: string | undefined): string {
  if (!nanoStr) return new Date().toISOString();
  const ms = Number(nanoStr) / 1e6;
  if (isNaN(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function flattenAttributes(attrs: any[]): Record<string, any> {
  const result: Record<string, any> = {};
  if (!Array.isArray(attrs)) return result;
  for (const attr of attrs) {
    if (!attr || !attr.key) continue;
    const key = attr.key;
    const val = attr.value;
    if (!val) continue;
    if (val.stringValue !== undefined) result[key] = val.stringValue;
    else if (val.intValue !== undefined) result[key] = Number(val.intValue);
    else if (val.doubleValue !== undefined) result[key] = val.doubleValue;
    else if (val.boolValue !== undefined) result[key] = val.boolValue;
  }
  return result;
}

function processMetrics(body: any): number {
  let count = 0;
  const resourceMetrics = body.resourceMetrics ?? [];
  for (const rm of resourceMetrics) {
    const resourceAttrs = flattenAttributes(rm.resource?.attributes ?? []);
    const scopeMetrics = rm.scopeMetrics ?? [];
    for (const sm of scopeMetrics) {
      for (const metric of sm.metrics ?? []) {
        const name = metric.name;
        const dataPoints =
          metric.sum?.dataPoints ??
          metric.gauge?.dataPoints ??
          metric.histogram?.dataPoints ??
          [];
        for (const dp of dataPoints) {
          const attrs = flattenAttributes(dp.attributes ?? []);
          const record = {
            timestamp: safeTimestamp(dp.timeUnixNano),
            metric: name,
            value: dp.asDouble ?? dp.asInt ?? dp.value ?? 0,
            ...resourceAttrs,
            ...attrs,
          };
          appendFileSync(METRICS_PATH, JSON.stringify(record) + "\n");
          count++;
        }
      }
    }
  }
  return count;
}

function processLogs(body: any): number {
  let count = 0;
  const resourceLogs = body.resourceLogs ?? [];
  for (const rl of resourceLogs) {
    const resourceAttrs = flattenAttributes(rl.resource?.attributes ?? []);
    for (const sl of rl.scopeLogs ?? []) {
      for (const log of sl.logRecords ?? []) {
        const attrs = flattenAttributes(log.attributes ?? []);
        const eventName = attrs["event.name"] ?? "unknown";

        const record: Record<string, any> = {
          timestamp: safeTimestamp(log.timeUnixNano),
          event: eventName,
          severity: log.severityText ?? "",
          ...resourceAttrs,
          ...attrs,
        };

        // Parse body if it's a string value
        if (log.body?.stringValue) {
          try {
            const bodyData = JSON.parse(log.body.stringValue);
            Object.assign(record, bodyData);
          } catch {
            record.body = log.body.stringValue;
          }
        }

        appendFileSync(EVENTS_PATH, JSON.stringify(record) + "\n");
        count++;
      }
    }
  }
  return count;
}

function processTraces(db: Database, body: any): number {
  let count = 0;
  const resourceSpans = body.resourceSpans ?? [];
  for (const rs of resourceSpans) {
    const resourceAttrs = flattenAttributes(rs.resource?.attributes ?? []);
    const sessionId: string = resourceAttrs["session.id"] ?? "";

    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        const spanAttrs = flattenAttributes(span.attributes ?? []);
        const startTime = safeTimestamp(span.startTimeUnixNano);
        const endTime = safeTimestamp(span.endTimeUnixNano);
        const durationMs =
          span.startTimeUnixNano && span.endTimeUnixNano
            ? (Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / 1e6
            : 0;

        // Insert the span itself
        insertOtelSpan(db, {
          spanId: span.spanId ?? "",
          traceId: span.traceId ?? "",
          parentSpanId: span.parentSpanId ?? "",
          sessionId,
          name: span.name ?? "",
          kind: span.kind ?? 0,
          startTime,
          endTime,
          durationMs,
          status: span.status?.code ?? 0,
          attributes: JSON.stringify(spanAttrs),
        });

        // Extract tool call if span has tool.name or name includes "tool"
        if (spanAttrs["tool.name"] !== undefined || (span.name ?? "").includes("tool")) {
          const toolName: string = spanAttrs["tool.name"] ?? span.name ?? "";
          const inputSummary = String(spanAttrs["tool.input"] ?? "").slice(0, 1000);
          const outputSummary = String(spanAttrs["tool.output"] ?? "").slice(0, 1000);

          insertOtelToolCall(db, {
            spanId: span.spanId ?? "",
            sessionId,
            toolName,
            timestamp: startTime,
            durationMs,
            inputSummary,
            outputSummary,
            status: span.status?.code ?? 0,
          });
        }

        // Extract prompt if span has user.prompt attribute
        if (spanAttrs["user.prompt"] !== undefined) {
          const promptText = String(spanAttrs["user.prompt"]).slice(0, 1000);
          const tokenCount = Number(spanAttrs["user.prompt.token_count"] ?? 0);

          insertOtelPrompt(db, {
            spanId: span.spanId ?? "",
            sessionId,
            timestamp: startTime,
            promptText,
            tokenCount,
          });
        }

        count++;
      }
    }
  }
  return count;
}

export async function handleOtelRequest(
  req: Request,
  db: Database,
): Promise<Response | null> {
  const url = new URL(req.url);
  const { pathname } = url;

  if (req.method !== "POST") return null;

  if (
    pathname !== "/v1/traces" &&
    pathname !== "/v1/metrics" &&
    pathname !== "/v1/logs"
  ) {
    return null;
  }

  try {
    const body = await req.json();

    if (pathname === "/v1/traces") {
      processTraces(db, body);
    } else if (pathname === "/v1/metrics") {
      processMetrics(body);
    } else if (pathname === "/v1/logs") {
      processLogs(body);
    }

    return Response.json({ partialSuccess: {} });
  } catch (err) {
    console.error("[otel] Parse error:", err);
    return new Response("Bad request", { status: 400 });
  }
}
