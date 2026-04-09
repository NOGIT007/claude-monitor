import { initDb } from "./db";
import { startWatcher } from "./watcher";
import { handleApiRequest } from "./api";
import { handleWsOpen, handleWsClose, handleWsMessage } from "./ws";
import { join, resolve } from "path";

const port = parseInt(process.env.PORT || "3000", 10);
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

const clientBundle = buildResult.outputs[0]
  ? await buildResult.outputs[0].text()
  : "";

if (!clientBundle) {
  console.error("Client build failed:", buildResult.logs);
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
  <link rel="stylesheet" href="/_assets/theme.css" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/_assets/bundle.js"></script>
</body>
</html>`;

const server = Bun.serve({
  port,
  fetch(req, server) {
    const apiResponse = handleApiRequest(req, db);
    if (apiResponse) return apiResponse;

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

console.log(`Claude Monitor running at http://localhost:${server.port}`);

function shutdown() {
  watcher.close();
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { server, db, watcher };
