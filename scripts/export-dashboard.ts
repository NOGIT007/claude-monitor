#!/usr/bin/env bun
/**
 * Export a static snapshot of Claude Monitor as a self-contained HTML file.
 * Fetches live data from the running server and bakes it into the HTML so the
 * file works offline via file:// with no server needed after export.
 *
 * Usage: bun run export          (server must be running on PORT, default 3000)
 * Output: ./dashboard.html
 */

import { join, resolve } from "path";

const port = parseInt(process.env.PORT || "3000", 10);
const baseUrl = `http://localhost:${port}`;

// All routes fetched by dashboard components — covers every period/param combo
const SNAPSHOT_ROUTES = [
  "/api/sessions",
  "/api/history?days=30",
  "/api/history/cumulative?days=30",
  "/api/stats/activity-heatmap?weeks=52",
  "/api/usage-snapshots?limit=10",
  ...["today", "week", "month"].flatMap((p) => [
    `/api/stats/${p}`,
    `/api/stats/comparison?period=${p}`,
    `/api/stats/models?period=${p}`,
    `/api/stats/projects?period=${p}`,
    `/api/stats/session-history?period=${p}`,
    `/api/stats/sessions-summary?period=${p}`,
    `/api/stats/thinking-depth?period=${p}`,
    `/api/stats/tools?period=${p}`,
    `/api/stats/tools/timeline?period=${p}`,
    `/api/stats/prompts?period=${p}`,
  ]),
  ...["6", "24", "72"].map((h) => `/api/stats/rate-limits?hours=${h}`),
];

// Verify server is reachable before proceeding
try {
  const ping = await fetch(`${baseUrl}/api/sessions`, { signal: AbortSignal.timeout(3000) });
  if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
} catch {
  console.error(`\nNo server found at ${baseUrl}.`);
  console.error("Start it first:  bun run start");
  console.error("Then re-run:     bun run export\n");
  process.exit(1);
}

console.log(`Snapshotting ${SNAPSHOT_ROUTES.length} routes from ${baseUrl}...`);

// Fetch all routes concurrently
const entries = await Promise.all(
  SNAPSHOT_ROUTES.map(async (route) => {
    try {
      const res = await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [route, null] as const;
      return [route, await res.json()] as const;
    } catch {
      return [route, null] as const;
    }
  }),
);

const routes: Record<string, unknown> = Object.fromEntries(
  entries.filter(([, v]) => v !== null),
);
const snapshot = { capturedAt: new Date().toISOString(), routes };
console.log(`Captured ${Object.keys(routes).length} routes.`);

const srcDir = resolve(import.meta.dir, "../src");
const clientDir = join(srcDir, "client");
const outFile = resolve(import.meta.dir, "../dashboard.html");

// Bundle the React client
const buildResult = await Bun.build({
  entrypoints: [join(clientDir, "main.tsx")],
  minify: true,
  target: "browser",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!buildResult.success) {
  console.error("Build failed:", buildResult.logs);
  process.exit(1);
}

if (buildResult.logs.length > 0) {
  console.warn("Build warnings:", buildResult.logs);
}

const clientBundle = buildResult.outputs[0]
  ? await buildResult.outputs[0].text()
  : "";

if (!clientBundle) {
  console.error("Client build produced empty bundle — aborting.");
  process.exit(1);
}

const themeCSS = await Bun.file(join(clientDir, "theme.css")).text();
const favicon = await Bun.file(join(srcDir, "favicon.svg")).text();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Claude Monitor — Snapshot</title>
  <link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}" />
  <style>${themeCSS}</style>
</head>
<body>
  <div id="root"></div>
  <script>window.__SNAPSHOT__ = ${JSON.stringify(snapshot)};</script>
  <script type="module">${clientBundle}</script>
</body>
</html>`;

await Bun.write(outFile, html);
const sizeKB = Math.round(new Blob([html]).size / 1024);
console.log(`Snapshot exported to ${outFile} (${sizeKB} KB)`);
