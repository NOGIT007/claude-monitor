import { initDb } from "./db";
import { startWatcher } from "./watcher";
import { handleApiRequest } from "./api";
import { handleWsOpen, handleWsClose, handleWsMessage } from "./ws";
import { join, resolve } from "path";
import { handleOtelRequest } from "./otel-collector";

const port = parseInt(process.env.PORT || "3000", 10);
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}
const db = initDb();
const watcher = startWatcher({ db });

const srcDir = import.meta.dir;
const clientDir = resolve(srcDir, "client");

// Build the React client bundle in-memory
const buildResult = await Bun.build({
  entrypoints: [join(clientDir, "main.tsx")],
  minify: false,
  target: "browser",
  define: {
    "process.env.NODE_ENV": JSON.stringify("development"),
  },
});

if (buildResult.outputs.length === 0 || buildResult.logs.length > 0) {
  console.error("Client build failed:", buildResult.logs);
}

const clientBundle = buildResult.outputs[0]
  ? await buildResult.outputs[0].text()
  : "";

if (!clientBundle) {
  console.error("Client build produced empty bundle — exiting.");
  process.exit(1);
}

// Read CSS and favicon
const themeCSS = await Bun.file(join(clientDir, "theme.css")).text();
const favicon = await Bun.file(join(srcDir, "favicon.svg")).text();

// Serve bundle and CSS as separate files, reference from HTML
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Claude Monitor</title>
  <link rel="icon" type="image/svg+xml" href="/_assets/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" />
  <link rel="stylesheet" href="/_assets/theme.css" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/_assets/bundle.js"></script>
</body>
</html>`;

const server = Bun.serve({
  port,
  async fetch(req, server) {
    const apiResponse = handleApiRequest(req, db);
    if (apiResponse) return apiResponse;

    const otelResponse = await handleOtelRequest(req, db);
    if (otelResponse) return otelResponse;

    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Serve built assets
    if (url.pathname === "/_assets/bundle.js") {
      return new Response(clientBundle, {
        headers: { "Content-Type": "application/javascript" },
      });
    }
    if (url.pathname === "/_assets/favicon.svg" || url.pathname === "/favicon.ico") {
      return new Response(favicon, {
        headers: { "Content-Type": "image/svg+xml" },
      });
    }
    if (url.pathname === "/_assets/theme.css") {
      return new Response(themeCSS, {
        headers: { "Content-Type": "text/css" },
      });
    }

    // SPA fallback
    return new Response(indexHtml, {
      headers: { "Content-Type": "text/html" },
    });
  },
  websocket: {
    open: handleWsOpen,
    close: handleWsClose,
    message: handleWsMessage,
  },
});

// Also accept OTEL on the standard OTLP port (4318) so Claude Code's default
// OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 works without configuration.
const OTEL_PORT = 4318;
try {
  Bun.serve({
    port: OTEL_PORT,
    async fetch(req) {
      const otelResponse = await handleOtelRequest(req, db);
      if (otelResponse) return otelResponse;
      return new Response("Not found", { status: 404 });
    },
  });
  console.log(`OTEL collector listening at http://localhost:${OTEL_PORT}`);
} catch {
  console.warn(`[otel] Port ${OTEL_PORT} in use — OTEL only available on port ${port}`);
}

console.log(`Claude Monitor running at http://localhost:${server.port}`);

function shutdown() {
  watcher.close();
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { server, db, watcher };
