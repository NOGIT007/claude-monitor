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

// Read CSS
const themeCSS = await Bun.file(join(clientDir, "theme.css")).text();

// Inline everything into a single HTML response
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Claude Monitor</title>
  <style>${themeCSS}</style>
</head>
<body>
  <div id="root"></div>
  <script type="module">${clientBundle}</script>
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

    // SPA fallback — serve index.html with inlined bundle
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
