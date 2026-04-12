#!/usr/bin/env bun
/**
 * Export the Claude Monitor dashboard as a self-contained HTML file.
 * Uses Bun's --target=browser to inline all JS, CSS, and assets.
 *
 * Usage: bun run export
 * Output: ./dashboard.html (works via file:// with no server needed)
 */

import { join, resolve } from "path";

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

if (buildResult.logs.length > 0) {
  console.error("Build warnings:", buildResult.logs);
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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" />
  <style>${themeCSS}</style>
</head>
<body>
  <div id="root"></div>
  <script type="module">${clientBundle}</script>
</body>
</html>`;

await Bun.write(outFile, html);
const sizeKB = Math.round((new Blob([html]).size) / 1024);
console.log(`Exported dashboard to ${outFile} (${sizeKB} KB)`);
