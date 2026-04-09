import { describe, test, expect, afterAll } from "bun:test";
import { initDb } from "./db";
import { handleApiRequest } from "./api";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

const tmpDir = mkdtempSync(join(tmpdir(), "claude-monitor-test-"));
const dbPath = join(tmpDir, "test.db");
const db = initDb(dbPath);

const srcDir = join(import.meta.dir);
const indexHtml = await Bun.file(join(srcDir, "index.html")).text();

const server = Bun.serve({
  port: 0, // random available port
  fetch(req, server) {
    const apiResponse = handleApiRequest(req, db);
    if (apiResponse) return apiResponse;

    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname.startsWith("/client/")) {
      const filePath = join(srcDir, url.pathname);
      return new Response(Bun.file(filePath));
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
  test("GET / serves index.html", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Claude Monitor");
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

  test("GET /client/theme.css serves CSS file", async () => {
    const res = await fetch(`${base}/client/theme.css`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });
});
