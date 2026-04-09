/**
 * Lightweight OTLP/HTTP JSON collector that ingests Claude Code telemetry
 * into NDJSON files. Receives metrics, logs/events, and traces.
 *
 * Listens on port 4318 (OTLP HTTP default).
 */

import { mkdirSync, appendFileSync } from "fs";
import { join, resolve } from "path";

const DATA_DIR = resolve(import.meta.dir, "../data");
const EVENTS_PATH = join(DATA_DIR, "otel_events.ndjson");
const METRICS_PATH = join(DATA_DIR, "otel_metrics.ndjson");
const TRACES_PATH = join(DATA_DIR, "otel_traces.ndjson");

mkdirSync(DATA_DIR, { recursive: true });

function flattenAttributes(attrs: any[]): Record<string, any> {
  const result: Record<string, any> = {};
  if (!Array.isArray(attrs)) return result;
  for (const attr of attrs) {
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
            timestamp: dp.timeUnixNano
              ? new Date(Number(dp.timeUnixNano) / 1e6).toISOString()
              : new Date().toISOString(),
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

        const record = {
          timestamp: log.timeUnixNano
            ? new Date(Number(log.timeUnixNano) / 1e6).toISOString()
            : new Date().toISOString(),
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

function processTraces(body: any): number {
  let count = 0;
  const resourceSpans = body.resourceSpans ?? [];
  for (const rs of resourceSpans) {
    const resourceAttrs = flattenAttributes(rs.resource?.attributes ?? []);
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        const attrs = flattenAttributes(span.attributes ?? []);
        const record = {
          trace_id: span.traceId ?? "",
          span_id: span.spanId ?? "",
          parent_span_id: span.parentSpanId ?? "",
          name: span.name ?? "",
          kind: span.kind ?? 0,
          start_time: span.startTimeUnixNano
            ? new Date(Number(span.startTimeUnixNano) / 1e6).toISOString()
            : "",
          end_time: span.endTimeUnixNano
            ? new Date(Number(span.endTimeUnixNano) / 1e6).toISOString()
            : "",
          duration_ms: span.startTimeUnixNano && span.endTimeUnixNano
            ? (Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / 1e6
            : 0,
          status: span.status?.code ?? 0,
          ...resourceAttrs,
          ...attrs,
        };
        appendFileSync(TRACES_PATH, JSON.stringify(record) + "\n");
        count++;
      }
    }
  }
  return count;
}

const port = parseInt(process.env.OTEL_PORT || "4318", 10);

const server = Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);

    // OTLP HTTP endpoints
    if (req.method === "POST") {
      return req.json().then((body) => {
        let count = 0;

        if (url.pathname === "/v1/metrics") {
          count = processMetrics(body);
        } else if (url.pathname === "/v1/logs") {
          count = processLogs(body);
        } else if (url.pathname === "/v1/traces") {
          count = processTraces(body);
        } else {
          return new Response("Not found", { status: 404 });
        }

        return Response.json({ partialSuccess: {} });
      }).catch((err) => {
        console.error("[otel] Parse error:", err);
        return new Response("Bad request", { status: 400 });
      });
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return new Response("OTLP Collector", { status: 200 });
  },
});

console.log(`[otel] OTLP collector listening on http://localhost:${server.port}`);

export { server };
