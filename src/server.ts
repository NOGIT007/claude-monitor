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
const indexHtml = await Bun.file(join(srcDir, "index.html")).text();

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

    // Serve static files from src/client/
    if (url.pathname.startsWith("/client/")) {
      const filePath = resolve(srcDir, url.pathname.slice(1));
      if (!filePath.startsWith(clientDir)) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(Bun.file(filePath));
    }

    // SPA fallback — serve index.html
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
