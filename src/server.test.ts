import { describe, test, expect, afterAll } from "bun:test";
import { initDb } from "./db";
import { handleApiRequest } from "./api";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

const tmpDir = mkdtempSync(join(tmpdir(), "claude-monitor-test-"));
const dbPath = join(tmpDir, "test.db");
const db = initDb(dbPath);

const srcDir = import.meta.dir;
const clientDir = join(srcDir, "client");

// Build client bundle for test server
const buildResult = await Bun.build({
  entrypoints: [join(clientDir, "main.tsx")],
  minify: false,
  target: "browser",
  define: { "process.env.NODE_ENV": JSON.stringify("test") },
});
const clientBundle = buildResult.outputs[0]
  ? await buildResult.outputs[0].text()
  : "";
const themeCSS = await Bun.file(join(clientDir, "theme.css")).text();

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Claude Monitor</title>
  <link rel="stylesheet" href="/_assets/theme.css" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/_assets/bundle.js"></script>
</body>
</html>`;

const server = Bun.serve({
  port: 0,
  fetch(req, server) {
    const apiResponse = handleApiRequest(req, db);
    if (apiResponse) return apiResponse;

    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/_assets/bundle.js") {
      return new Response(clientBundle, {
        headers: { "Content-Type": "application/javascript" },
      });
    }
    if (url.pathname === "/_assets/theme.css") {
      return new Response(themeCSS, {
        headers: { "Content-Type": "text/css" },
      });
    }

    return new Response(indexHtml, {
      headers: { "Content-Type": "text/html" },
    });
  },
  websocket: {
    open() {},
    close() {},
    message() {},
  },
});

const base = `http://localhost:${server.port}`;

afterAll(() => {
  server.stop();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("server", () => {
  test("GET / serves index.html with bundled React app", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Claude Monitor");
    expect(text).toContain("/_assets/bundle.js");
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /api/sessions returns JSON array", async () => {
    const res = await fetch(`${base}/api/sessions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("GET /api/stats/today returns stats object", async () => {
    const res = await fetch(`${base}/api/stats/today`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("totalInput");
    expect(data).toHaveProperty("totalCost");
  });

  test("GET /api/stats/invalid returns 400", async () => {
    const res = await fetch(`${base}/api/stats/invalid`);
    expect(res.status).toBe(400);
  });

  test("unknown path serves index.html (SPA fallback)", async () => {
    const res = await fetch(`${base}/some/random/path`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Claude Monitor");
  });
});
